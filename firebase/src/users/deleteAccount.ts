import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();

/**
 * HTTPS callable: the signed-in user permanently deletes their own account.
 *
 * Division leaders must transfer leadership first — deleting a leader's
 * account would otherwise orphan their division's roster/invite management.
 *
 * Personal data (name, email, phone, contact preferences, availability, FCM
 * tokens) is scrubbed from users/{uid} and profiles/{uid}; the doc itself is
 * kept (rather than deleted) so historical match/ranking records that
 * reference the uid keep resolving to a "Deleted User" placeholder instead
 * of a dangling reference.
 */
export const deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  const [userSnap, leaderDivisionsSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('divisions').where('leaderIds', 'array-contains', uid).get(),
  ]);

  if (!leaderDivisionsSnap.empty) {
    throw new HttpsError(
      'failed-precondition',
      'Transfer division leadership to another player before deleting your account.',
    );
  }

  const user = userSnap.data();
  const divisionId = typeof user?.divisionId === 'string' ? user.divisionId : undefined;
  const now = Date.now();

  const batch = db.batch();

  batch.set(
    db.collection('users').doc(uid),
    {
      displayName: 'Deleted User',
      email: `deleted-${uid}@deleted.tennisleague.app`,
      phone: FieldValue.delete(),
      avatarUrl: FieldValue.delete(),
      contactPreferences: { allowEmail: false, allowSMS: false, allowInApp: false },
      availability: FieldValue.delete(),
      fcmTokens: [],
      blockedUserIds: FieldValue.delete(),
      divisionId: FieldValue.delete(),
      isRegistered: false,
      accountDeleted: true,
      deletedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    db.collection('profiles').doc(uid),
    {
      displayName: 'Deleted User',
      avatarUrl: FieldValue.delete(),
      updatedAt: now,
    },
    { merge: true },
  );

  if (divisionId) {
    batch.update(db.collection('divisions').doc(divisionId), {
      playerIds: FieldValue.arrayRemove(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  await getAuth().deleteUser(uid);

  return { success: true };
});
