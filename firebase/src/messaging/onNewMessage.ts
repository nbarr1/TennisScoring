import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { Message, Channel } from '@tennis/shared';

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

    // Notify all participants except the sender
    const recipientIds = channel.participantIds.filter((id) => id !== message.senderId);
    if (recipientIds.length === 0) return;

    const userSnaps = await Promise.all(
      recipientIds.map((id) => db.collection('users').doc(id).get())
    );

    const tokens: string[] = [];
    for (const snap of userSnaps) {
      const user = snap.data();
      if (user?.fcmTokens?.length) {
        tokens.push(...user.fcmTokens);
      }
    }

    if (tokens.length === 0) return;

    await getMessaging().sendEachForMulticast({
      tokens,
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
    });
  }
);
