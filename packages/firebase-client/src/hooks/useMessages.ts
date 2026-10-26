import { useState, useEffect, useRef } from "react";
import {
  onSnapshot,
  addDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type QuerySnapshot,
} from "firebase/firestore";
import {
  MESSAGE_PAGE_SIZE,
  channelDoc,
  channelMessagesQuery,
  channelsCol,
  messagesCol,
  userChannelsQuery,
} from "../collections";
import { db } from "../config";
import type { Message, Channel } from "@tennis/shared";

/**
 * The messages in a `channelMessagesQuery()` snapshot, oldest first.
 *
 * The query reads newest first so that its limit keeps the latest page; this
 * restores chronological order, which is what both message screens render.
 */
export function messagesFromSnapshot(snap: QuerySnapshot<Message>): Message[] {
  return snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Message, "id">),
    }))
    .reverse();
}

/**
 * A conversation's messages, oldest first, live. It starts with the newest
 * `MESSAGE_PAGE_SIZE` and `loadOlder()` adds a page at a time.
 *
 * Loading older messages widens the one live query rather than fetching older
 * pages separately. A separate page would stop at the message the live window
 * started at, and once new messages pushed that message out of the window it
 * would be in neither, leaving a gap; it would also miss a moderator removing
 * an older message. The cost is that each widening re-reads the loaded
 * messages once.
 */
export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // The limit belongs to one channel, so opening another starts at one page.
  const [page, setPage] = useState({ channelId, limit: MESSAGE_PAGE_SIZE });
  const messageLimit = page.channelId === channelId ? page.limit : MESSAGE_PAGE_SIZE;
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Set by loadOlder(): the next subscription widens the one on screen, so it
  // keeps showing the loaded messages instead of the loading state.
  const widening = useRef(false);

  useEffect(() => {
    if (!channelId) {
      setError(null);
      setLoading(false);
      return;
    }
    const isWidening = widening.current;
    widening.current = false;
    if (!isWidening) setLoading(true);
    setError(null);
    let first = true;
    const unsub = onSnapshot(
      channelMessagesQuery(channelId, messageLimit),
      // Metadata changes too, so the server confirming a cached result is
      // delivered even when no message changed (see hasOlder below).
      { includeMetadataChanges: true },
      (snap) => {
        // The cache can answer a widened query with fewer messages than are
        // on screen; wait for the server rather than drop them for a moment.
        // Offline that wait lasts until the connection returns, and the
        // loaded messages stay on screen meanwhile.
        if (isWidening && first && snap.metadata.fromCache && snap.size < messageLimit) return;
        // A metadata-only change leaves the messages as they are, so the
        // bubbles keep their identity and do not re-render.
        if (first || snap.docChanges().length > 0) setMessages(messagesFromSnapshot(snap));
        first = false;
        // A full page means there may be more. A cached snapshot of a widened
        // query can come back short before the server answers, so only the
        // server's answer may say there is nothing older.
        const full = snap.size >= messageLimit;
        if (full || !snap.metadata.fromCache) setHasOlder(full);
        setLoadingOlder(false);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoadingOlder(false);
        setLoading(false);
      },
    );
    return unsub;
  }, [channelId, messageLimit, retryCount]);

  return {
    messages,
    loading,
    error,
    hasOlder,
    loadingOlder,
    loadOlder: () => {
      if (!channelId || loadingOlder || !hasOlder) return;
      widening.current = true;
      setLoadingOlder(true);
      setPage({ channelId, limit: messageLimit + MESSAGE_PAGE_SIZE });
    },
    retry: () => setRetryCount((count) => count + 1),
  };
}

export function useChannels(userId: string | null) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(
      userChannelsQuery(userId),
      (snap) => {
        setChannels(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Channel, "id">),
          })),
        );
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, [userId, retryCount]);

  return {
    channels,
    loading,
    error,
    retry: () => setRetryCount((count) => count + 1),
  };
}

export async function sendMessage(params: {
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  sharedContact?: { phone?: string; email?: string };
}): Promise<void> {
  const { channelId, senderId, senderName, content, sharedContact } = params;
  await addDoc(messagesCol(channelId), {
    channelId,
    senderId,
    senderName,
    content,
    type: sharedContact ? "contact_share" : "text",
    sharedContact: sharedContact ?? null,
    readBy: [senderId],
    createdAt: Date.now(),
  } as Message);
}

export async function getOrCreateDM(
  user1Id: string,
  user2Id: string,
): Promise<Channel> {
  const sorted = [user1Id, user2Id].sort();
  const q = query(
    channelsCol(),
    where("type", "==", "direct"),
    where("participantIds", "==", sorted),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as Omit<Channel, "id">) };
  }
  const data: Omit<Channel, "id"> = {
    type: "direct",
    participantIds: sorted,
    createdAt: Date.now(),
  };
  const ref = await addDoc(channelsCol(), data as Channel);
  return { id: ref.id, ...data };
}

export async function deleteDirectChannel(channelId: string): Promise<void> {
  const snap = await getDocs(messagesCol(channelId));
  const refs = snap.docs.map((docSnap) => docSnap.ref);

  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  const finalBatch = writeBatch(db);
  finalBatch.delete(channelDoc(channelId));
  await finalBatch.commit();
}
