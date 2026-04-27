'use client';

import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getMessagingIfSupported, registerFcmToken, useAuthUser } from '@tennis/firebase-client';

export function FcmProvider() {
  const { firebaseUser } = useAuthUser();

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const uid = firebaseUser.uid;

    async function setup() {
      if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

      const messaging = await getMessagingIfSupported();
      if (!messaging) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) return;

      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
      if (token) await registerFcmToken(uid, token);

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? 'Tennis League';
        const body = payload.notification?.body ?? '';
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon-192.png' });
        }
      });
    }

    setup().catch(() => {});
  }, [firebaseUser?.uid]);

  return null;
}
