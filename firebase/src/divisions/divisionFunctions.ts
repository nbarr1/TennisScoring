import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import { randomInt } from 'node:crypto';
import { toCsv } from '@tennis/shared';
import { recalculateRankings } from '../matches/matchFunctions';

if (!getApps().length) initializeApp();

const appBaseUrl = defineString('APP_BASE_URL', { default: 'http://localhost:3000' });

const callableOptions = { cors: appBaseUrl.value() };

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
type AddPlaceholderInput = {
  divisionId?: string;
  name?: string;
  email?: string;
  sendInvite?: boolean;
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
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
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
  });

  await addUserToDivisionChannel(db, safeDivisionId, userId);

  return { success: true, userId };
});


export const addDivisionMemberPlaceholder = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in to manage players.');
    const uid = request.auth.uid;
    const { divisionId, name, email, sendInvite } = (request.data ?? {}) as AddPlaceholderInput;
    const safeDivisionId = divisionId?.trim();
    const safeName = name?.trim();
    const safeEmail = email ? normalizeEmail(email) : '';
    if (!safeDivisionId || !safeName) {
      throw new HttpsError('invalid-argument', 'Division and name are required.');
    }
    const db = getFirestore();
    await requireDivisionLeaderOrAdmin(db, uid, safeDivisionId);
    if (safeEmail) {
      const existing = await db.collection('users').where('email', '==', safeEmail).limit(1).get();
      if (!existing.empty) {
        const existingUserId = existing.docs[0].id;
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
        });
        await addUserToDivisionChannel(db, safeDivisionId, existingUserId);
        return { success: true, userId: existingUserId, createdPlaceholder: false };
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
      return { success: true, userId: exactNameMatch.id, createdPlaceholder: false };
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

    return {
      success: true,
      userId: placeholderRef.id,
      createdPlaceholder: true,
      linkedHistoricalMatches: matchUpdates.length,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('addDivisionMemberPlaceholder failed', {
      error,
      data: request.data ?? null,
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
  const { divisionId, userId, email } = (request.data ?? {}) as UpdateDivisionPlayerEmailInput;
  const safeDivisionId = divisionId?.trim();
  const safeUserId = userId?.trim();
  const safeEmail = typeof email === 'string' ? normalizeEmail(email) : '';
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
    { email: safeEmail, divisionId: safeDivisionId, updatedAt: FieldValue.serverTimestamp() },
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



function timestampToIso(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return new Date(value).toISOString();
}

function validateCompletedExportedMatch(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): ExportedMatch | undefined {
  const data = doc.data();
  if (data.status !== 'completed' || typeof data.completedAt !== 'number') {
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
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
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
    .filter((ranking) => !safeSeasonId || ranking.seasonId === safeSeasonId || ranking.season === safeSeasonId)
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
