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

  // Detach from every division the account is rostered in, not only the
  // active one: a player can belong to several, and the others kept listing a
  // deleted account on their rosters and in their group chats.
  const [rosteredDivisions, channels] = await Promise.all([
    db.collection('divisions').where('playerIds', 'array-contains', uid).get(),
    db.collection('channels').where('participantIds', 'array-contains', uid).get(),
  ]);
  const divisionIds = new Set([
    ...rosteredDivisions.docs.map((doc) => doc.id),
    ...(divisionId ? [divisionId] : []),
  ]);
  for (const id of divisionIds) {
    batch.update(db.collection('divisions').doc(id), {
      playerIds: FieldValue.arrayRemove(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  // Division group chats only. Direct conversations are left intact so the
  // other participant keeps their history.
  channels.docs
    .filter((doc) => doc.data().type === 'division')
    .forEach((doc) => batch.update(doc.ref, { participantIds: FieldValue.arrayRemove(uid) }));

  const memberships = await Promise.all(
    [...divisionIds].map((id) =>
      db
        .collection('divisions')
        .doc(id)
        .collection('memberships')
        .where('userId', '==', uid)
        .where('status', 'in', ['active', 'waitlisted'])
        .get(),
    ),
  );
  memberships
    .flatMap((snap) => snap.docs)
    .forEach((doc) =>
      batch.set(
        doc.ref,
        { status: 'removed', removedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
    );

  await batch.commit();
  await getAuth().deleteUser(uid);

  return { success: true };
});
