import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { formatDoublesTeamName } from '@tennis/shared';
import type { Match, MatchSide } from '@tennis/shared';

/**
 * The doubles-specific fields of a match document.
 *
 * `player1Id`/`player2Id` hold each side's first member so existing indexes,
 * rules, and queries keep working, and `player1Name`/`player2Name` mirror the
 * team display name so every renderer that reads the flat fields shows
 * "Ann Smith / Bob Jones" without being taught about sides.
 */
export type DoublesMatchFields = Pick<
  Match,
  'matchType' | 'side1' | 'side2' | 'player1Id' | 'player2Id' | 'player1Name' | 'player2Name' | 'playerIds' | 'player2IsGuest'
>;

const PLAYERS_PER_SIDE = 2;

function normalizeSideIds(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw)) {
    throw new functions.https.HttpsError('invalid-argument', `${label} must be an array of user ids`);
  }
  const ids = raw
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length !== PLAYERS_PER_SIDE) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `${label} must list exactly ${PLAYERS_PER_SIDE} players`,
    );
  }
  if (new Set(ids).size !== PLAYERS_PER_SIDE) {
    throw new functions.https.HttpsError('invalid-argument', `${label} lists the same player twice`);
  }
  return ids;
}

/**
 * Validates two doubles side rosters and builds the match fields for them.
 *
 * Every player must exist and belong to the division — the same membership test
 * the singles paths apply, extended to all four. Guests are not supported in
 * doubles, since a team standing needs four resolvable accounts.
 */
export async function buildDoublesMatchFields(params: {
  db: ReturnType<typeof getFirestore>;
  divisionId: string;
  side1PlayerIds: unknown;
  side2PlayerIds: unknown;
}): Promise<DoublesMatchFields> {
  const { db, divisionId } = params;
  const side1Ids = normalizeSideIds(params.side1PlayerIds, 'side1PlayerIds');
  const side2Ids = normalizeSideIds(params.side2PlayerIds, 'side2PlayerIds');

  const allIds = [...side1Ids, ...side2Ids];
  if (new Set(allIds).size !== allIds.length) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'A player cannot appear on both sides of a doubles match',
    );
  }

  const [divisionSnap, ...playerSnaps] = await Promise.all([
    db.collection('divisions').doc(divisionId).get(),
    ...allIds.map((id) => db.collection('users').doc(id).get()),
  ]);

  if (!divisionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Division not found');
  }

  const division = divisionSnap.data();
  const divisionPlayerIds: string[] = Array.isArray(division?.playerIds) ? division.playerIds : [];
  const leaderIds: string[] = Array.isArray(division?.leaderIds) ? division.leaderIds : [];

  const namesById = new Map<string, string>();
  playerSnaps.forEach((snap, index) => {
    const id = allIds[index];
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Every selected player must exist');
    }
    const data = snap.data();
    const inDivision =
      data?.divisionId === divisionId ||
      divisionPlayerIds.includes(id) ||
      leaderIds.includes(id);
    if (!inDivision) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Every selected player must belong to the selected division',
      );
    }
    namesById.set(id, (data?.displayName as string | undefined)?.trim() || id);
  });

  const nameFor = (ids: string[]) => formatDoublesTeamName(ids.map((id) => namesById.get(id) ?? id));

  const side1: MatchSide = { playerIds: side1Ids, displayName: nameFor(side1Ids) };
  const side2: MatchSide = { playerIds: side2Ids, displayName: nameFor(side2Ids) };

  return {
    matchType: 'doubles',
    side1,
    side2,
    player1Id: side1Ids[0],
    player2Id: side2Ids[0],
    player1Name: side1.displayName,
    player2Name: side2.displayName,
    playerIds: allIds,
    player2IsGuest: false,
  };
}

/** True when a callable payload asks for a doubles match. */
export function requestsDoubles(input: {
  matchType?: string;
  side1PlayerIds?: unknown;
  side2PlayerIds?: unknown;
}): boolean {
  return (
    input.matchType === 'doubles' &&
    Array.isArray(input.side1PlayerIds) &&
    Array.isArray(input.side2PlayerIds)
  );
}
