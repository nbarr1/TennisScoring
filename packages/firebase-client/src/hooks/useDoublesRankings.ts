import { useState, useEffect } from 'react';
import { onSnapshot, where } from 'firebase/firestore';
import { doublesRankingsQuery, completedDivisionMatchesQuery } from '../collections';
import {
  computeDoublesRankings,
  extractMatchTotals,
  doublesTeamId,
  doublesHeadToHeadId,
  formatDoublesTeamName,
  sidePlayerIds,
  sideDisplayName,
} from '@tennis/shared';
import type {
  DoublesTeamRanking,
  DoublesTeamRankingInput,
  Match,
  HeadToHead,
} from '@tennis/shared';

function hasTeamStats(ranking: DoublesTeamRanking): boolean {
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

function emptyTeamTotals() {
  return {
    matchesWon: 0,
    matchesLost: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
  };
}

/**
 * Recomputes doubles standings from completed matches on the client.
 *
 * Mirrors the server-side pass in `recalculateRankings` so standings appear
 * immediately after a match is confirmed, before the Cloud Function has
 * written its documents. Both sides key on `doublesTeamId`, so the two
 * computations agree.
 */
function buildDoublesRankingsFromMatches(
  matches: Match[],
  divisionId: string,
): { rankings: DoublesTeamRanking[]; countedMatchCount: number } {
  const teamTotals = new Map<
    string,
    ReturnType<typeof emptyTeamTotals> & { playerIds: string[]; displayName: string }
  >();
  const h2hAccum = new Map<string, HeadToHead>();
  let countedMatchCount = 0;

  for (const match of matches) {
    if (match.matchType !== 'doubles') continue;
    if (!match.winner) continue;
    if (match.isDivisionMatch === false) continue;
    if (!match.liveScore?.sets?.length) continue;

    const side1PlayerIds = sidePlayerIds(match, 'player1');
    const side2PlayerIds = sidePlayerIds(match, 'player2');
    const team1Id = doublesTeamId(side1PlayerIds);
    const team2Id = doublesTeamId(side2PlayerIds);
    if (!team1Id || !team2Id || team1Id === team2Id) continue;

    countedMatchCount += 1;

    const team1Name = sideDisplayName(match, 'player1') || formatDoublesTeamName(side1PlayerIds);
    const team2Name = sideDisplayName(match, 'player2') || formatDoublesTeamName(side2PlayerIds);

    if (!teamTotals.has(team1Id)) {
      teamTotals.set(team1Id, {
        ...emptyTeamTotals(),
        playerIds: side1PlayerIds,
        displayName: team1Name,
      });
    }
    if (!teamTotals.has(team2Id)) {
      teamTotals.set(team2Id, {
        ...emptyTeamTotals(),
        playerIds: side2PlayerIds,
        displayName: team2Name,
      });
    }

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(match.liveScore.sets);
    const team1Won = match.winner === 'player1';

    const team1 = teamTotals.get(team1Id)!;
    if (team1Won) team1.matchesWon += 1;
    else team1.matchesLost += 1;
    team1.setsWon += p1Sets;
    team1.setsLost += p2Sets;
    team1.gamesWon += p1Games;
    team1.gamesLost += p2Games;

    const team2 = teamTotals.get(team2Id)!;
    if (team1Won) team2.matchesLost += 1;
    else team2.matchesWon += 1;
    team2.setsWon += p2Sets;
    team2.setsLost += p1Sets;
    team2.gamesWon += p2Games;
    team2.gamesLost += p1Games;

    const h2hId = doublesHeadToHeadId(team1Id, team2Id);
    const [h2hFirstId, h2hSecondId] = [team1Id, team2Id].sort();
    if (!h2hAccum.has(h2hId)) {
      h2hAccum.set(h2hId, {
        id: h2hId,
        divisionId,
        player1Id: h2hFirstId,
        player2Id: h2hSecondId,
        player1Wins: 0,
        player2Wins: 0,
        matchType: 'doubles',
      });
    }
    const h2h = h2hAccum.get(h2hId)!;
    const winningTeamId = team1Won ? team1Id : team2Id;
    if (winningTeamId === h2hFirstId) h2h.player1Wins += 1;
    else h2h.player2Wins += 1;
  }

  const inputs: DoublesTeamRankingInput[] = [...teamTotals.entries()].map(([teamId, totals]) => ({
    teamId,
    playerIds: totals.playerIds,
    displayName: totals.displayName,
    divisionId,
    season: 'current',
    matchesWon: totals.matchesWon,
    matchesLost: totals.matchesLost,
    setsWon: totals.setsWon,
    setsLost: totals.setsLost,
    gamesWon: totals.gamesWon,
    gamesLost: totals.gamesLost,
  }));

  return {
    rankings: computeDoublesRankings(inputs, [...h2hAccum.values()]),
    countedMatchCount,
  };
}

/**
 * Live doubles team standings for a division.
 *
 * Prefers the server-written `divisions/{id}/doublesRankings` documents and
 * falls back to a client-side recompute from completed doubles matches while
 * those documents are absent or empty.
 */
export function useDoublesRankings(
  divisionId: string | null,
  filters?: { seasonId?: string; divisionLevelId?: string },
) {
  const [rankings, setRankings] = useState<DoublesTeamRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!divisionId) {
      setRankings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let firestoreRankings: DoublesTeamRanking[] = [];
    let computedRankings: DoublesTeamRanking[] = [];
    let rankingsReady = false;
    let matchesReady = false;

    const syncRankings = () => {
      const hasServerStats = firestoreRankings.some(hasTeamStats);
      setRankings(hasServerStats ? firestoreRankings : computedRankings);
      if (rankingsReady && matchesReady) {
        setLoading(false);
      }
    };

    const constraints = [
      ...(filters?.seasonId ? [where('seasonId', '==', filters.seasonId)] : []),
      ...(filters?.divisionLevelId
        ? [where('divisionLevelId', '==', filters.divisionLevelId)]
        : []),
    ];

    const unsubRankings = onSnapshot(
      doublesRankingsQuery(divisionId, ...constraints),
      (snap) => {
        firestoreRankings = snap.docs.map((d) => d.data() as DoublesTeamRanking);
        rankingsReady = true;
        syncRankings();
      },
      (err) => {
        setError(err);
        firestoreRankings = [];
        rankingsReady = true;
        syncRankings();
      },
    );

    const unsubMatches = onSnapshot(
      completedDivisionMatchesQuery(divisionId, ...constraints),
      (snap) => {
        try {
          const matches = snap.docs.map((d) => d.data() as Match);
          computedRankings = buildDoublesRankingsFromMatches(matches, divisionId).rankings;
        } catch (err) {
          console.error('Failed to build doubles rankings from matches:', err);
          computedRankings = [];
        }
        matchesReady = true;
        syncRankings();
      },
      (err) => {
        setError(err);
        computedRankings = [];
        matchesReady = true;
        syncRankings();
      },
    );

    return () => {
      unsubRankings();
      unsubMatches();
    };
  }, [divisionId, filters?.divisionLevelId, filters?.seasonId]);

  return { rankings, loading, error };
}
