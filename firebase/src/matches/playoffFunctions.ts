import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  DEFAULT_FORMAT,
  EMPTY_STATS,
  MAX_PLAYOFF_ENTRANTS,
  MIN_PLAYOFF_ENTRANTS,
  createInitialScore,
  createPlayoffSlots,
  isPrivilegedRole,
  playoffChampion,
  playoffRoundName,
  playoffRoundStart,
  playoffSlotKey,
  readyPlayoffSlots,
  recordPlayoffWinner,
  sidePlayerIds,
} from '@tennis/shared';
import type { Match, PlayoffBracket, PlayoffSlot } from '@tennis/shared';

import { assertVerifiedEmail } from '../auth/verifiedEmail';
import { sendPushToUsers } from '../notifications/push';

if (!getApps().length) initializeApp();

type Db = ReturnType<typeof getFirestore>;
type Transaction = FirebaseFirestore.Transaction;

const MAX_INTERVAL_DAYS = 90;
const MAX_BRACKET_NAME_LENGTH = 80;
const DOUBLES_NOT_SUPPORTED_MESSAGE = 'Playoffs are not yet available for doubles division levels';

type PublishPlayoffBracketInput = {
  divisionId?: unknown;
  seasonId?: unknown;
  divisionLevelId?: unknown;
  name?: unknown;
  playerIds?: unknown;
  startAt?: unknown;
  intervalDays?: unknown;
};

function bracketsCol(db: Db, divisionId: string) {
  return db.collection('divisions').doc(divisionId).collection('playoffBrackets');
}

function readId(value: unknown, field: string): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) throw new functions.https.HttpsError('invalid-argument', `${field} is required`);
  return id;
}

async function assertCanManagePlayoffs(db: Db, uid: string, divisionId: string) {
  const [actorSnap, divisionSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('divisions').doc(divisionId).get(),
  ]);
  if (!divisionSnap.exists) throw new functions.https.HttpsError('not-found', 'Division not found');
  const actor = actorSnap.data();
  const division = divisionSnap.data();
  const leaderIds: string[] = Array.isArray(division?.leaderIds) ? division.leaderIds : [];
  const isAdminOrDeveloper = actor?.role === 'admin' || actor?.role === 'app_developer';
  const isLeader = leaderIds.includes(uid) || division?.leaderId === uid;
  if (!isPrivilegedRole(actor?.role) || (!isAdminOrDeveloper && !isLeader)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins, app developers, and division leaders can manage playoffs',
    );
  }
  return { division, leaderIds };
}

/** The match document for one ready slot. */
function playoffMatchData(
  bracket: Pick<
    PlayoffBracket,
    'id' | 'divisionId' | 'seasonId' | 'divisionLevelId' | 'totalRounds' | 'playerNames' | 'createdBy' | 'startAt' | 'intervalDays'
  >,
  slot: PlayoffSlot,
  now: number,
): Omit<Match, 'id'> {
  const player1Id = slot.player1Id as string;
  const player2Id = slot.player2Id as string;
  const scheduledAt = playoffRoundStart(bracket, slot.round, now);
  return {
    divisionId: bracket.divisionId,
    seasonId: bracket.seasonId,
    divisionLevelId: bracket.divisionLevelId,
    matchType: 'singles',
    player1Id,
    player2Id,
    player1Name: bracket.playerNames[player1Id] ?? player1Id,
    player2Name: bracket.playerNames[player2Id] ?? player2Id,
    player2IsGuest: false,
    playerIds: [player1Id, player2Id],
    format: DEFAULT_FORMAT,
    status: 'scheduled',
    liveScore: createInitialScore(DEFAULT_FORMAT),
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    advancedStatsEnabled: false,
    tipsEnabled: true,
    source: 'playoff',
    // Playoffs are seeded from the standings and must not change them.
    isDivisionMatch: false,
    playoff: { bracketId: bracket.id, round: slot.round, slot: slot.slot, totalRounds: bracket.totalRounds },
    createdBy: bracket.createdBy,
    ...(scheduledAt !== undefined && { scheduledAt }),
    createdAt: now,
  };
}

/**
 * Creates a match for every slot whose players are known and records its id
 * on the slot. Runs inside the caller's transaction, after all of its reads.
 */
function createReadyMatches(
  db: Db,
  tx: Transaction,
  bracket: PlayoffBracket,
  slots: Record<string, PlayoffSlot>,
  now: number,
): { slots: Record<string, PlayoffSlot>; created: Array<{ matchId: string; slot: PlayoffSlot }> } {
  const next = { ...slots };
  const created: Array<{ matchId: string; slot: PlayoffSlot }> = [];
  for (const slot of readyPlayoffSlots(slots)) {
    const ref = db.collection('matches').doc();
    tx.create(ref, playoffMatchData(bracket, slot, now));
    const key = playoffSlotKey(slot.round, slot.slot);
    next[key] = { ...slot, matchId: ref.id };
    created.push({ matchId: ref.id, slot: next[key] });
  }
  return { slots: next, created };
}

