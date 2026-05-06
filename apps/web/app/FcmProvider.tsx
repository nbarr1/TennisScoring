'use client';

import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getMessagingIfSupported, registerFcmToken, useAuthUser } from '@tennis/firebase-client';

const NOTIFICATION_OPT_IN_KEY = 'tennis-notifications-opt-in';

export function FcmProvider() {
  const { firebaseUser } = useAuthUser();
  const [optInVersion, setOptInVersion] = useState(0);

  useEffect(() => {
    const handleOptIn = () => setOptInVersion((version) => version + 1);
    window.addEventListener('tennis-notifications-opt-in', handleOptIn);
    return () => window.removeEventListener('tennis-notifications-opt-in', handleOptIn);
  }, []);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const uid = firebaseUser.uid;

    let unsubscribeForeground: (() => void) | undefined;

    async function setup() {
      if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
      if (window.localStorage.getItem(NOTIFICATION_OPT_IN_KEY) !== 'true') return;

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

      unsubscribeForeground = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? 'Tennis League';
        const body = payload.notification?.body ?? '';
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon-192.png' });
        }
      });
    }

    setup().catch(() => {});
    return () => unsubscribeForeground?.();
  }, [firebaseUser?.uid, optInVersion]);

  return null;
}
