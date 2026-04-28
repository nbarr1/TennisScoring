import { useState, useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { rankingsQuery, completedDivisionMatchesQuery } from '../collections';
import { computeRankings, extractMatchTotals } from '@tennis/shared';
import type { PlayerRanking, Match, HeadToHead } from '@tennis/shared';

function hasRankingStats(ranking: PlayerRanking): boolean {
  return (
    ranking.matchesPlayed > 0 ||
    ranking.matchesWon > 0 ||
    ranking.matchesLost > 0 ||
    ranking.setsWon > 0 ||
    ranking.setsLost > 0 ||
    ranking.gamesWon > 0 ||
    ranking.gamesLost > 0
  );
}

function buildRankingsFromMatches(
  matches: Match[],
  divisionId: string,
): { rankings: PlayerRanking[]; countedMatchCount: number } {
  const statsMap = new Map<
    string,
    {
      matchesWon: number;
      matchesLost: number;
      setsWon: number;
      setsLost: number;
      gamesWon: number;
      gamesLost: number;
      displayName: string;
    }
  >();

  const h2hAccum = new Map<string, HeadToHead>();
  let countedMatchCount = 0;

  for (const match of matches) {
    // Skip matches without winner, non-division matches, or incomplete scores
    if (!match.winner) continue;
    if (match.isDivisionMatch === false) continue; // UPDATED: Use isDivisionMatch flag
    if (!match.liveScore?.sets?.length) continue;
    countedMatchCount += 1;

    const { player1Id, player2Id, winner, liveScore } = match;
    const player1Name = match.player1Name ?? player1Id;
    const player2Name = match.player2Name ?? player2Id;

    if (!statsMap.has(player1Id)) {
      statsMap.set(player1Id, {
        matchesWon: 0,
        matchesLost: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        displayName: player1Name,
      });
    }
    if (!statsMap.has(player2Id)) {
      statsMap.set(player2Id, {
        matchesWon: 0,
        matchesLost: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        displayName: player2Name,
      });
    }

    const p1Stats = statsMap.get(player1Id)!;
    const p2Stats = statsMap.get(player2Id)!;

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(
      liveScore.sets,
    );
    const p1Won = winner === 'player1';

    if (p1Won) {
      p1Stats.matchesWon += 1;
      p2Stats.matchesLost += 1;
    } else {
      p2Stats.matchesWon += 1;
      p1Stats.matchesLost += 1;
    }

    p1Stats.setsWon += p1Sets;
    p1Stats.setsLost += p2Sets;
    p2Stats.setsWon += p2Sets;
    p2Stats.setsLost += p1Sets;

    p1Stats.gamesWon += p1Games;
    p1Stats.gamesLost += p2Games;
    p2Stats.gamesWon += p2Games;
    p2Stats.gamesLost += p1Games;

    const [h2hPlayer1Id, h2hPlayer2Id] = [player1Id, player2Id].sort();
    const h2hId = `${h2hPlayer1Id}_${h2hPlayer2Id}`;

    if (!h2hAccum.has(h2hId)) {
      h2hAccum.set(h2hId, {
        id: h2hId,
        divisionId,
        player1Id: h2hPlayer1Id,
        player2Id: h2hPlayer2Id,
        player1Wins: 0,
        player2Wins: 0,
      });
    }

    const h2h = h2hAccum.get(h2hId)!;
    const winnerUserId = winner === 'player1' ? player1Id : player2Id;
    if (winnerUserId === h2h.player1Id) {
      h2h.player1Wins += 1;
    } else {
      h2h.player2Wins += 1;
    }
  }

  const rankingInputs = [...statsMap.entries()].map(([userId, stats]) => ({
    userId,
    displayName: stats.displayName,
    divisionId,
    season: 'current',
    matchesWon: stats.matchesWon,
    matchesLost: stats.matchesLost,
    setsWon: stats.setsWon,
    setsLost: stats.setsLost,
    gamesWon: stats.gamesWon,
    gamesLost: stats.gamesLost,
  }));

  return {
    rankings: computeRankings(rankingInputs, [...h2hAccum.values()]),
    countedMatchCount,
  };
}

export function useRankings(divisionId: string | null) {
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!divisionId) {
      setRankings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let firestoreRankings: PlayerRanking[] = [];
    let computedRankings: PlayerRanking[] = [];
    let countedMatchCount = 0;
    let rankingsReady = false;
    let matchesReady = false;

    const syncRankings = () => {
      let nextRankings: PlayerRanking[];
      if (computedRankings.length > 0) {
        // Use locally-computed stats (always fresh) and add any division players
        // who haven't played yet. Only zero-stat Firestore docs are safe to
        // merge here; nonzero docs may be stale after exclusions/deletions.
        const computedIds = new Set(computedRankings.map((r) => r.userId));
        const unplayed = firestoreRankings
          .filter((r) => !computedIds.has(r.userId) && !hasRankingStats(r))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        nextRankings = [...computedRankings, ...unplayed].map((r, index) => ({
          ...r,
          rank: index + 1,
        }));
      } else if (matchesReady && countedMatchCount === 0) {
        nextRankings = firestoreRankings
          .filter((r) => !hasRankingStats(r))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
          .map((r, index) => ({ ...r, rank: index + 1 }));
      } else {
        nextRankings = firestoreRankings;
      }
      setRankings(nextRankings);
      if (rankingsReady && matchesReady) {
        setLoading(false);
      }
    };

    const unsubRankings = onSnapshot(
      rankingsQuery(divisionId),
      (snap) => {
        firestoreRankings = snap.docs.map((d) => d.data() as PlayerRanking);
        rankingsReady = true;
        syncRankings();
      },
      (err) => {
        setError(err);
        rankingsReady = true;
        syncRankings();
      },
    );

    const unsubMatches = onSnapshot(
      completedDivisionMatchesQuery(divisionId),
      (snap) => {
        try {
          const matches = snap.docs.map((d) => d.data() as Match);
          const result = buildRankingsFromMatches(matches, divisionId);
          computedRankings = result.rankings;
          countedMatchCount = result.countedMatchCount;
        } catch {
          computedRankings = [];
          countedMatchCount = 0;
        }
        matchesReady = true;
        syncRankings();
      },
      (err) => {
        setError(err);
        matchesReady = true;
        syncRankings();
      },
    );

    return () => {
      unsubRankings();
      unsubMatches();
    };
  }, [divisionId]);

  return { rankings, loading, error };
}
