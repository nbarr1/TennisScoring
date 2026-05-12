import * as functions from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

// Set ALLOWED_EMAIL_DOMAIN to restrict self-registration to a single corporate domain
// (e.g. "@yourcompany.com"). Leave blank to allow any email address.
const allowedEmailDomain = defineString('ALLOWED_EMAIL_DOMAIN', { default: '' });

export const onUserCreated = functions.identity.beforeUserCreated(async (event) => {
  const domain = allowedEmailDomain.value().trim().toLowerCase();
  if (domain) {
    const email = (event.data?.email ?? '').toLowerCase();
    const normalizedDomain = domain.startsWith('@') ? domain : `@${domain}`;
    if (!email.endsWith(normalizedDomain)) {
      throw new functions.auth.HttpsError(
        'permission-denied',
        `Registration is restricted to ${normalizedDomain} email addresses.`,
      );
    }
  }

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
    isRegistered: true,
    inviteStatus: 'registered',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
});
