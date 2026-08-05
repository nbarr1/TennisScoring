import * as functions from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

// Set ALLOWED_EMAIL_DOMAIN to restrict self-registration to a single corporate domain
// (e.g. "@yourcompany.com"). Production fails closed when this is blank.
const allowedEmailDomain = defineString('ALLOWED_EMAIL_DOMAIN', { default: '@gevernova.com' });

export const onUserCreated = functions.identity.beforeUserCreated(async (event) => {
  const domain = allowedEmailDomain.value().trim().toLowerCase();
  if (!domain) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Registration is disabled until ALLOWED_EMAIL_DOMAIN is configured.',
    );
  }

  const authEmail = (event.data?.email ?? '').toLowerCase();
  const normalizedDomain = domain.startsWith('@') ? domain : `@${domain}`;
  if (!authEmail.endsWith(normalizedDomain)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Registration is restricted to ${normalizedDomain} email addresses.`,
    );
  }

  const db = getFirestore();
  const user = event.data;
  if (!user) return;

  const uid = user.uid;
  const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Player';
  const email = user.email ?? '';
  const avatarUrl = user.photoURL ?? null;
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();

  // Private user document (PII)
  batch.set(db.collection('users').doc(uid), {
    id: uid,
    displayName,
    email,
    phone: user.phoneNumber ?? null,
    avatarUrl,
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
    createdAt: now,
    updatedAt: now,
  });

  // Public profile document (Non-PII)
  batch.set(db.collection('profiles').doc(uid), {
    id: uid,
    displayName,
    avatarUrl,
    divisionId: null,
    role: 'player',
    updatedAt: now,
  });

  await batch.commit();
});
