import { useState, useEffect } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { rankingsQuery, completedDivisionMatchesQuery, usersCol } from '../collections';
import { computeRankings, extractMatchTotals } from '@tennis/shared';
import type { PlayerRanking, Match, HeadToHead, User } from '@tennis/shared';

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

function rankingFromRosterUser(user: User, divisionId: string): PlayerRanking {
  const summary =
    user.rankingSummary?.divisionId === divisionId ? user.rankingSummary : null;
  const gamesWon = summary?.gamesWon ?? 0;
  const gamesLost = summary?.gamesLost ?? 0;

  return {
    userId: user.id,
    displayName: user.displayName || user.email || user.id,
    divisionId,
    season: 'current',
    rank: summary?.rank ?? 0,
    matchesPlayed: summary?.matchesPlayed ?? 0,
    matchesWon: summary?.matchesWon ?? 0,
    matchesLost: summary?.matchesLost ?? 0,
    setsWon: summary?.setsWon ?? 0,
    setsLost: summary?.setsLost ?? 0,
    gamesWon,
    gamesLost,
    gameDifferential: summary?.gameDifferential ?? gamesWon - gamesLost,
    updatedAt: summary?.updatedAt ?? user.updatedAt ?? 0,
  };
}

function mergeRankingSources(
  primaryRankings: PlayerRanking[],
  fallbackRankings: PlayerRanking[],
  rosterRankings: PlayerRanking[],
): PlayerRanking[] {
  const byUserId = new Map<string, PlayerRanking>();
  [primaryRankings, fallbackRankings, rosterRankings].forEach((source) => {
    source.forEach((ranking) => {
      if (!byUserId.has(ranking.userId)) {
        byUserId.set(ranking.userId, ranking);
      }
    });
  });

  return [...byUserId.values()]
    .sort((a, b) => {
      const aRank = a.rank > 0 ? a.rank : Number.MAX_SAFE_INTEGER;
      const bRank = b.rank > 0 ? b.rank : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((ranking, index) => ({ ...ranking, rank: index + 1 }));
}

function normalizeIdentity(value?: string): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function createCanonicalIdResolver(roster: PlayerRanking[]) {
  const keyToUserId = new Map<string, string>();

  for (const player of roster) {
    const userIdKey = normalizeIdentity(player.userId);
    const nameKey = normalizeIdentity(player.displayName);
    if (userIdKey && !keyToUserId.has(userIdKey)) {
      keyToUserId.set(userIdKey, player.userId);
    }
    if (nameKey && !keyToUserId.has(nameKey)) {
      keyToUserId.set(nameKey, player.userId);
    }
  }

  return ({ userId, displayName }: { userId: string; displayName?: string }) => {
    const userIdKey = normalizeIdentity(userId);
    const nameKey = normalizeIdentity(displayName);

    return (
      (userIdKey ? keyToUserId.get(userIdKey) : undefined) ??
      (nameKey ? keyToUserId.get(nameKey) : undefined) ??
      userId
    );
  };
}

function buildRankingsFromMatches(
  matches: Match[],
  divisionId: string,
  roster: PlayerRanking[],
): { rankings: PlayerRanking[]; countedMatchCount: number } {
  const resolveCanonicalId = createCanonicalIdResolver(roster);
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
    if (match.isDivisionMatch === false) continue;
    if (!match.liveScore?.sets?.length) continue;
    countedMatchCount += 1;

    const { player1Id, player2Id, winner, liveScore } = match;
    const isGuestMatch = match.player2IsGuest === true;
    const player1Name = match.player1Name ?? player1Id;
    const player2Name = match.player2Name ?? player2Id;
    const resolvedPlayer1Id = resolveCanonicalId({ userId: player1Id, displayName: player1Name });
    const resolvedPlayer2Id = resolveCanonicalId({ userId: player2Id, displayName: player2Name });

    if (!statsMap.has(resolvedPlayer1Id)) {
      statsMap.set(resolvedPlayer1Id, {
        matchesWon: 0,
        matchesLost: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        displayName: player1Name,
      });
    }
    if (!isGuestMatch && !statsMap.has(resolvedPlayer2Id)) {
      statsMap.set(resolvedPlayer2Id, {
        matchesWon: 0,
        matchesLost: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        displayName: player2Name,
      });
    }

    const p1Stats = statsMap.get(resolvedPlayer1Id)!;
    const p2Stats = isGuestMatch ? null : statsMap.get(resolvedPlayer2Id)!;

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(
      liveScore.sets,
    );
    const p1Won = winner === 'player1';

    if (p1Won) {
      p1Stats.matchesWon += 1;
      if (p2Stats) p2Stats.matchesLost += 1;
    } else {
      if (p2Stats) p2Stats.matchesWon += 1;
      p1Stats.matchesLost += 1;
    }

    p1Stats.setsWon += p1Sets;
    p1Stats.setsLost += p2Sets;
    if (p2Stats) {
      p2Stats.setsWon += p2Sets;
      p2Stats.setsLost += p1Sets;
    }

    p1Stats.gamesWon += p1Games;
    p1Stats.gamesLost += p2Games;
    if (p2Stats) {
      p2Stats.gamesWon += p2Games;
      p2Stats.gamesLost += p1Games;
    }

    if (isGuestMatch) continue;

    const [h2hPlayer1Id, h2hPlayer2Id] = [resolvedPlayer1Id, resolvedPlayer2Id].sort();
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
    const winnerUserId = winner === 'player1' ? resolvedPlayer1Id : resolvedPlayer2Id;
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
    let rosterRankings: PlayerRanking[] = [];
    let countedMatchCount = 0;
    let rankingsReady = false;
    let matchesReady = false;
    let rosterReady = false;

    const syncRankings = () => {
      let nextRankings: PlayerRanking[];
      const hasFirestoreStats = firestoreRankings.some(hasRankingStats);
      if (hasFirestoreStats) {
        // Prefer server-calculated standings when present, but merge in
        // locally computed and roster-only fallbacks so a missing ranking
        // document or user.rankingSummary does not hide an active player.
        nextRankings = mergeRankingSources(
          firestoreRankings,
          computedRankings,
          rosterRankings,
        );
      } else if (computedRankings.length > 0) {
        // Fallback to local computation only before server standings exist.
        const computedIds = new Set(computedRankings.map((r) => r.userId));
        const unplayed = [...firestoreRankings, ...rosterRankings]
          .filter((r) => !computedIds.has(r.userId) && !hasRankingStats(r))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        nextRankings = mergeRankingSources(computedRankings, unplayed, []).map((r, index) => ({
          ...r,
          rank: index + 1,
        }));
      } else if (matchesReady && countedMatchCount === 0) {
        nextRankings = [...firestoreRankings, ...rosterRankings]
          .filter((r) => !hasRankingStats(r))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
          .map((r, index) => ({ ...r, rank: index + 1 }));
      } else {
        nextRankings = mergeRankingSources(firestoreRankings, [], rosterRankings);
      }
      setRankings(nextRankings);
      if (rankingsReady && matchesReady && rosterReady) {
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
          const result = buildRankingsFromMatches(matches, divisionId, firestoreRankings);
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

    const unsubRoster = onSnapshot(
      query(usersCol(), where('divisionId', '==', divisionId)),
      (snap) => {
        rosterRankings = snap.docs.map((d) =>
          rankingFromRosterUser({ ...(d.data() as User), id: d.id }, divisionId),
        );
        rosterReady = true;
        syncRankings();
      },
      (err) => {
        setError(err);
        rosterRankings = [];
        rosterReady = true;
        syncRankings();
      },
    );

    return () => {
      unsubRankings();
      unsubMatches();
      unsubRoster();
    };
  }, [divisionId]);

  return { rankings, loading, error };
}
