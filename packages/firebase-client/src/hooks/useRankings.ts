import { useState, useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { rankingsQuery, completedDivisionMatchesQuery } from '../collections';
import { computeRankings, extractMatchTotals } from '@tennis/shared';
import type { PlayerRanking, Match, HeadToHead } from '@tennis/shared';

function buildRankingsFromMatches(matches: Match[], divisionId: string): PlayerRanking[] {
  const statsMap = new Map<string, {
    matchesWon: number;
    matchesLost: number;
    setsWon: number;
    setsLost: number;
    gamesWon: number;
    gamesLost: number;
    displayName: string;
  }>();

  const h2hAccum = new Map<string, HeadToHead>();

  for (const match of matches) {
    if (!match.winner || match.player2IsGuest) continue;

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

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(liveScore.sets);
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

  return computeRankings(rankingInputs, [...h2hAccum.values()]);
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
    let rankingsReady = false;
    let matchesReady = false;

    const syncRankings = () => {
      const nextRankings = computedRankings.length > 0 ? computedRankings : firestoreRankings;
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
      }
    );

    const unsubMatches = onSnapshot(
      completedDivisionMatchesQuery(divisionId),
      (snap) => {
        const matches = snap.docs.map((d) => d.data() as Match);
        computedRankings = buildRankingsFromMatches(matches, divisionId);
        matchesReady = true;
        syncRankings();
      },
      (err) => {
        setError(err);
        matchesReady = true;
        syncRankings();
      }
    );

    return () => {
      unsubRankings();
      unsubMatches();
    };
  }, [divisionId]);

  return { rankings, loading, error };
}
