import { useEffect, useState } from 'react';
import { addDoc, arrayRemove, arrayUnion, deleteDoc, onSnapshot, updateDoc, type FirestoreError } from 'firebase/firestore';
import { divisionMessageReportsQuery, messageDoc, messageReportDoc, messageReportsCol, userDoc } from './collections';
import type { Message, MessageReport, MessageReportReason } from '@tennis/shared';

export async function reportMessage(params: {
  channelId: string;
  message: Message;
  reportedBy: string;
  reason: MessageReportReason;
  note?: string;
  divisionId?: string;
}): Promise<void> {
  const { channelId, message, reportedBy, reason, note, divisionId } = params;
  await addDoc(messageReportsCol(), {
    channelId,
    messageId: message.id,
    messageContent: message.content,
    messageSenderId: message.senderId,
    messageSenderName: message.senderName,
    reportedBy,
    reason,
    ...(note?.trim() ? { note: note.trim() } : {}),
    status: 'pending',
    ...(divisionId ? { divisionId } : {}),
    createdAt: Date.now(),
  } as MessageReport);
}

export function useDivisionMessageReports(
  divisionId: string | null | undefined,
): { reports: MessageReport[]; loading: boolean; error: FirestoreError | null } {
  const [reports, setReports] = useState<MessageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!divisionId) {
      setReports([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(
      divisionMessageReportsQuery(divisionId),
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageReport, 'id'>) })));
        setLoading(false);
      },
      (snapshotError) => {
        setReports([]);
        setError(snapshotError);
        setLoading(false);
      },
    );
    return unsub;
  }, [divisionId]);

  return { reports, loading, error };
}

export async function resolveMessageReport(
  report: MessageReport,
  resolvedBy: string,
  action: 'dismiss' | 'remove',
): Promise<void> {
  if (action === 'remove') {
    await deleteDoc(messageDoc(report.channelId, report.messageId));
  }
  await updateDoc(messageReportDoc(report.id), {
    status: action === 'remove' ? 'removed' : 'dismissed',
    resolvedBy,
    resolvedAt: Date.now(),
  });
}

export async function blockUser(uid: string, blockedUserId: string): Promise<void> {
  await updateDoc(userDoc(uid), { blockedUserIds: arrayUnion(blockedUserId), updatedAt: Date.now() });
}

export async function unblockUser(uid: string, blockedUserId: string): Promise<void> {
  await updateDoc(userDoc(uid), { blockedUserIds: arrayRemove(blockedUserId), updatedAt: Date.now() });
}
