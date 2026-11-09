import type { getFirestore } from 'firebase-admin/firestore';

type Db = ReturnType<typeof getFirestore>;

/** Memberships that put a player on a season's roster. */
const ROSTERED_MEMBERSHIP_STATUSES = ['active', 'waitlisted'];

export type InferredMatchLevel = {
  divisionLevelId: string;
  matchType?: 'singles' | 'doubles';
};

/**
 * The one division level every player in a match is rostered in, or undefined
 * when they share none or more than one. `levelsByPlayer` holds each player's
 * level ids for the match's season.
 */
export function sharedDivisionLevel(
  levelsByPlayer: string[][],
  matchTypeOf: (levelId: string) => 'singles' | 'doubles' | undefined = () => undefined,
): string | undefined {
  if (levelsByPlayer.length === 0) return undefined;
  const [first, ...rest] = levelsByPlayer;
  const shared = [...new Set(first)].filter((id) => rest.every((levels) => levels.includes(id)));
  if (shared.length === 1) return shared[0];
  // A player can hold one singles and one doubles level in a season, so two
  // players can share both. The results inferred here are singles results,
  // which belong in the singles level.
  const singles = shared.filter((id) => (matchTypeOf(id) ?? 'singles') === 'singles');
  return singles.length === 1 ? singles[0] : undefined;
}

function levelMatchType(value: unknown): 'singles' | 'doubles' | undefined {
  return value === 'singles' || value === 'doubles' ? value : undefined;
}

/**
 * The division level a recorded result belongs to when the client sent none.
 *
 * A result recorded without a level is listed under no level filter on the
 * matches page and ranked in a level-less bucket that no level's standings
 * read, so it disappears from both. When every (non-guest) player is rostered
 * in exactly one shared level that season, that is where the result belongs.
 */
export async function inferMatchDivisionLevel(
  db: Db,
  input: { divisionId: string; seasonId: string; playerIds: string[] },
): Promise<InferredMatchLevel | undefined> {
  const { divisionId, seasonId, playerIds } = input;
  if (!seasonId || playerIds.length === 0) return undefined;
  const divisionRef = db.collection('divisions').doc(divisionId);
  const snaps = await Promise.all(
    playerIds.map((userId) =>
      divisionRef
        .collection('memberships')
        .where('userId', '==', userId)
        .where('seasonId', '==', seasonId)
        .where('status', 'in', ROSTERED_MEMBERSHIP_STATUSES)
        .get(),
    ),
  );
  const levelsByPlayer = snaps.map((snap) =>
    snap.docs
      .map((doc) => doc.data().divisionLevelId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );
  const candidateIds = [...new Set(levelsByPlayer.flat())];
  const levelSnaps = await Promise.all(
    candidateIds.map((id) => divisionRef.collection('levels').doc(id).get()),
  );
  const levelById = new Map(levelSnaps.map((snap) => [snap.id, snap.exists ? snap.data() : undefined]));
  const divisionLevelId = sharedDivisionLevel(levelsByPlayer, (id) =>
    levelMatchType(levelById.get(id)?.matchType),
  );
  if (!divisionLevelId) return undefined;

  const level = levelById.get(divisionLevelId);
  if (!level || level.seasonId !== seasonId) return undefined;
  const matchType = levelMatchType(level.matchType);
  return { divisionLevelId, ...(matchType ? { matchType } : {}) };
}

/**
 * Loads a division's rostered memberships and levels once, for a pass over
 * many matches. Returns the same answer `inferMatchDivisionLevel` would.
 */
export async function loadDivisionLevelResolver(
  db: Db,
  divisionId: string,
): Promise<(seasonId: string, playerIds: string[]) => InferredMatchLevel | undefined> {
  const divisionRef = db.collection('divisions').doc(divisionId);
  const [membershipsSnap, levelsSnap] = await Promise.all([
    divisionRef.collection('memberships').where('status', 'in', ROSTERED_MEMBERSHIP_STATUSES).get(),
    divisionRef.collection('levels').get(),
  ]);
  const levels = new Map(levelsSnap.docs.map((doc) => [doc.id, doc.data()]));
  const levelsBySeasonPlayer = new Map<string, string[]>();
  membershipsSnap.docs.forEach((doc) => {
    const { seasonId, userId, divisionLevelId } = doc.data();
    if (typeof seasonId !== 'string' || typeof userId !== 'string') return;
    if (typeof divisionLevelId !== 'string' || !divisionLevelId.trim()) return;
    const key = `${seasonId}\u0000${userId}`;
    levelsBySeasonPlayer.set(key, [...(levelsBySeasonPlayer.get(key) ?? []), divisionLevelId]);
  });

  return (seasonId, playerIds) => {
    if (!seasonId || playerIds.length === 0) return undefined;
    const divisionLevelId = sharedDivisionLevel(
      playerIds.map((userId) => levelsBySeasonPlayer.get(`${seasonId}\u0000${userId}`) ?? []),
      (id) => levelMatchType(levels.get(id)?.matchType),
    );
    const level = divisionLevelId ? levels.get(divisionLevelId) : undefined;
    if (!divisionLevelId || level?.seasonId !== seasonId) return undefined;
    const matchType = levelMatchType(level.matchType);
    return { divisionLevelId, ...(matchType ? { matchType } : {}) };
  };
}