async function notifyMatchesReady(
  db: Db,
  bracket: PlayoffBracket,
  created: Array<{ matchId: string; slot: PlayoffSlot }>,
): Promise<void> {
  await Promise.all(
    created.flatMap(({ matchId, slot }) =>
      (['player1Id', 'player2Id'] as const).map(async (field) => {
        const playerId = slot[field] as string;
        const opponentId = (field === 'player1Id' ? slot.player2Id : slot.player1Id) as string;
        const round = playoffRoundName(slot.round, bracket.totalRounds);
        try {
          await sendPushToUsers(db, [playerId], {
            notification: {
              title: `${bracket.name}: ${round}`,
              body: `You play ${bracket.playerNames[opponentId] ?? 'your opponent'} in the ${round.toLowerCase()}. Open the match to set a time.`,
            },
            data: { type: 'playoff_match_ready', matchId },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          });
        } catch (error) {
          functions.logger.error('Failed to notify a playoff player', {
            matchId,
            playerId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    ),
  );
}

/**
 * HTTPS callable: a division leader or admin publishes a single-elimination
 * playoff for one season and level. `playerIds` is the seed order, seed 1
 * first; the clients fill it from the final standings and let the leader
 * reorder it. Top seeds get the byes when the count is not a power of two.
 *
 * Round-1 matches (and any later match two byes make ready) are created as
 * `scheduled` with `source: 'playoff'` and `isDivisionMatch: false`, so they
 * never change the standings the bracket was seeded from. Later rounds are
 * created by `onPlayoffMatchUpdate` as results are confirmed.
 */
export const publishPlayoffBracket = functions.https.onCall(async (request) => {
  assertVerifiedEmail(request.auth);
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = request.auth.uid;
  const data = (request.data ?? {}) as PublishPlayoffBracketInput;
  const divisionId = readId(data.divisionId, 'divisionId');
  const seasonId = readId(data.seasonId, 'seasonId');
  const divisionLevelId = readId(data.divisionLevelId, 'divisionLevelId');
  const name =
    (typeof data.name === 'string' ? data.name.trim().slice(0, MAX_BRACKET_NAME_LENGTH) : '') || 'Playoffs';
  const playerIds = Array.isArray(data.playerIds)
    ? Array.from(
        new Set(
          data.playerIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      )
    : [];
  if (playerIds.length < MIN_PLAYOFF_ENTRANTS || playerIds.length > MAX_PLAYOFF_ENTRANTS) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `A playoff needs ${MIN_PLAYOFF_ENTRANTS} to ${MAX_PLAYOFF_ENTRANTS} players.`,
    );
  }
  const startAt =
    typeof data.startAt === 'number' && Number.isFinite(data.startAt) ? data.startAt : undefined;
  const intervalDays = Number.isInteger(data.intervalDays)
    ? Math.min(MAX_INTERVAL_DAYS, Math.max(1, data.intervalDays as number))
    : 7;

  const db = getFirestore();
  const { division, leaderIds } = await assertCanManagePlayoffs(db, uid, divisionId);

  const levelSnap = await db
    .collection('divisions')
    .doc(divisionId)
    .collection('levels')
    .doc(divisionLevelId)
    .get();
  if (!levelSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Division level not found');
  }
  if (levelSnap.data()?.matchType === 'doubles') {
    throw new functions.https.HttpsError('failed-precondition', DOUBLES_NOT_SUPPORTED_MESSAGE);
  }

  // The same membership test publishRoundRobinSchedule uses.
  const divisionPlayerIds: string[] = Array.isArray(division?.playerIds) ? division.playerIds : [];
  const playerSnaps = await Promise.all(playerIds.map((id) => db.collection('users').doc(id).get()));
  const playerNames: Record<string, string> = {};
  playerSnaps.forEach((snap, i) => {
    const player = snap.data();
    const inDivision =
      player?.divisionId === divisionId || divisionPlayerIds.includes(playerIds[i]) || leaderIds.includes(playerIds[i]);
    if (!snap.exists || !inDivision) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Every selected player must belong to the selected division',
      );
    }
    playerNames[snap.id] = (player?.displayName as string | undefined) ?? snap.id;
  });

  const ref = bracketsCol(db, divisionId).doc();
  const now = Date.now();
  const { size, totalRounds, seedIds, slots } = createPlayoffSlots(playerIds);
  const bracket: PlayoffBracket = {
    id: ref.id,
    divisionId,
    seasonId,
    divisionLevelId,
    name,
    size,
    totalRounds,
    seedIds,
    playerNames,
    slots,
    status: 'in_progress',
    ...(startAt !== undefined && { startAt }),
    intervalDays,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  };

  const created = await db.runTransaction(async (tx) => {
    const ready = createReadyMatches(db, tx, bracket, slots, now);
    bracket.slots = ready.slots;
    tx.create(ref, bracket);
    return ready.created;
  });

  await notifyMatchesReady(db, bracket, created);
  return { success: true, bracketId: ref.id, matchesCreated: created.length, totalRounds };
});

/**
 * HTTPS callable: a division leader or admin cancels a playoff. Matches not yet
 * started are cancelled; results already played are kept.
 */
export const cancelPlayoffBracket = functions.https.onCall(async (request) => {
  assertVerifiedEmail(request.auth);
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const data = (request.data ?? {}) as { divisionId?: unknown; bracketId?: unknown };
  const divisionId = readId(data.divisionId, 'divisionId');
  const bracketId = readId(data.bracketId, 'bracketId');
  const db = getFirestore();
  await assertCanManagePlayoffs(db, request.auth.uid, divisionId);

  const ref = bracketsCol(db, divisionId).doc(bracketId);
  const cancelled = await db.runTransaction(async (tx) => {
    const bracket = (await tx.get(ref)).data() as PlayoffBracket | undefined;
    if (!bracket) throw new functions.https.HttpsError('not-found', 'Playoff not found');
    if (bracket.status !== 'in_progress') {
      throw new functions.https.HttpsError('failed-precondition', 'This playoff is already finished or cancelled.');
    }
    const matchRefs = Object.values(bracket.slots)
      .filter((slot) => slot.matchId && !slot.winnerId)
      .map((slot) => db.collection('matches').doc(slot.matchId as string));
    const matchSnaps = matchRefs.length > 0 ? await tx.getAll(...matchRefs) : [];
    let count = 0;
    for (const snap of matchSnaps) {
      const status = (snap.data() as Match | undefined)?.status;
      if (status === 'scheduled' || status === 'proposed') {
        tx.update(snap.ref, { status: 'cancelled' });
        count += 1;
      }
    }
    tx.update(ref, { status: 'cancelled', updatedAt: Date.now() });
    return count;
  });
  return { success: true, matchesCancelled: cancelled };
});

/**
 * Records a confirmed playoff result on its bracket, creates the next round's
 * match once both its players are known, and crowns the champion after the
 * final. Exported for the functions test.
 *
 * Only the first confirmation of a slot counts: a later appeal that flips the
 * winner is logged rather than applied, because the next round may already be
 * under way. The match id must be the one the slot recorded, so a match that
 * merely carries a `playoff` field cannot decide a slot.
 */
export async function advancePlayoffBracket(db: Db, matchId: string, match: Match): Promise<void> {
  const place = match.playoff;
  if (!place || match.status !== 'completed' || !match.winner) return;
  const winnerIds = sidePlayerIds(match, match.winner);
  if (winnerIds.length !== 1) return;
  const winnerId = winnerIds[0];

  const ref = bracketsCol(db, match.divisionId).doc(place.bracketId);
  const now = Date.now();
  const outcome = await db.runTransaction(async (tx) => {
    const bracket = (await tx.get(ref)).data() as PlayoffBracket | undefined;
    if (!bracket || bracket.status !== 'in_progress') return null;
    const slot = bracket.slots[playoffSlotKey(place.round, place.slot)];
    if (!slot || slot.matchId !== matchId) return null;
    if (slot.winnerId) {
      if (slot.winnerId !== winnerId) {
        functions.logger.warn('A playoff result changed after its slot was decided; the bracket is unchanged', {
          matchId,
          bracketId: bracket.id,
        });
      }
      return null;
    }
    const recorded = recordPlayoffWinner(bracket.slots, bracket.totalRounds, place.round, place.slot, winnerId);
    if (!recorded) return null;
    const ready = createReadyMatches(db, tx, bracket, recorded, now);
    const championId = playoffChampion(ready.slots, bracket.totalRounds);
    tx.update(ref, {
      slots: ready.slots,
      updatedAt: now,
      ...(championId && { status: 'completed', championId }),
    });
    return { bracket: { ...bracket, slots: ready.slots }, created: ready.created, championId };
  });

  if (!outcome) return;
  await notifyMatchesReady(db, outcome.bracket, outcome.created);
  if (outcome.championId) {
    const champion = outcome.bracket.playerNames[outcome.championId] ?? 'The winner';
    try {
      await sendPushToUsers(db, outcome.bracket.seedIds, {
        notification: {
          title: `${outcome.bracket.name} champion`,
          body: `${champion} won ${outcome.bracket.name}.`,
        },
        data: { type: 'playoff_completed', matchId },
      });
    } catch (error) {
      functions.logger.error('Failed to announce a playoff champion', {
        bracketId: outcome.bracket.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Advances a bracket when one of its matches is confirmed. Separate from
 * onMatchUpdate so a failure here cannot hold up the standings or the report
 * notifications.
 */
export const onPlayoffMatchUpdate = functions.firestore.onDocumentUpdated(
  'matches/{matchId}',
  async (event) => {
    const before = event.data?.before?.data() as Match | undefined;
    const after = event.data?.after?.data() as Match | undefined;
    if (!after?.playoff || after.status !== 'completed' || before?.status === 'completed') return;
    await advancePlayoffBracket(getFirestore(), event.params.matchId, after);
  },
);
