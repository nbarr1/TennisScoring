const ROUND_ROBIN_BYE = '__bye__';

export interface RoundRobinMatchup {
  round: number;
  player1Id: string;
  player2Id: string;
  leg: 1 | 2;
}

export interface GenerateRoundRobinOptions {
  doubleRoundRobin?: boolean;
}

function roundsForPlayerCount(count: number): number {
  const padded = count % 2 === 0 ? count : count + 1;
  return padded - 1;
}

function buildSingleLeg(
  playerIds: string[],
): { round: number; player1Id: string; player2Id: string }[] {
  const pool: string[] = [...playerIds];
  if (pool.length % 2 !== 0) pool.push(ROUND_ROBIN_BYE);
  const numPlayers = pool.length;
  const numRounds = numPlayers - 1;
  const matchesPerRound = numPlayers / 2;
  const matchups: { round: number; player1Id: string; player2Id: string }[] = [];

  for (let r = 0; r < numRounds; r++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const a = pool[i];
      const b = pool[numPlayers - 1 - i];
      if (a !== ROUND_ROBIN_BYE && b !== ROUND_ROBIN_BYE) {
        const [player1Id, player2Id] = (r + i) % 2 === 0 ? [a, b] : [b, a];
        matchups.push({ round: r + 1, player1Id, player2Id });
      }
    }
    const last = pool.pop() as string;
    pool.splice(1, 0, last);
  }

  return matchups;
}

/**
 * Berger/circle-rotation round robin. Player order determines pairing order
 * only (e.g. pre-sort by ranking for seeded pairings) — the algorithm itself
 * is order-agnostic. Odd player counts get a synthetic bye that rotates
 * through the pool like a real player but never produces a matchup.
 */
export function generateRoundRobinSchedule(
  playerIds: string[],
  options: GenerateRoundRobinOptions = {},
): RoundRobinMatchup[] {
  const uniquePlayerIds = Array.from(new Set(playerIds));
  if (uniquePlayerIds.length < 2) return [];

  const firstLeg: RoundRobinMatchup[] = buildSingleLeg(uniquePlayerIds).map((m) => ({
    ...m,
    leg: 1,
  }));
  if (!options.doubleRoundRobin) return firstLeg;

  const numRounds = roundsForPlayerCount(uniquePlayerIds.length);
  const secondLeg: RoundRobinMatchup[] = buildSingleLeg(uniquePlayerIds).map((m) => ({
    round: m.round + numRounds,
    player1Id: m.player2Id,
    player2Id: m.player1Id,
    leg: 2,
  }));

  return [...firstLeg, ...secondLeg];
}
