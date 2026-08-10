import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { randomInt } from 'node:crypto';
import { divisionMembershipId, toCsv } from '@tennis/shared';
import { recalculateRankings } from '../matches/matchFunctions';

if (!getApps().length) initializeApp();

const callableOptions = {};

type CreateDivisionInput = {
  name?: string;
  displayName?: string;
  email?: string;
  phone?: string;
};

type JoinDivisionInput = {
  inviteCode?: string;
};

type AddPlayerInput = {
  divisionId?: string;
  email?: string;
};
type AddPlaceholderInput = {
  divisionId?: string;
  name?: string;
  email?: string;
  sendInvite?: boolean;
  seasonId?: string;
  divisionLevelId?: string;
};
type UpsertDivisionMembershipInput = {
  divisionId?: string;
  seasonId?: string;
  divisionLevelId?: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  sendInvite?: boolean;
  role?: 'player' | 'division_leader';
  status?: 'active' | 'waitlisted';
};
type BackfillDivisionSeasonLevelInput = {
  divisionId?: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: 'singles' | 'doubles';
  overwriteExisting?: boolean;
};
type BackfillMissingProfilesInput = {
  divisionId?: string;
};
type MergePlayerRecordsInput = {
  divisionId?: string;
  sourceUserId?: string;
  targetUserId?: string;
  matchIds?: string[];
  targetEmail?: string;
};
type UpdateDivisionPlayerEmailInput = {
  divisionId?: string;
  userId?: string;
  email?: string;
  phone?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}


