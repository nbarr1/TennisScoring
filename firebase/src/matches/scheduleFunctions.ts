import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  DEFAULT_FORMAT,
  EMPTY_STATS,
  createInitialScore,
  generateRoundRobinSchedule,
  isPrivilegedRole,
} from '@tennis/shared';
import type { Match } from '@tennis/shared';

if (!getApps().length) initializeApp();

type PublishRoundRobinScheduleInput = {
  divisionId?: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  playerIds?: string[];
  doubleRoundRobin?: boolean;
  startAt?: number;
  intervalDays?: number;
  clearExisting?: boolean;
};

const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * HTTPS callable: division leaders/admins generate and publish a round-robin
 * fixture list for a season/division level. Matches are created directly as
 * `scheduled` (not `proposed`) since the leader has scheduling authority for
 * their division; players can still postpone or cancel individual fixtures
 * afterward through the existing match-detail actions.
 */
const DOUBLES_NOT_SUPPORTED_MESSAGE =
  'Round-robin scheduling is not yet available for doubles division levels';

export const publishRoundRobinSchedule = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const {
    divisionId,
    seasonId,
    divisionLevelId,
    matchType,
    playerIds,
    doubleRoundRobin,
    startAt,
    intervalDays,
    clearExisting,
  } = (request.data ?? {}) as PublishRoundRobinScheduleInput;

  const safeDivisionId = typeof divisionId === 'string' ? divisionId.trim() : '';
  const safeSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const safeDivisionLevelId = typeof divisionLevelId === 'string' ? divisionLevelId.trim() : '';
  const safeMatchType = matchType === 'singles' || matchType === 'doubles' ? matchType : undefined;
  const safePlayerIds = Array.isArray(playerIds)
    ? Array.from(
        new Set(playerIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)),
      )
    : [];
  const safeIntervalDays = Number.isInteger(intervalDays)
    ? Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, intervalDays as number))
    : 7;
  const safeStartAt = typeof startAt === 'number' && Number.isFinite(startAt) ? startAt : undefined;

  if (!safeDivisionId || !safeSeasonId || !safeDivisionLevelId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'divisionId, seasonId, and divisionLevelId are required',
    );
  }
  // Cheap pre-check; the authoritative test against the stored level runs
  // below, once the level document has been read.
  if (safeMatchType === 'doubles') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      DOUBLES_NOT_SUPPORTED_MESSAGE,
    );
  }
  if (safePlayerIds.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'At least 2 players are required');
  }
  if (safeStartAt === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid startAt timestamp is required');
  }

  const db = getFirestore();
  const [actorSnap, divisionSnap, levelSnap] = await Promise.all([
    db.collection('users').doc(request.auth.uid).get(),
    db.collection('divisions').doc(safeDivisionId).get(),
    db
      .collection('divisions')
      .doc(safeDivisionId)
      .collection('levels')
      .doc(safeDivisionLevelId)
      .get(),
  ]);

  if (!divisionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Division not found');
  }

  // The generator pairs individuals, so publishing into a doubles level would
  // create unplayable 1v1 fixtures. Decided by the stored level rather than the
  // payload, so an older client that omits matchType cannot slip past it.
  if (levelSnap.data()?.matchType === 'doubles') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      DOUBLES_NOT_SUPPORTED_MESSAGE,
    );
  }

  const actor = actorSnap.data();
  const division = divisionSnap.data();
  const leaderIds: string[] = Array.isArray(division?.leaderIds) ? division.leaderIds : [];
  const isAdminOrDeveloper = actor?.role === 'admin' || actor?.role === 'app_developer';
  const isLeader = leaderIds.includes(request.auth.uid) || division?.leaderId === request.auth.uid;

  if (!isPrivilegedRole(actor?.role) || (!isAdminOrDeveloper && !isLeader)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins, app developers, and division leaders can publish a schedule',
    );
  }

  const divisionPlayerIds: string[] = Array.isArray(division?.playerIds) ? division.playerIds : [];
  const isInDivision = (id: string, data: Record<string, unknown> | undefined) =>
    data?.divisionId === safeDivisionId || divisionPlayerIds.includes(id) || leaderIds.includes(id);

  const playerSnaps = await Promise.all(
    safePlayerIds.map((id) => db.collection('users').doc(id).get()),
  );
  for (let i = 0; i < safePlayerIds.length; i++) {
    if (!playerSnaps[i].exists || !isInDivision(safePlayerIds[i], playerSnaps[i].data())) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Every selected player must belong to the selected division',
      );
    }
  }
  const playerNames = new Map(
    playerSnaps.map((snap) => [snap.id, (snap.data()?.displayName as string | undefined) ?? snap.id]),
  );

  const matchups = generateRoundRobinSchedule(safePlayerIds, {
    doubleRoundRobin: doubleRoundRobin === true,
  });
  if (matchups.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No matchups could be generated');
  }

  const writer = db.bulkWriter();

  if (clearExisting === true) {
    const existingSnap = await db
      .collection('matches')
      .where('divisionId', '==', safeDivisionId)
      .where('seasonId', '==', safeSeasonId)
      .where('divisionLevelId', '==', safeDivisionLevelId)
      .where('status', '==', 'scheduled')
      .where('source', '==', 'schedule')
      .get();
    existingSnap.docs.forEach((doc) => writer.delete(doc.ref));
  }

  const now = Date.now();
  let matchesCreated = 0;
  let roundsCreated = 0;

  for (const matchup of matchups) {
    const scheduledAt = safeStartAt + (matchup.round - 1) * safeIntervalDays * DAY_MS;
    const matchData: Omit<Match, 'id'> = {
      divisionId: safeDivisionId,
      seasonId: safeSeasonId,
      divisionLevelId: safeDivisionLevelId,
      ...(safeMatchType ? { matchType: safeMatchType } : {}),
      player1Id: matchup.player1Id,
      player2Id: matchup.player2Id,
      player1Name: playerNames.get(matchup.player1Id) ?? matchup.player1Id,
      player2Name: playerNames.get(matchup.player2Id) ?? matchup.player2Id,
      player2IsGuest: false,
      playerIds: [matchup.player1Id, matchup.player2Id],
      format: DEFAULT_FORMAT,
      status: 'scheduled',
      liveScore: createInitialScore(DEFAULT_FORMAT),
      stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
      advancedStatsEnabled: false,
      tipsEnabled: true,
      source: 'schedule',
      isDivisionMatch: true,
      createdBy: request.auth.uid,
      scheduledAt,
      createdAt: now,
    };
    writer.create(db.collection('matches').doc(), matchData);
    matchesCreated += 1;
    roundsCreated = Math.max(roundsCreated, matchup.round);
  }

  await writer.close();

  return { success: true, matchesCreated, roundsCreated };
});
