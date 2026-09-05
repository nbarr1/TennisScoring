import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { DEFAULT_FORMAT, EMPTY_STATS, createInitialScore } from '@tennis/shared';
import type { Match } from '@tennis/shared';
import { buildDoublesMatchFields } from './doublesSides';

if (!getApps().length) initializeApp();

type CreateDoublesMatchInput = {
  divisionId?: string;
  seasonId?: string;
  divisionLevelId?: string;
  side1PlayerIds?: unknown;
  side2PlayerIds?: unknown;
  status?: string;
  scheduledAt?: number;
  isDivisionMatch?: boolean;
};

/**
 * HTTPS callable: create a doubles match between two fixed partnerships.
 *
 * Doubles creation is server-side rather than a direct client write for two
 * reasons: the client `allow create` rule pins `playerIds` to a two-element
 * array, and checking four players' division membership in security rules would
 * exceed the per-request document access limit. The caller must be on one of
 * the two sides, so a player can only set up a match they are playing in.
 */
export const createDoublesMatch = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const {
    divisionId,
    seasonId,
    divisionLevelId,
    side1PlayerIds,
    side2PlayerIds,
    status,
    scheduledAt,
    isDivisionMatch,
  } = (request.data ?? {}) as CreateDoublesMatchInput;

  const safeDivisionId = typeof divisionId === 'string' ? divisionId.trim() : '';
  const safeSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const safeDivisionLevelId = typeof divisionLevelId === 'string' ? divisionLevelId.trim() : '';
  const safeStatus: Match['status'] = status === 'proposed' ? 'proposed' : 'scheduled';

  if (!safeDivisionId) {
    throw new functions.https.HttpsError('invalid-argument', 'divisionId is required');
  }

  const db = getFirestore();
  const doublesFields = await buildDoublesMatchFields({
    db,
    divisionId: safeDivisionId,
    side1PlayerIds,
    side2PlayerIds,
  });

  if (!doublesFields.playerIds.includes(request.auth.uid)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You can only create a doubles match you are playing in',
    );
  }

  const now = Date.now();
  const matchData: Omit<Match, 'id'> = {
    divisionId: safeDivisionId,
    ...(safeSeasonId ? { seasonId: safeSeasonId } : {}),
    ...(safeDivisionLevelId ? { divisionLevelId: safeDivisionLevelId } : {}),
    ...doublesFields,
    format: DEFAULT_FORMAT,
    status: safeStatus,
    liveScore: createInitialScore(DEFAULT_FORMAT),
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    advancedStatsEnabled: false,
    tipsEnabled: true,
    source: 'live',
    isDivisionMatch: isDivisionMatch ?? true,
    createdBy: request.auth.uid,
    ...(typeof scheduledAt === 'number' ? { scheduledAt } : {}),
    createdAt: now,
  };

  const matchRef = await db.collection('matches').add(matchData);
  return { success: true, matchId: matchRef.id, status: safeStatus };
});
