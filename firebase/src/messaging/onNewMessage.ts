import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { Message, Channel } from '@tennis/shared';
import { sendPushToUsers } from '../notifications/push';

if (!getApps().length) initializeApp();

export const onNewMessage = functions.firestore.onDocumentCreated(
  'channels/{channelId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data() as Message | undefined;
    if (!message) return;

    const db = getFirestore();
    const channelSnap = await db.collection('channels').doc(event.params.channelId).get();
    const channel = channelSnap.data() as Channel | undefined;
    if (!channel) return;

    // Update channel's lastMessage
    await channelSnap.ref.update({
      lastMessage: {
        content: message.content,
        senderId: message.senderId,
        senderName: message.senderName,
        timestamp: message.createdAt,
      },
    });

    // Notify all participants except the sender. Blocking is otherwise a
    // client-side filter, so without this check a blocked sender's message
    // still reached the blocker's lock screen as a push notification.
    const recipientIds = channel.participantIds.filter((id) => id !== message.senderId);
    if (recipientIds.length === 0) return;

    await sendPushToUsers(
      db,
      recipientIds,
      {
        notification: {
          title: message.senderName,
          body: message.content.length > 100 ? message.content.slice(0, 97) + '...' : message.content,
        },
        data: {
          type: 'message',
          channelId: event.params.channelId,
          messageId: event.params.messageId,
        },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      },
      (recipient) =>
        Array.isArray(recipient.blockedUserIds) && recipient.blockedUserIds.includes(message.senderId),
    );
  }
);
