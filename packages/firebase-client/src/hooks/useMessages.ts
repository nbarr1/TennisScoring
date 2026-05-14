import { useState, useEffect } from 'react';
import { onSnapshot, addDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { channelDoc, channelMessagesQuery, channelsCol, messagesCol, userChannelsQuery } from '../collections';
import { db } from '../config';
import type { Message, Channel } from '@tennis/shared';

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      channelMessagesQuery(channelId),
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, 'id'>) })));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [channelId]);

  return { messages, loading, error };
}

export function useChannels(userId: string | null) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      userChannelsQuery(userId),
      (snap) => {
        setChannels(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Channel, 'id'>) })));
        setLoading(false);
      }
    );
    return unsub;
  }, [userId]);

  return { channels, loading };
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
    type: sharedContact ? 'contact_share' : 'text',
    sharedContact: sharedContact ?? null,
    readBy: [senderId],
    createdAt: Date.now(),
  } as Message);
}

export async function getOrCreateDM(user1Id: string, user2Id: string): Promise<Channel> {
  const sorted = [user1Id, user2Id].sort();
  const q = query(channelsCol(), where('type', '==', 'direct'), where('participantIds', '==', sorted));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as Omit<Channel, 'id'>) };
  }
  const data: Omit<Channel, 'id'> = {
    type: 'direct',
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
