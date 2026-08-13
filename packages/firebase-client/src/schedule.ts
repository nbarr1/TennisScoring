import { httpsCallable } from 'firebase/functions';
import { functions } from './config';
import { generateRoundRobinSchedule } from '@tennis/shared';
import type { PlayerRanking, RoundRobinMatchup } from '@tennis/shared';

/**
 * Client-side preview: runs the exact same pure algorithm the server uses,
 * so what the leader sees before publishing is guaranteed to match what
 * `publishRoundRobinSchedule` actually creates.
 */
export function previewRoundRobinSchedule(params: {
  playerIds: string[];
  doubleRoundRobin?: boolean;
  seedByRankings?: boolean;
  rankings?: PlayerRanking[];
}): RoundRobinMatchup[] {
  const { playerIds, doubleRoundRobin, seedByRankings, rankings } = params;

  let orderedPlayerIds = playerIds;
  if (seedByRankings && rankings?.length) {
    const rankByUserId = new Map(rankings.map((r) => [r.userId, r.rank]));
    orderedPlayerIds = [...playerIds].sort(
      (a, b) => (rankByUserId.get(a) ?? Number.MAX_SAFE_INTEGER) - (rankByUserId.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  return generateRoundRobinSchedule(orderedPlayerIds, { doubleRoundRobin });
}

export async function publishRoundRobinSchedule(params: {
  divisionId: string;
  seasonId: string;
  divisionLevelId: string;
  matchType?: 'singles' | 'doubles';
  playerIds: string[];
  doubleRoundRobin?: boolean;
  startAt: number;
  intervalDays: number;
  clearExisting?: boolean;
}): Promise<{ matchesCreated: number; roundsCreated: number }> {
  const callable = httpsCallable<
    typeof params,
    { success: boolean; matchesCreated: number; roundsCreated: number }
  >(functions, 'publishRoundRobinSchedule');
  const result = await callable(params);
  return { matchesCreated: result.data.matchesCreated, roundsCreated: result.data.roundsCreated };
}
