import type { PlayerRanking, DoublesTeamRanking, HeadToHead } from '../types/ranking';

export interface RankingInput {
  userId: string;
  displayName: string;
  divisionId: string;
  season: string;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
}

/**
 * One doubles partnership's running totals. Mirrors `RankingInput` but is keyed
 * on the team rather than an individual, so both partners' results land on the
 * same row.
 */
export interface DoublesTeamRankingInput {
  teamId: string;
  playerIds: string[];
  displayName: string;
  divisionId: string;
  season: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
}

/** The fields the shared comparator needs, whatever the entity is keyed on. */
interface RankableTotals {
  displayName: string;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  gamesWon: number;
  gameDifferential: number;
}

/**
 * Sorts entities into standings order and assigns 1-based ranks.
 *
 * Shared by singles and doubles so the tiebreak order is defined once:
 * matches won -> sets won -> games won -> game differential -> head-to-head ->
 * display name. `keyOf` supplies the id used for head-to-head lookups (a user
 * id for singles, a team id for doubles).
 */
function rankEntities<T extends RankableTotals>(
  entities: T[],
  keyOf: (entity: T) => string,
  headToHeads: HeadToHead[],
): T[] {
  const h2hMap = buildH2HMap(headToHeads);
  const sorted = entities.sort((a, b) =>
    compareRankableTotals(a, b, keyOf(a), keyOf(b), h2hMap),
  );
  return sorted.map((entity, i) => ({ ...entity, rank: i + 1 }));
}

export function computeRankings(
  inputs: RankingInput[],
  headToHeads: HeadToHead[]
): PlayerRanking[] {
  const now = Date.now();

  const players: PlayerRanking[] = inputs.map((p) => ({
    ...p,
    matchesPlayed: p.matchesWon + p.matchesLost,
    gameDifferential: p.gamesWon - p.gamesLost,
    rank: 0,
    updatedAt: now,
  }));

  return rankEntities(players, (p) => p.userId, headToHeads);
}

/**
 * Doubles standings, one row per fixed partnership.
 *
 * `headToHeads` are team-vs-team records (their `player1Id`/`player2Id` hold
 * team ids), so a partnership that swept another partnership outranks it on the
 * head-to-head tiebreak exactly as two individuals would.
 */
export function computeDoublesRankings(
  inputs: DoublesTeamRankingInput[],
  headToHeads: HeadToHead[]
): DoublesTeamRanking[] {
  const now = Date.now();

  const teams: DoublesTeamRanking[] = inputs.map((t) => ({
    ...t,
    matchesPlayed: t.matchesWon + t.matchesLost,
    gameDifferential: t.gamesWon - t.gamesLost,
    rank: 0,
    updatedAt: now,
  }));

  return rankEntities(teams, (t) => t.teamId, headToHeads);
}

function buildH2HMap(h2hs: HeadToHead[]): Map<string, Map<string, number>> {
  // map[winnerId][loserId] = wins
  const map = new Map<string, Map<string, number>>();
  for (const h of h2hs) {
    if (!map.has(h.player1Id)) map.set(h.player1Id, new Map());
    if (!map.has(h.player2Id)) map.set(h.player2Id, new Map());
    map.get(h.player1Id)!.set(h.player2Id, h.player1Wins);
    map.get(h.player2Id)!.set(h.player1Id, h.player2Wins);
  }
  return map;
}

function compareRankableTotals(
  a: RankableTotals,
  b: RankableTotals,
  aKey: string,
  bKey: string,
  h2hMap: Map<string, Map<string, number>>
): number {
  // 1. Matches won
  if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
  // 2. Sets won
  if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
  // 3. Games won
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
  // 4. Game differential
  if (b.gameDifferential !== a.gameDifferential) return b.gameDifferential - a.gameDifferential;
  // 5. Head-to-head
  const aWinsVsB = h2hMap.get(aKey)?.get(bKey) ?? 0;
  const bWinsVsA = h2hMap.get(bKey)?.get(aKey) ?? 0;
  if (aWinsVsB !== bWinsVsA) return bWinsVsA - aWinsVsB;
  // 6. Alphabetical tiebreaker for stable sort
  return a.displayName.localeCompare(b.displayName);
}

export function updateRankingWithMatchResult(
  existing: RankingInput,
  won: boolean,
  setsWon: number,
  setsLost: number,
  gamesWon: number,
  gamesLost: number
): RankingInput {
  return {
    ...existing,
    matchesWon: existing.matchesWon + (won ? 1 : 0),
    matchesLost: existing.matchesLost + (won ? 0 : 1),
    setsWon: existing.setsWon + setsWon,
    setsLost: existing.setsLost + setsLost,
    gamesWon: existing.gamesWon + gamesWon,
    gamesLost: existing.gamesLost + gamesLost,
  };
}


function inferWinnerFromCompletedSetScore(player1Games: number, player2Games: number): 'player1' | 'player2' | undefined {
  const maxGames = Math.max(player1Games, player2Games);
  const minGames = Math.min(player1Games, player2Games);

  const isStandardWin = maxGames >= 6 && maxGames - minGames >= 2;
  const isSevenFiveOrSevenSix = maxGames === 7 && (minGames === 5 || minGames === 6);

  if (!isStandardWin && !isSevenFiveOrSevenSix) {
    return undefined;
  }

  return player1Games > player2Games ? 'player1' : 'player2';
}

export function extractMatchTotals(sets: Array<{ player1Games: number; player2Games: number; winner?: string }>) {
  let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
  for (const s of sets) {
    const inferredWinner = inferWinnerFromCompletedSetScore(
      s.player1Games,
      s.player2Games,
    );
    const winner = s.winner ?? inferredWinner;

    if (!winner) continue; // Ignore open/incomplete or invalid tie sets

    p1Games += s.player1Games;
    p2Games += s.player2Games;
    if (winner === 'player1') p1Sets++;
    else if (winner === 'player2') p2Sets++;
  }
  return { p1Sets, p2Sets, p1Games, p2Games };
}
