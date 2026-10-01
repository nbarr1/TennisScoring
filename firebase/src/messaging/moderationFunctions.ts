import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isAdminRole } from '@tennis/shared';

if (!getApps().length) initializeApp();

type ResolveMessageReportInput = {
  reportId?: unknown;
  action?: unknown;
};

/**
 * HTTPS callable: a division leader or admin resolves a pending message report,
 * either dismissing it or removing the reported message.
 *
 * Removal runs here, with the Admin SDK, because the rules cannot authorize it
 * for direct messages: those channels carry no divisionId, so a leader is
 * neither a participant nor a leader of the channel, and the client-side delete
 * was always denied. The report then stayed pending forever.
 */
export const resolveMessageReport = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to resolve reports.');
  }
  const { reportId, action } = (request.data ?? {}) as ResolveMessageReportInput;
  if (typeof reportId !== 'string' || !reportId.trim() || (action !== 'dismiss' && action !== 'remove')) {
    throw new HttpsError('invalid-argument', 'A report id and an action of dismiss or remove are required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  const reportRef = db.collection('messageReports').doc(reportId.trim());
  const reportSnap = await reportRef.get();
  const report = reportSnap.data();
  if (!report) {
    throw new HttpsError('not-found', 'Report not found.');
  }
  if (report.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This report has already been resolved.');
  }

  const [actorSnap, divisionSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    typeof report.divisionId === 'string' && report.divisionId
      ? db.collection('divisions').doc(report.divisionId).get()
      : Promise.resolve(null),
  ]);
  const leaderIds: unknown = divisionSnap?.data()?.leaderIds;
  const isLeader = Array.isArray(leaderIds) && leaderIds.includes(uid);
  if (!isAdminRole(actorSnap.data()?.role) && !isLeader) {
    throw new HttpsError('permission-denied', 'Only division leaders and admins can resolve reports.');
  }

  const resolvedAt = Date.now();
  if (action === 'remove') {
    const channelRef = db.collection('channels').doc(report.channelId);
    await channelRef.collection('messages').doc(report.messageId).delete();

    // The channel list previews lastMessage, which would otherwise keep showing
    // the removed text.
    const channel = (await channelRef.get()).data();
    const last = channel?.lastMessage;
    if (last && last.senderId === report.messageSenderId && last.content === report.messageContent) {
      const latest = await channelRef.collection('messages').orderBy('createdAt', 'desc').limit(1).get();
      const next = latest.docs[0]?.data();
      await channelRef.update({
        lastMessage: next
          ? {
              content: next.content,
              senderId: next.senderId,
              senderName: next.senderName,
              timestamp: next.createdAt,
            }
          : FieldValue.delete(),
      });
    }

    // Other pending reports of the same message are settled by its removal.
    const siblings = await db
      .collection('messageReports')
      .where('channelId', '==', report.channelId)
      .where('messageId', '==', report.messageId)
      .where('status', '==', 'pending')
      .get();
    const batch = db.batch();
    siblings.docs.forEach((doc) => {
      if (doc.id !== reportRef.id) {
        batch.update(doc.ref, { status: 'removed', resolvedBy: uid, resolvedAt });
      }
    });
    await batch.commit();
  }

  await reportRef.update({
    status: action === 'remove' ? 'removed' : 'dismissed',
    resolvedBy: uid,
    resolvedAt,
  });
  return { success: true };
});
