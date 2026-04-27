import * as functions from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export const onUserCreated = functions.identity.beforeUserCreated(async (event) => {
  const db = getFirestore();
  const user = event.data;
  if (!user) return;

  await db.collection('users').doc(user.uid).set({
    id: user.uid,
    displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Player',
    email: user.email ?? '',
    phone: user.phoneNumber ?? null,
    avatarUrl: user.photoURL ?? null,
    contactPreferences: {
      allowEmail: true,
      allowSMS: false,
      allowInApp: true,
    },
    divisionId: null,
    role: 'player',
    fcmTokens: [],
    tipsEnabled: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
});
