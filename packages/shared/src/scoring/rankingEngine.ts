import type { PlayerRanking, HeadToHead } from '../types/ranking';

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

  const h2hMap = buildH2HMap(headToHeads);

  const sorted = players.sort((a, b) => compareRankings(a, b, h2hMap));

  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
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

function compareRankings(
  a: PlayerRanking,
  b: PlayerRanking,
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
  const aWinsVsB = h2hMap.get(a.userId)?.get(b.userId) ?? 0;
  const bWinsVsA = h2hMap.get(b.userId)?.get(a.userId) ?? 0;
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

export function extractMatchTotals(sets: Array<{ player1Games: number; player2Games: number; winner?: string }>) {
  let p1Sets = 0, p2Sets = 0, p1Games = 0, p2Games = 0;
  for (const s of sets) {
    p1Games += s.player1Games;
    p2Games += s.player2Games;
    if (s.winner === 'player1') p1Sets++;
    else if (s.winner === 'player2') p2Sets++;
  }
  return { p1Sets, p2Sets, p1Games, p2Games };
}
