import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { randomInt } from 'node:crypto';

if (!getApps().length) initializeApp();

type CreateDivisionInput = {
  name?: string;
  displayName?: string;
  email?: string;
};

type JoinDivisionInput = {
  inviteCode?: string;
};

type AddPlayerInput = {
  divisionId?: string;
  email?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }
  return code;
}

async function uniqueInviteCode(
  db: FirebaseFirestore.Firestore,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomInviteCode();
    const existing = await db
      .collection('divisions')
      .where('inviteCode', '==', code)
      .limit(1)
      .get();
    if (existing.empty) return code;
  }
  throw new HttpsError('internal', 'Could not generate a unique invite code.');
}

async function addUserToDivisionChannel(
  db: FirebaseFirestore.Firestore,
  divisionId: string,
  uid: string,
) {
  const channels = await db
    .collection('channels')
    .where('type', '==', 'division')
    .where('divisionId', '==', divisionId)
    .limit(1)
    .get();

  if (!channels.empty) {
    await channels.docs[0].ref.update({
      participantIds: FieldValue.arrayUnion(uid),
    });
  }
}

async function requireDivisionLeaderOrAdmin(
  db: FirebaseFirestore.Firestore,
  uid: string,
  divisionId: string,
) {
  const [userSnap, divisionSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('divisions').doc(divisionId).get(),
  ]);

  if (!divisionSnap.exists) {
    throw new HttpsError('not-found', 'Division not found.');
  }

  const isAdmin = userSnap.data()?.role === 'admin';
  const isLeader = (divisionSnap.data()?.leaderIds ?? []).includes(uid);
  if (!isAdmin && !isLeader) {
    throw new HttpsError(
      'permission-denied',
      'Only division leaders can manage players.',
    );
  }

  return divisionSnap;
}

export const createDivision = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to create a division.',
    );
  }

  const { name, displayName, email } = (request.data ??
    {}) as CreateDivisionInput;
  const safeName = name?.trim();
  if (!safeName) {
    throw new HttpsError('invalid-argument', 'Division name is required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  const now = FieldValue.serverTimestamp();
  const inviteCode = await uniqueInviteCode(db);

  const divisionRef = db.collection('divisions').doc();
  const channelRef = db.collection('channels').doc();

  await db.runTransaction(async (tx) => {
    tx.set(divisionRef, {
      name: safeName,
      inviteCode,
      leaderIds: [uid],
      playerIds: [uid],
      createdAt: now,
      updatedAt: now,
    });

    tx.set(
      db.collection('users').doc(uid),
      {
        ...(displayName ? { displayName } : {}),
        ...(email ? { email: normalizeEmail(email) } : {}),
        divisionId: divisionRef.id,
        role: 'division_leader',
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(channelRef, {
      type: 'division',
      name: `${safeName} Chat`,
      divisionId: divisionRef.id,
      participantIds: [uid],
      createdAt: Date.now(),
    });
  });

  return { divisionId: divisionRef.id, inviteCode };
});

export const joinDivisionByCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to join a division.',
    );
  }

  const { inviteCode } = (request.data ?? {}) as JoinDivisionInput;
  const safeCode = inviteCode?.trim().toUpperCase();
  if (!safeCode) {
    throw new HttpsError('invalid-argument', 'Invite code is required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  const snap = await db
    .collection('divisions')
    .where('inviteCode', '==', safeCode)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError('not-found', 'Invalid invite code.');
  }

  const divisionRef = snap.docs[0].ref;
  const division = snap.docs[0].data();

  await db.runTransaction(async (tx) => {
    tx.update(divisionRef, {
      playerIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      db.collection('users').doc(uid),
      {
        divisionId: divisionRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await addUserToDivisionChannel(db, divisionRef.id, uid);

  return { divisionId: divisionRef.id, divisionName: division.name };
});

export const addPlayerToDivisionByEmail = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to manage players.',
    );
  }

  const { divisionId, email } = (request.data ?? {}) as AddPlayerInput;
  const safeDivisionId = divisionId?.trim();
  const safeEmail = email ? normalizeEmail(email) : '';
  if (!safeDivisionId || !safeEmail) {
    throw new HttpsError(
      'invalid-argument',
      'Division and email are required.',
    );
  }

  const db = getFirestore();
  await requireDivisionLeaderOrAdmin(db, request.auth.uid, safeDivisionId);

  const users = await db
    .collection('users')
    .where('email', '==', safeEmail)
    .limit(1)
    .get();
  if (users.empty) {
    throw new HttpsError('not-found', 'No user found with that email.');
  }

  const userId = users.docs[0].id;
  await db.runTransaction(async (tx) => {
    tx.update(db.collection('divisions').doc(safeDivisionId), {
      playerIds: FieldValue.arrayUnion(userId),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      db.collection('users').doc(userId),
      {
        divisionId: safeDivisionId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await addUserToDivisionChannel(db, safeDivisionId, userId);

  return { success: true, userId };
});
