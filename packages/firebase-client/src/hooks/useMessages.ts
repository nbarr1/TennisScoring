import { useState, useEffect } from 'react';
import { onSnapshot, addDoc, serverTimestamp, updateDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { channelMessagesQuery, channelsCol, messagesCol, userChannelsQuery } from '../collections';
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

export async function getOrCreateDM(user1Id: string, user2Id: string): Promise<string> {
  const threadId = [user1Id, user2Id].sort().join('_');
  const q = query(channelsCol(), where('type', '==', 'direct'), where('participantIds', '==', [user1Id, user2Id].sort()));
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;

  const ref = await addDoc(channelsCol(), {
    type: 'direct',
    participantIds: [user1Id, user2Id].sort(),
    createdAt: Date.now(),
  } as Channel);
  return ref.id;
}