export function publicProfileUpdate(input: {
  id: string;
  displayName?: unknown;
  avatarUrl?: unknown;
  divisionId?: string | null;
  role?: unknown;
  tutorialDone?: unknown;
}) {
  return {
    id: input.id,
    ...(typeof input.displayName === 'string' && input.displayName.trim() ? { displayName: input.displayName.trim() } : {}),
    ...(typeof input.avatarUrl === 'string' ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.divisionId !== undefined ? { divisionId: input.divisionId } : {}),
    ...(typeof input.role === 'string' ? { role: input.role } : {}),
    ...(typeof input.tutorialDone === 'boolean' ? { tutorialDone: input.tutorialDone } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

type MatchLike = {
  status?: unknown;
  player1Name?: unknown;
  player2Name?: unknown;
  player1Id?: unknown;
  player2Id?: unknown;
  playerIds?: unknown;
};

function isEligibleForNameToIdLink(match: MatchLike): boolean {
  if (match.status !== 'completed') return false;
  const player1NameValid = typeof match.player1Name === 'string' && match.player1Name.trim().length > 0;
  const player2NameValid = typeof match.player2Name === 'string' && match.player2Name.trim().length > 0;
  if (!player1NameValid && !player2NameValid) return false;
  if (match.player1Id !== undefined && typeof match.player1Id !== 'string') return false;
  if (match.player2Id !== undefined && typeof match.player2Id !== 'string') return false;
  if (match.playerIds !== undefined && !Array.isArray(match.playerIds)) return false;
  return true;
}


function addRosterUserToLookup(
  lookup: Map<string, { userId: string; displayName: string; email?: string; phone?: string }>,
  userId: string,
  data: FirebaseFirestore.DocumentData | undefined,
) {
  const displayName = typeof data?.displayName === 'string' ? data.displayName.trim() : '';
  if (!displayName) return;
  lookup.set(normalizeName(displayName), {
    userId,
    displayName,
    email: typeof data?.email === 'string' ? data.email : undefined,
    phone: typeof data?.phone === 'string' ? data.phone : undefined,
  });
}

function matchUpdateForRosterLookup(
  data: FirebaseFirestore.DocumentData,
  rosterByName: Map<string, { userId: string; displayName: string; email?: string; phone?: string }>,
): { updateData: Record<string, unknown>; linkedUserIds: string[] } {
  const updateData: Record<string, unknown> = {};
  const linkedUserIds: string[] = [];
  const existingPlayerIds = Array.isArray(data.playerIds)
    ? data.playerIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const nextPlayerIds = new Set(existingPlayerIds);

  const maybeLinkSide = (idField: 'player1Id' | 'player2Id', nameField: 'player1Name' | 'player2Name') => {
    const currentId = typeof data[idField] === 'string' ? data[idField].trim() : '';
    if (currentId && currentId !== 'guest') {
      linkedUserIds.push(currentId);
      nextPlayerIds.add(currentId);
      return;
    }
    const name = typeof data[nameField] === 'string' ? normalizeName(data[nameField]) : '';
    const rosterUser = name ? rosterByName.get(name) : undefined;
    if (!rosterUser) return;
    updateData[idField] = rosterUser.userId;
    linkedUserIds.push(rosterUser.userId);
    nextPlayerIds.add(rosterUser.userId);
  };

  maybeLinkSide('player1Id', 'player1Name');
  if (data.player2IsGuest !== true) {
    maybeLinkSide('player2Id', 'player2Name');
  }

  if (nextPlayerIds.size !== existingPlayerIds.length || [...nextPlayerIds].some((id) => !existingPlayerIds.includes(id))) {
    updateData.playerIds = [...nextPlayerIds];
  }

  return { updateData, linkedUserIds };
}

function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
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


async function assertDivisionLevel(
  db: FirebaseFirestore.Firestore,
  divisionId: string,
  seasonId: string,
  divisionLevelId: string,
) {
  const levelSnap = await db
    .collection('divisions')
    .doc(divisionId)
    .collection('levels')
    .doc(divisionLevelId)
    .get();
  const level = levelSnap.data();
  if (!levelSnap.exists || level?.seasonId !== seasonId) {
    throw new HttpsError('failed-precondition', 'Selected division level is not available for that season.');
  }
  return level;
}

async function upsertMembershipDocument(
  db: FirebaseFirestore.Firestore,
  input: {
    divisionId: string;
    seasonId: string;
    divisionLevelId: string;
    userId: string;
    displayName: string;
    email?: string;
    phone?: string;
    assignedBy: string;
    source: 'registered_user' | 'placeholder' | 'imported' | 'migration';
    role?: 'player' | 'division_leader';
    status?: 'active' | 'waitlisted';
  },
): Promise<string> {
  await assertDivisionLevel(db, input.divisionId, input.seasonId, input.divisionLevelId);
  const membershipId = divisionMembershipId(input.seasonId, input.divisionLevelId, input.userId);
  const ref = db
    .collection('divisions')
    .doc(input.divisionId)
    .collection('memberships')
    .doc(membershipId);
  const snap = await ref.get();
  await ref.set(
    {
      id: membershipId,
      divisionId: input.divisionId,
      seasonId: input.seasonId,
      divisionLevelId: input.divisionLevelId,
      userId: input.userId,
      displayNameSnapshot: input.displayName,
      ...(input.email ? { emailSnapshot: normalizeEmail(input.email) } : {}),
      ...(input.phone ? { phoneSnapshot: input.phone.trim() } : {}),
      role: input.role ?? 'player',
      status: input.status ?? 'active',
      source: input.source,
      assignedBy: input.assignedBy,
      createdAt: snap.exists ? snap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return membershipId;
}

export const createDivision = onCall(callableOptions, async (request) => {
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

    tx.set(
      db.collection('profiles').doc(uid),
      publicProfileUpdate({
        id: uid,
        displayName,
        divisionId: divisionRef.id,
        role: 'division_leader',
      }),
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

export const joinDivisionByCode = onCall(callableOptions, async (request) => {
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
    tx.set(
      db.collection('profiles').doc(uid),
      publicProfileUpdate({
        id: uid,
        displayName: request.auth?.token.name,
        divisionId: divisionRef.id,
        role: 'player',
      }),
      { merge: true },
    );
  });

  await addUserToDivisionChannel(db, divisionRef.id, uid);

  return { divisionId: divisionRef.id, divisionName: division.name };
});

export const addPlayerToDivisionByEmail = onCall(callableOptions, async (request) => {
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
    tx.set(
      db.collection('profiles').doc(userId),
      publicProfileUpdate({
        id: userId,
        displayName: users.docs[0].data()?.displayName,
        avatarUrl: users.docs[0].data()?.avatarUrl,
        divisionId: safeDivisionId,
        role: users.docs[0].data()?.role ?? 'player',
        tutorialDone: users.docs[0].data()?.tutorialDone,
      }),
      { merge: true },
    );
  });

  await addUserToDivisionChannel(db, safeDivisionId, userId);

  return { success: true, userId };
});


export const addDivisionMemberPlaceholder = onCall(callableOptions, async (request) => {
  const { divisionId, name, email, sendInvite, seasonId, divisionLevelId } = (request.data ?? {}) as AddPlaceholderInput;
  const safeDivisionId = divisionId?.trim();
  const safeName = name?.trim();
  const safeEmail = email ? normalizeEmail(email) : '';
  const safeSeasonId = seasonId?.trim();
  const safeDivisionLevelId = divisionLevelId?.trim();

  try {
    if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in to manage players.');
    const uid = request.auth.uid;
    if (!safeDivisionId || !safeName) {
      throw new HttpsError('invalid-argument', 'Division and name are required.');
    }
    const db = getFirestore();
    await requireDivisionLeaderOrAdmin(db, uid, safeDivisionId);
    const maybeUpsertMembership = async (targetUserId: string, displayName: string, source: 'registered_user' | 'placeholder') => {
      if (!safeSeasonId || !safeDivisionLevelId) return undefined;
      return upsertMembershipDocument(db, {
        divisionId: safeDivisionId,
        seasonId: safeSeasonId,
        divisionLevelId: safeDivisionLevelId,
        userId: targetUserId,
        displayName,
        email: safeEmail,
        assignedBy: uid,
        source,
      });
    };
    if (safeEmail) {
      const existing = await db.collection('users').where('email', '==', safeEmail).limit(1).get();
      if (!existing.empty) {
        const existingUserId = existing.docs[0].id;
        const existingUserData = existing.docs[0].data();
        await db.runTransaction(async (tx) => {
          tx.set(
            db.collection('divisions').doc(safeDivisionId),
            {
              playerIds: FieldValue.arrayUnion(existingUserId),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          tx.set(
            db.collection('users').doc(existingUserId),
            {
              divisionId: safeDivisionId,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          tx.set(
            db.collection('profiles').doc(existingUserId),
            publicProfileUpdate({
              id: existingUserId,
              displayName: existingUserData?.displayName,
              avatarUrl: existingUserData?.avatarUrl,
              divisionId: safeDivisionId,
              role: existingUserData?.role ?? 'player',
            }),
            { merge: true },
          );
        });
        await addUserToDivisionChannel(db, safeDivisionId, existingUserId);
        const existingDisplayName = existingUserData?.displayName ?? safeName;
        const membershipId = await maybeUpsertMembership(existingUserId, existingDisplayName, 'registered_user');
        return { success: true, userId: existingUserId, createdPlaceholder: false, membershipId };
      }
    }
    const existingByName = await db
      .collection('users')
      .where('divisionId', '==', safeDivisionId)
      .get();
    const exactNameMatch = existingByName.docs.find((doc) => {
      const displayName = doc.data()?.displayName;
      return typeof displayName === 'string' && normalizeName(displayName) === normalizeName(safeName);
    });
    if (exactNameMatch) {
      await db.collection('divisions').doc(safeDivisionId).set(
        {
          playerIds: FieldValue.arrayUnion(exactNameMatch.id),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await addUserToDivisionChannel(db, safeDivisionId, exactNameMatch.id);
      const membershipId = await maybeUpsertMembership(exactNameMatch.id, safeName, 'registered_user');
      return { success: true, userId: exactNameMatch.id, createdPlaceholder: false, membershipId };
    }
    const now = Date.now();
    const placeholderRef = db.collection('users').doc();
    await db.runTransaction(async (tx) => {
      tx.set(placeholderRef, {
        id: placeholderRef.id,
        displayName: safeName,
        email: safeEmail,
        phone: null,
        avatarUrl: null,
        contactPreferences: { allowEmail: true, allowSMS: false, allowInApp: true },
        divisionId: safeDivisionId,
        role: 'player',
        fcmTokens: [],
        tipsEnabled: true,
        isRegistered: false,
        inviteStatus: sendInvite && safeEmail ? 'invite_sent' : 'none',
        invitedAt: sendInvite && safeEmail ? now : null,
        invitedBy: sendInvite && safeEmail ? uid : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        db.collection('divisions').doc(safeDivisionId),
        {
          playerIds: FieldValue.arrayUnion(placeholderRef.id),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    const historicalMatches = await db
      .collection('matches')
      .where('divisionId', '==', safeDivisionId)
      .where('status', '==', 'completed')
      .get();
    const readNormalizedName = (value: unknown): string =>
      typeof value === 'string' ? normalizeName(value) : '';
    const targetName = normalizeName(safeName);
    const matchUpdates = historicalMatches.docs
      .map((doc) => {
        const data = doc.data() as MatchLike;
        if (!isEligibleForNameToIdLink(data)) return null;
        let touched = false;
        const updateData: Record<string, unknown> = {};
        if (!data.player1Id && readNormalizedName(data.player1Name) === targetName) {
          updateData.player1Id = placeholderRef.id;
          touched = true;
        }
        if (!data.player2Id && readNormalizedName(data.player2Name) === targetName) {
          updateData.player2Id = placeholderRef.id;
          touched = true;
        }
        if (touched) {
          const existingPlayerIds = Array.isArray(data.playerIds) ? data.playerIds : [];
          updateData.playerIds = Array.from(new Set([...existingPlayerIds, placeholderRef.id]));
          return { ref: doc.ref, updateData };
        }
        return null;
      })
      .filter((item): item is { ref: FirebaseFirestore.DocumentReference; updateData: Record<string, unknown> } => item !== null);

    for (let i = 0; i < matchUpdates.length; i += 400) {
      const batch = db.batch();
      matchUpdates.slice(i, i + 400).forEach(({ ref, updateData }) => batch.update(ref, updateData));
      await batch.commit();
    }
    if (matchUpdates.length > 0) {
      await recalculateRankings(safeDivisionId);
    }
    const membershipId = await maybeUpsertMembership(placeholderRef.id, safeName, 'placeholder');

    return {
      success: true,
      userId: placeholderRef.id,
      createdPlaceholder: true,
      linkedHistoricalMatches: matchUpdates.length,
      membershipId,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('addDivisionMemberPlaceholder failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
      divisionId: safeDivisionId ?? null,
      hasEmail: Boolean(safeEmail),
      hasSeasonId: Boolean(safeSeasonId),
      hasDivisionLevelId: Boolean(safeDivisionLevelId),
      uid: request.auth?.uid ?? null,
    });
    throw new HttpsError('internal', 'Could not add member. Please retry or contact support.');
  }
});

export const mergeDivisionPlayerRecords = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to manage players.');
  }
  const { divisionId, sourceUserId, targetUserId, matchIds, targetEmail } = (request.data ?? {}) as MergePlayerRecordsInput;
  const safeDivisionId = divisionId?.trim();
  const safeSourceUserId = sourceUserId?.trim();
  const safeTargetUserId = targetUserId?.trim();
  if (!safeDivisionId || !safeTargetUserId) {
    throw new HttpsError('invalid-argument', 'Division and target user ID are required.');
  }
  if (safeSourceUserId && safeSourceUserId === safeTargetUserId) {
    throw new HttpsError('invalid-argument', 'Source and target users must be different.');
  }

  const db = getFirestore();
  const divisionSnap = await requireDivisionLeaderOrAdmin(
    db,
    request.auth.uid,
    safeDivisionId,
  );
  const divisionPlayerIds = (divisionSnap.data()?.playerIds ?? []) as string[];

  const [sourceSnap, targetSnap] = await Promise.all([
    safeSourceUserId ? db.collection('users').doc(safeSourceUserId).get() : null,
    db.collection('users').doc(safeTargetUserId).get(),
  ]);
  if ((!sourceSnap && safeSourceUserId) || (sourceSnap && !sourceSnap.exists) || !targetSnap.exists) {
    throw new HttpsError('not-found', 'One or both users were not found.');
  }
  const sourceDivisionId = sourceSnap?.data()?.divisionId;
  const targetDivisionId = targetSnap.data()?.divisionId;
  const sourceRole = sourceSnap?.data()?.role;
  const divisionLeaderIds = (divisionSnap.data()?.leaderIds ?? []) as string[];
  const sourceIsPrivileged =
    sourceRole === 'admin' ||
    sourceRole === 'division_leader' ||
    (safeSourceUserId ? divisionLeaderIds.includes(safeSourceUserId) : false);
  const targetIsDivisionMember =
    divisionPlayerIds.includes(safeTargetUserId) || targetDivisionId === safeDivisionId;
  if (
    (safeSourceUserId && !divisionPlayerIds.includes(safeSourceUserId)) ||
    (safeSourceUserId && !divisionPlayerIds.includes(safeTargetUserId)) ||
    !targetIsDivisionMember ||
    (safeSourceUserId && sourceDivisionId !== safeDivisionId)
  ) {
    throw new HttpsError(
      'failed-precondition',
      safeSourceUserId
        ? 'Both source and target users must already be active members of this division.'
        : 'Target user must already belong to this division.',
    );
  }
  const targetDisplayName = targetSnap.data()?.displayName ?? null;
  const normalizedTargetDisplayName = typeof targetDisplayName === 'string' ? normalizeName(targetDisplayName) : '';
  const safeTargetEmail = typeof targetEmail === 'string' ? normalizeEmail(targetEmail) : '';

  const onlyMatchIds = Array.isArray(matchIds)
    ? new Set(matchIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean))
    : null;
  let docsToUpdate: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (onlyMatchIds && onlyMatchIds.size > 0) {
    const docs = await Promise.all(Array.from(onlyMatchIds).map((id) => db.collection('matches').doc(id).get()));
    docsToUpdate = docs.filter((d): d is FirebaseFirestore.QueryDocumentSnapshot => d.exists && d.data()?.divisionId === safeDivisionId);
  } else if (safeSourceUserId) {
    const matches = await db
      .collection('matches')
      .where('divisionId', '==', safeDivisionId)
      .where('playerIds', 'array-contains', safeSourceUserId)
      .get();
    docsToUpdate = matches.docs;
  } else {
    throw new HttpsError('invalid-argument', 'Select at least one match when source user is not provided.');
  }

  const maxWritesPerBatch = 450;
  let batch = db.batch();
  let writesInBatch = 0;
  const commits: Array<Promise<FirebaseFirestore.WriteResult[]>> = [];
  const commitAndRotate = () => {
    commits.push(batch.commit());
    batch = db.batch();
    writesInBatch = 0;
  };

  let updatedMatches = 0;
  const linkedDivisionPlayerIds = new Set<string>([safeTargetUserId]);
  docsToUpdate.forEach((matchDoc) => {
    const data = matchDoc.data();
    const player1Name = typeof data.player1Name === 'string' ? data.player1Name : '';
    const player2Name = typeof data.player2Name === 'string' ? data.player2Name : '';
    const player1LooksLikeTarget =
      normalizedTargetDisplayName.length > 0 &&
      normalizeName(player1Name) === normalizedTargetDisplayName;
    const player2LooksLikeTarget =
      normalizedTargetDisplayName.length > 0 &&
      normalizeName(player2Name) === normalizedTargetDisplayName;
    const existingPlayerIds = Array.isArray(data.playerIds)
      ? (data.playerIds as string[]).filter(
          (id) => typeof id === 'string' && id.trim() && id !== 'guest',
        )
      : [];
    const attachedPlayerIds = new Set(existingPlayerIds);
    const player1HasAttachedProfile =
      typeof data.player1Id === 'string' &&
      data.player1Id !== 'guest' &&
      attachedPlayerIds.has(data.player1Id);
    const player2HasAttachedProfile =
      typeof data.player2Id === 'string' &&
      data.player2Id !== 'guest' &&
      attachedPlayerIds.has(data.player2Id);
    if (!safeSourceUserId && (attachedPlayerIds.has(safeTargetUserId) || attachedPlayerIds.size >= 2)) {
      return;
    }

    const shouldAttachPlayer1 = !safeSourceUserId && (
      player1LooksLikeTarget || (!player1HasAttachedProfile && player2HasAttachedProfile)
    );
    const shouldAttachPlayer2 = !safeSourceUserId && (
      player2LooksLikeTarget || (!player2HasAttachedProfile && player1HasAttachedProfile)
    );
    const nextPlayer1Id = safeSourceUserId
      ? (data.player1Id === safeSourceUserId ? safeTargetUserId : data.player1Id)
      : (shouldAttachPlayer1 ? safeTargetUserId : data.player1Id);
    const nextPlayer2Id = safeSourceUserId
      ? (data.player2Id === safeSourceUserId ? safeTargetUserId : data.player2Id)
      : (shouldAttachPlayer2 ? safeTargetUserId : data.player2Id);
    const nextPlayerIds = Array.from(
      new Set(
        [
          ...existingPlayerIds.map((id) => {
            if (safeSourceUserId) {
              return id === safeSourceUserId ? safeTargetUserId : id;
            }
            if (id === data.player1Id && shouldAttachPlayer1) {
              return safeTargetUserId;
            }
            if (id === data.player2Id && shouldAttachPlayer2) {
              return safeTargetUserId;
            }
            return id;
          }),
          ...(!safeSourceUserId && (shouldAttachPlayer1 || shouldAttachPlayer2)
            ? [safeTargetUserId]
            : []),
        ].filter((id) => typeof id === 'string' && id.trim() && id !== 'guest'),
      ),
    );
    if (!safeSourceUserId && !shouldAttachPlayer1 && !shouldAttachPlayer2) {
      return;
    }
    const updateData: Record<string, unknown> = {
      player1Id: nextPlayer1Id,
      player2Id: nextPlayer2Id,
      playerIds: nextPlayerIds,
    };
    if ((data.player1Id === safeSourceUserId || shouldAttachPlayer1) && targetDisplayName) {
      updateData.player1Name = targetDisplayName;
    }
    if ((data.player2Id === safeSourceUserId || shouldAttachPlayer2) && targetDisplayName) {
      updateData.player2Name = targetDisplayName;
    }
    if (shouldAttachPlayer2) {
      updateData.player2IsGuest = false;
    }
    nextPlayerIds.forEach((id) => linkedDivisionPlayerIds.add(id));
    batch.update(matchDoc.ref, updateData);
    updatedMatches += 1;
    writesInBatch += 1;
    if (writesInBatch >= maxWritesPerBatch) {
      commitAndRotate();
    }
  });

  const divisionPlayerIdUpdate = safeSourceUserId
    ? (!sourceIsPrivileged
        ? { playerIds: FieldValue.arrayRemove(safeSourceUserId) }
        : {})
    : {
        playerIds: FieldValue.arrayUnion(
          ...Array.from(linkedDivisionPlayerIds),
        ),
      };

  batch.set(
    db.collection('divisions').doc(safeDivisionId),
    {
      ...divisionPlayerIdUpdate,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    db.collection('users').doc(safeTargetUserId),
    {
      divisionId: safeDivisionId,
      ...(safeTargetEmail ? { email: safeTargetEmail } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  if (safeSourceUserId) {
    batch.set(
      db.collection('users').doc(safeSourceUserId),
      {
        ...(sourceIsPrivileged
          ? {}
          : {
              mergedIntoUserId: safeTargetUserId,
              divisionId: FieldValue.delete(),
            }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  writesInBatch += safeSourceUserId ? 3 : 2;
  if (writesInBatch > 0) {
    commitAndRotate();
  }

  await Promise.all(commits);
  await addUserToDivisionChannel(db, safeDivisionId, safeTargetUserId);
  if (updatedMatches > 0) {
    await recalculateRankings(safeDivisionId);
  }

  return { success: true, updatedMatches };
});

export const updateDivisionPlayerEmail = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to manage players.');
  }
  const { divisionId, userId, email, phone } = (request.data ?? {}) as UpdateDivisionPlayerEmailInput;
  const safeDivisionId = divisionId?.trim();
  const safeUserId = userId?.trim();
  const safeEmail = typeof email === 'string' ? normalizeEmail(email) : '';
  const safePhone = typeof phone === 'string' ? phone.trim() : undefined;
  if (!safeDivisionId || !safeUserId || !safeEmail) {
    throw new HttpsError('invalid-argument', 'Division, user, and email are required.');
  }

  const db = getFirestore();
  const divisionSnap = await requireDivisionLeaderOrAdmin(db, request.auth.uid, safeDivisionId);
  const divisionData = divisionSnap.data() ?? {};
  const playerIds = (divisionData.playerIds ?? []) as string[];
  const leaderIds = (divisionData.leaderIds ?? []) as string[];
  const userSnap = await db.collection('users').doc(safeUserId).get();
  const userDivisionId = userSnap.data()?.divisionId;
  const isDivisionMember =
    playerIds.includes(safeUserId) ||
    leaderIds.includes(safeUserId) ||
    userDivisionId === safeDivisionId;
  if (!isDivisionMember) {
    throw new HttpsError('failed-precondition', 'User is not a member of this division.');
  }

  const batch = db.batch();
  batch.set(
    db.collection('users').doc(safeUserId),
    {
      email: safeEmail,
      ...(safePhone !== undefined ? { phone: safePhone } : {}),
      divisionId: safeDivisionId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  if (!playerIds.includes(safeUserId) && leaderIds.includes(safeUserId)) {
    batch.set(
      db.collection('divisions').doc(safeDivisionId),
      { playerIds: FieldValue.arrayUnion(safeUserId), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  return { success: true };
});

type UpsertDivisionLevelInput = {
  divisionId?: string;
  levelId?: string;
  seasonId?: string;
  year?: number;
  seasonHalf?: string;
  name?: string;
  skillLevel?: string;
  matchType?: string;
  description?: string;
  rankingsEnabled?: boolean;
  active?: boolean;
  sortOrder?: number;
};

type ExportDivisionCsvInput = {
  divisionId?: string;
  exportType?: 'matches' | 'rankings';
  seasonId?: string;
  divisionLevelId?: string;
};

type ExportedMatch = Record<string, unknown> & {
  id: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: string;
  status?: string;
  side1?: { displayName?: string };
  side2?: { displayName?: string };
  player1Name?: string;
  player2Name?: string;
  player1Id?: string;
  player2Id?: string;
  winner?: string;
  isDivisionMatch?: boolean;
  scheduledAt?: number;
  completedAt?: number;
  createdAt?: number;
};

type ExportedRanking = Record<string, unknown> & {
  id: string;
  rank?: number;
  userId?: string;
  displayName?: string;
  season?: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: string;
  matchesPlayed?: number;
  matchesWon?: number;
  matchesLost?: number;
  setsWon?: number;
  setsLost?: number;
  gamesWon?: number;
  gamesLost?: number;
  gameDifferential?: number;
  updatedAt?: number;
};

function timestampToDate(value: unknown): Date | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return new Date(value);
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const { toDate } = value as { toDate?: unknown };
    if (typeof toDate === 'function') {
      const date = toDate.call(value);
      if (date instanceof Date) return date;
    }
  }
  return undefined;
}

function timestampToIso(value: unknown): string {
  const date = timestampToDate(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function timestampToMillis(value: unknown): number {
  return timestampToDate(value)?.getTime() ?? 0;
}

function validateCompletedExportedMatch(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): ExportedMatch | undefined {
  const data = doc.data();
  if (data.status !== 'completed' || !timestampToIso(data.completedAt)) {
    return undefined;
  }
  return { id: doc.id, ...data } as ExportedMatch;
}


export const upsertDivisionLevel = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to manage division levels.');
  }

  const input = (request.data ?? {}) as UpsertDivisionLevelInput;
  const divisionId = input.divisionId?.trim();
  const name = input.name?.trim();
  const seasonId = input.seasonId?.trim();
  const year = input.year;
  const seasonHalf = input.seasonHalf;
  const skillLevel = input.skillLevel;
  const matchType = input.matchType;

  if (!divisionId || !name || !seasonId || typeof year !== 'number') {
    throw new HttpsError('invalid-argument', 'Division, season, year, and level name are required.');
  }
  if (seasonHalf !== 'spring' && seasonHalf !== 'fall') {
    throw new HttpsError('invalid-argument', 'Season must be Spring or Fall.');
  }
  if (!['beginner', 'intermediate', 'advanced', 'open'].includes(String(skillLevel))) {
    throw new HttpsError('invalid-argument', 'Choose a supported skill level.');
  }
  if (matchType !== 'singles' && matchType !== 'doubles') {
    throw new HttpsError('invalid-argument', 'Choose singles or doubles.');
  }

  const db = getFirestore();
  await requireDivisionLeaderOrAdmin(db, request.auth.uid, divisionId);
  const now = Date.now();
  const levelRef = input.levelId?.trim()
    ? db.collection('divisions').doc(divisionId).collection('levels').doc(input.levelId.trim())
    : db.collection('divisions').doc(divisionId).collection('levels').doc();

  const levelSnap = await levelRef.get();
  await levelRef.set(
    {
      id: levelRef.id,
      divisionId,
      seasonId,
      year,
      seasonHalf,
      name,
      skillLevel,
      matchType,
      ...(input.description?.trim() ? { description: input.description.trim() } : { description: '' }),
      rankingsEnabled: input.rankingsEnabled ?? true,
      active: input.active ?? true,
      sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 100,
      ...(!levelSnap.exists ? { createdAt: now } : {}),
      updatedAt: now,
    },
    { merge: true },
  );
  await db.collection('divisions').doc(divisionId).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return { levelId: levelRef.id };
});


export const upsertDivisionMembership = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to manage division memberships.');
  }

  const { divisionId, seasonId, divisionLevelId, userId, name, email, phone, sendInvite, role, status } =
    (request.data ?? {}) as UpsertDivisionMembershipInput;
  const safeDivisionId = divisionId?.trim();
  const safeSeasonId = seasonId?.trim();
  const safeLevelId = divisionLevelId?.trim();
  const safeUserId = userId?.trim();
  const safeName = name?.trim();
  const safeEmail = email ? normalizeEmail(email) : '';
  const safePhone = phone?.trim();
  if (!safeDivisionId || !safeSeasonId || !safeLevelId || (!safeUserId && !safeName && !safeEmail)) {
    throw new HttpsError('invalid-argument', 'Division, season, level, and player are required.');
  }

  const db = getFirestore();
  await requireDivisionLeaderOrAdmin(db, request.auth.uid, safeDivisionId);
  await assertDivisionLevel(db, safeDivisionId, safeSeasonId, safeLevelId);

  let targetUserId = safeUserId;
  let createdPlaceholder = false;
  let displayName = safeName || safeEmail || 'Player';
  let targetEmail = safeEmail;
  let targetPhone = safePhone;
  let source: 'registered_user' | 'placeholder' = 'registered_user';
  const safeMembershipRole = role === 'division_leader' ? 'division_leader' : 'player';
  const safeMembershipStatus = status === 'waitlisted' ? 'waitlisted' : 'active';

  if (targetUserId) {
    const userSnap = await db.collection('users').doc(targetUserId).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Player not found.');
    const data = userSnap.data() ?? {};
    displayName = (typeof data.displayName === 'string' && data.displayName.trim()) || displayName;
    targetEmail = safeEmail || (typeof data.email === 'string' ? data.email : '');
    targetPhone = safePhone || (typeof data.phone === 'string' ? data.phone : undefined);
  } else if (safeEmail) {
    const existing = await db.collection('users').where('email', '==', safeEmail).limit(1).get();
    if (!existing.empty) {
      targetUserId = existing.docs[0].id;
      const data = existing.docs[0].data();
      displayName = (typeof data.displayName === 'string' && data.displayName.trim()) || displayName;
      targetPhone = safePhone || (typeof data.phone === 'string' ? data.phone : undefined);
    }
  }

  if (!targetUserId && safeName) {
    const sameDivision = await db.collection('users').where('divisionId', '==', safeDivisionId).get();
    const exactNameMatch = sameDivision.docs.find((doc) => {
      const display = doc.data()?.displayName;
      return typeof display === 'string' && normalizeName(display) === normalizeName(safeName);
    });
    if (exactNameMatch) {
      targetUserId = exactNameMatch.id;
      const data = exactNameMatch.data();
      displayName = data.displayName ?? displayName;
      targetEmail = safeEmail || (typeof data.email === 'string' ? data.email : '');
      targetPhone = safePhone || (typeof data.phone === 'string' ? data.phone : undefined);
    }
  }

  if (!targetUserId) {
    const now = Date.now();
    const placeholderRef = db.collection('users').doc();
    targetUserId = placeholderRef.id;
    createdPlaceholder = true;
    source = 'placeholder';
    await placeholderRef.set({
      id: targetUserId,
      displayName,
      email: targetEmail,
      ...(targetPhone ? { phone: targetPhone } : { phone: null }),
      avatarUrl: null,
      contactPreferences: { allowEmail: true, allowSMS: false, allowInApp: true },
      divisionId: safeDivisionId,
      role: 'player',
      fcmTokens: [],
      tipsEnabled: true,
      isRegistered: false,
      inviteStatus: sendInvite && targetEmail ? 'invite_sent' : 'none',
      invitedAt: sendInvite && targetEmail ? now : null,
      invitedBy: sendInvite && targetEmail ? request.auth.uid : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const membershipCol = db
    .collection('divisions')
    .doc(safeDivisionId)
    .collection('memberships');
  const previousMemberships = await membershipCol
    .where('userId', '==', targetUserId)
    .where('seasonId', '==', safeSeasonId)
    .where('status', '==', 'active')
    .get();

  const nextMembershipId = divisionMembershipId(safeSeasonId, safeLevelId, targetUserId);
  const archiveBatch = db.batch();
  previousMemberships.docs.forEach((docSnap) => {
    if (docSnap.id === nextMembershipId) return;
    archiveBatch.set(
      docSnap.ref,
      {
        status: 'removed',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  if (!previousMemberships.empty) {
    await archiveBatch.commit();
  }

  const membershipId = await upsertMembershipDocument(db, {
    divisionId: safeDivisionId,
    seasonId: safeSeasonId,
    divisionLevelId: safeLevelId,
    userId: targetUserId,
    displayName,
    email: targetEmail,
    phone: targetPhone,
    assignedBy: request.auth.uid,
    source,
    role: safeMembershipRole,
    status: safeMembershipStatus,
  });

  await Promise.all([
    db.collection('divisions').doc(safeDivisionId).set(
      { playerIds: FieldValue.arrayUnion(targetUserId), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ),
    db.collection('users').doc(targetUserId).set(
      {
        ...(targetEmail ? { email: targetEmail } : {}),
        ...(targetPhone ? { phone: targetPhone } : {}),
        divisionId: safeDivisionId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
    addUserToDivisionChannel(db, safeDivisionId, targetUserId),
  ]);

  return { membershipId, userId: targetUserId, createdPlaceholder };
});


export const backfillDivisionSeasonLevel = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to backfill division data.');
  }

  const { divisionId, seasonId, divisionLevelId, matchType, overwriteExisting } =
    (request.data ?? {}) as BackfillDivisionSeasonLevelInput;
  const safeDivisionId = divisionId?.trim();
  const safeSeasonId = seasonId?.trim();
  const safeDivisionLevelId = divisionLevelId?.trim();
  const safeMatchType = matchType === 'singles' || matchType === 'doubles' ? matchType : undefined;
  if (!safeDivisionId || !safeSeasonId || !safeDivisionLevelId) {
    throw new HttpsError('invalid-argument', 'Division, season, and division level are required.');
  }

  const db = getFirestore();
  const divisionSnap = await requireDivisionLeaderOrAdmin(db, request.auth.uid, safeDivisionId);
  const level = await assertDivisionLevel(db, safeDivisionId, safeSeasonId, safeDivisionLevelId);
  const effectiveMatchType = safeMatchType ?? (level?.matchType === 'singles' || level?.matchType === 'doubles' ? level.matchType : undefined);

  const divisionData = divisionSnap.data() ?? {};
  const rosterByName = new Map<string, { userId: string; displayName: string; email?: string; phone?: string }>();
  const rosterUserIds = new Set<string>();
  const divisionPlayerIds = Array.isArray(divisionData.playerIds)
    ? divisionData.playerIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  divisionPlayerIds.forEach((id) => rosterUserIds.add(id));

  const rosterSnaps = await Promise.all([
    ...divisionPlayerIds.map((id) => db.collection('users').doc(id).get()),
    ...(await db.collection('users').where('divisionId', '==', safeDivisionId).get()).docs,
  ]);
  const userSnapById = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  rosterSnaps.forEach((userSnap) => {
    rosterUserIds.add(userSnap.id);
    userSnapById.set(userSnap.id, userSnap);
    addRosterUserToLookup(rosterByName, userSnap.id, userSnap.data());
  });

  const snap = await db.collection('matches').where('divisionId', '==', safeDivisionId).get();
  const matchUpdates = snap.docs
    .map((doc) => {
      const data = doc.data();
      const seasonLevelUpdate = overwriteExisting || !data.seasonId || !data.divisionLevelId
        ? {
            seasonId: safeSeasonId,
            divisionLevelId: safeDivisionLevelId,
            ...(effectiveMatchType ? { matchType: effectiveMatchType } : {}),
          }
        : {};
      const { updateData: identityUpdate, linkedUserIds } = matchUpdateForRosterLookup(data, rosterByName);
      linkedUserIds.forEach((id) => rosterUserIds.add(id));
      const updateData = { ...seasonLevelUpdate, ...identityUpdate };
      return Object.keys(updateData).length > 0 ? { ref: doc.ref, updateData } : null;
    })
    .filter((item): item is { ref: FirebaseFirestore.DocumentReference; updateData: Record<string, unknown> } => item !== null);

  let updatedMatches = 0;
  for (let i = 0; i < matchUpdates.length; i += 400) {
    const batch = db.batch();
    matchUpdates.slice(i, i + 400).forEach(({ ref, updateData }) => {
      batch.update(ref, updateData);
      updatedMatches += 1;
    });
    await batch.commit();
  }

  const missingUserIds = [...rosterUserIds].filter((id) => !userSnapById.has(id));
  const missingUserSnaps = await Promise.all(missingUserIds.map((id) => db.collection('users').doc(id).get()));
  missingUserSnaps.forEach((userSnap) => userSnapById.set(userSnap.id, userSnap));

  let membershipsUpserted = 0;
  for (const userSnap of userSnapById.values()) {
    const user = userSnap.data() ?? {};
    await upsertMembershipDocument(db, {
      divisionId: safeDivisionId,
      seasonId: safeSeasonId,
      divisionLevelId: safeDivisionLevelId,
      userId: userSnap.id,
      displayName: (typeof user.displayName === 'string' && user.displayName) || userSnap.id,
      email: typeof user.email === 'string' ? user.email : undefined,
      phone: typeof user.phone === 'string' ? user.phone : undefined,
      assignedBy: request.auth.uid,
      source: 'migration',
      role: 'player',
    });
    membershipsUpserted += 1;
  }

  if (updatedMatches > 0 || membershipsUpserted > 0) {
    await recalculateRankings(safeDivisionId, { normalizeMatches: true });
  }

  return { success: true, updatedMatches, membershipsUpserted };
});

/**
 * Creates missing profiles/{uid} docs for a division's current leaders/players.
 * Some legacy write paths (accepting an invite, being added by email while
 * already registered) updated users/{uid} and the division roster without
 * ever creating the public profile doc; this repairs those accounts.
 */
export const backfillMissingProfiles = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to backfill profiles.');
  }

  const { divisionId } = (request.data ?? {}) as BackfillMissingProfilesInput;
  const safeDivisionId = divisionId?.trim();
  if (!safeDivisionId) {
    throw new HttpsError('invalid-argument', 'Division is required.');
  }

  const db = getFirestore();
  const divisionSnap = await requireDivisionLeaderOrAdmin(db, request.auth.uid, safeDivisionId);
  const divisionData = divisionSnap.data() ?? {};

  const memberIds = new Set<string>();
  [
    ...(Array.isArray(divisionData.playerIds) ? divisionData.playerIds : []),
    ...(Array.isArray(divisionData.leaderIds) ? divisionData.leaderIds : []),
  ].forEach((id: unknown) => {
    if (typeof id === 'string' && id.trim()) memberIds.add(id);
  });

  const profileSnaps = await Promise.all(
    [...memberIds].map((id) => db.collection('profiles').doc(id).get()),
  );
  const missingIds = profileSnaps.filter((snap) => !snap.exists).map((snap) => snap.id);
  if (missingIds.length === 0) {
    return { success: true, backfilled: 0, skipped: 0 };
  }

  const userSnaps = await Promise.all(missingIds.map((id) => db.collection('users').doc(id).get()));

  let backfilled = 0;
  for (let i = 0; i < userSnaps.length; i += 400) {
    const batch = db.batch();
    userSnaps.slice(i, i + 400).forEach((userSnap) => {
      if (!userSnap.exists) return;
      const user = userSnap.data() ?? {};
      batch.set(
        db.collection('profiles').doc(userSnap.id),
        publicProfileUpdate({
          id: userSnap.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          divisionId: typeof user.divisionId === 'string' ? user.divisionId : safeDivisionId,
          role: user.role,
          tutorialDone: user.tutorialDone,
        }),
        { merge: true },
      );
      backfilled += 1;
    });
    await batch.commit();
  }

  return { success: true, backfilled, skipped: missingIds.length - backfilled };
});

export const exportDivisionCsv = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to export division data.');
  }

  const { divisionId, exportType, seasonId, divisionLevelId } = (request.data ?? {}) as ExportDivisionCsvInput;
  const safeDivisionId = divisionId?.trim();
  if (!safeDivisionId || (exportType !== 'matches' && exportType !== 'rankings')) {
    throw new HttpsError('invalid-argument', 'Division and export type are required.');
  }

  const db = getFirestore();
  await requireDivisionLeaderOrAdmin(db, request.auth.uid, safeDivisionId);

  const safeSeasonId = seasonId?.trim();
  const safeDivisionLevelId = divisionLevelId?.trim();

  if (exportType === 'matches') {
    let matchesQuery: FirebaseFirestore.Query = db
      .collection('matches')
      .where('divisionId', '==', safeDivisionId);
    if (safeSeasonId) {
      matchesQuery = matchesQuery.where('seasonId', '==', safeSeasonId);
    }
    if (safeDivisionLevelId) {
      matchesQuery = matchesQuery.where('divisionLevelId', '==', safeDivisionLevelId);
    }

    const snap = await matchesQuery.get();
    const matches = snap.docs
      .map(validateCompletedExportedMatch)
      .filter((match): match is ExportedMatch => match !== undefined)
      .sort((a, b) => timestampToMillis(b.completedAt) - timestampToMillis(a.completedAt));
    const rows = [
      ['match_id', 'season_id', 'division_level_id', 'match_type', 'status', 'player_or_side_1', 'player_or_side_2', 'winner', 'is_division_match', 'scheduled_at', 'completed_at', 'created_at'],
      ...matches.map((match) => [
        match.id,
        match.seasonId ?? '',
        match.divisionLevelId ?? '',
        match.matchType ?? '',
        match.status ?? '',
        match.side1?.displayName ?? match.player1Name ?? match.player1Id ?? '',
        match.side2?.displayName ?? match.player2Name ?? match.player2Id ?? '',
        match.winner ?? '',
        match.isDivisionMatch ?? false,
        timestampToIso(match.scheduledAt),
        timestampToIso(match.completedAt),
        timestampToIso(match.createdAt),
      ]),
    ];
    return {
      filename: `matches-${safeDivisionId}${safeSeasonId ? `-${safeSeasonId}` : ''}.csv`,
      contentType: 'text/csv' as const,
      csv: toCsv(rows),
      rowCount: matches.length,
    };
  }

  const rankingDocsById = new Map<string, ExportedRanking>();
  const collectRankings = async (rankingsQuery: FirebaseFirestore.Query) => {
    const snap = await rankingsQuery.get();
    snap.docs.forEach((doc) => {
      rankingDocsById.set(doc.id, { id: doc.id, ...doc.data() } as ExportedRanking);
    });
  };

  let rankingsQuery: FirebaseFirestore.Query = db
    .collection('divisions')
    .doc(safeDivisionId)
    .collection('rankings');
  if (safeSeasonId) {
    rankingsQuery = rankingsQuery.where('seasonId', '==', safeSeasonId);
  }
  if (safeDivisionLevelId) {
    rankingsQuery = rankingsQuery.where('divisionLevelId', '==', safeDivisionLevelId);
  }
  await collectRankings(rankingsQuery);

  if (safeSeasonId) {
    let legacyRankingsQuery: FirebaseFirestore.Query = db
      .collection('divisions')
      .doc(safeDivisionId)
      .collection('rankings')
      .where('season', '==', safeSeasonId);
    if (safeDivisionLevelId) {
      legacyRankingsQuery = legacyRankingsQuery.where('divisionLevelId', '==', safeDivisionLevelId);
    }
    await collectRankings(legacyRankingsQuery);
  }

  const rankings = [...rankingDocsById.values()]
    .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));
  const rows = [
    ['rank', 'user_id', 'display_name', 'season', 'season_id', 'division_level_id', 'match_type', 'played', 'won', 'lost', 'sets_won', 'sets_lost', 'games_won', 'games_lost', 'game_differential', 'updated_at'],
    ...rankings.map((ranking) => [
      ranking.rank ?? '',
      ranking.userId ?? ranking.id,
      ranking.displayName ?? '',
      ranking.season ?? '',
      ranking.seasonId ?? '',
      ranking.divisionLevelId ?? '',
      ranking.matchType ?? '',
      ranking.matchesPlayed ?? 0,
      ranking.matchesWon ?? 0,
      ranking.matchesLost ?? 0,
      ranking.setsWon ?? 0,
      ranking.setsLost ?? 0,
      ranking.gamesWon ?? 0,
      ranking.gamesLost ?? 0,
      ranking.gameDifferential ?? 0,
      timestampToIso(ranking.updatedAt),
    ]),
  ];
  return {
    filename: `rankings-${safeDivisionId}${safeSeasonId ? `-${safeSeasonId}` : ''}.csv`,
    contentType: 'text/csv' as const,
    csv: toCsv(rows),
    rowCount: rankings.length,
  };
});
