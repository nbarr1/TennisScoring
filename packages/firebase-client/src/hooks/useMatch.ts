import { useState, useEffect } from 'react';
import { onSnapshot, updateDoc, addDoc, deleteField, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { matchDoc, matchesCol, liveMatchesQuery } from '../collections';
import { functions } from '../config';
import type { Match, Player, TipTrigger, LiveScore, SetScore } from '@tennis/shared';
import { applyPoint, DEFAULT_FORMAT as defaultFormat, createInitialScore, EMPTY_STATS } from '@tennis/shared';

export function useMatch(matchId: string | null) {
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      matchDoc(matchId),
      (snap) => {
        setMatch(snap.exists() ? (snap.data() as Match) : null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [matchId]);

  return { match, loading, error };
}

export async function createMatch(params: {
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  player2IsGuest?: boolean;
  divisionId: string;
  createdBy: string;
  scheduledAt?: number;
}): Promise<string> {
  const { player1Id, player2Id, player1Name, player2Name, player2IsGuest, divisionId, createdBy, scheduledAt } = params;

  const matchData: Omit<Match, 'id'> = {
    divisionId,
    player1Id,
    player2Id,
    ...(player1Name && { player1Name }),
    ...(player2Name && { player2Name }),
    player2IsGuest: player2IsGuest ?? false,
    playerIds: player2IsGuest ? [player1Id] : [player1Id, player2Id],
    format: defaultFormat,
    status: 'scheduled',
    liveScore: createInitialScore(defaultFormat),
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    tipsEnabled: true,
    source: 'live',
    createdBy,
    ...(scheduledAt !== undefined && { scheduledAt }),
    createdAt: Date.now(),
  };

  const ref = await addDoc(matchesCol(), matchData as Match);
  return ref.id;
}

function buildHistoricScore(
  sets: { p1: number; p2: number }[],
): { score: LiveScore; winner: Player } {
  let p1Sets = 0;
  let p2Sets = 0;
  const builtSets: SetScore[] = sets.map((s, i) => {
    const setWinner: Player = s.p1 > s.p2 ? 'player1' : 'player2';
    if (setWinner === 'player1') p1Sets++; else p2Sets++;
    return { setNumber: i + 1, player1Games: s.p1, player2Games: s.p2, winner: setWinner };
  });
  const winner: Player = p1Sets >= p2Sets ? 'player1' : 'player2';
  const score: LiveScore = {
    sets: builtSets,
    currentSet: sets.length - 1,
    currentGame: { player1: '0', player2: '0' },
    isTiebreak: false,
    server: 'player1',
    serviceSide: 'deuce',
    player1SetsWon: p1Sets,
    player2SetsWon: p2Sets,
  };
  return { score, winner };
}

export async function recordHistoricMatch(params: {
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  player2IsGuest?: boolean;
  divisionId: string;
  createdBy: string;
  sets: { p1: number; p2: number }[];
}): Promise<string> {
  const { player1Id, player2Id, player1Name, player2Name, player2IsGuest, divisionId, createdBy, sets } = params;
  const { score, winner } = buildHistoricScore(sets);
  const now = Date.now();

  const isGuest = player2IsGuest ?? false;
  const matchData: Omit<Match, 'id'> = {
    divisionId,
    player1Id,
    player2Id,
    ...(player1Name && { player1Name }),
    ...(player2Name && { player2Name }),
    player2IsGuest: isGuest,
    playerIds: isGuest ? [player1Id] : [player1Id, player2Id],
    format: defaultFormat,
    status: isGuest ? 'completed' : 'pending_report',
    liveScore: score,
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    winner,
    tipsEnabled: false,
    source: 'manual',
    createdBy,
    completedAt: now,
    createdAt: now,
    reportSubmission: {
      submittedBy: createdBy,
      submittedAt: now,
      status: isGuest ? 'confirmed' : 'pending_confirmation',
      ...(isGuest && { confirmedBy: createdBy, confirmedAt: now }),
    },
  };
  const ref = await addDoc(matchesCol(), matchData as Match);
  return ref.id;
}

/**
 * For guest matches: submitting auto-confirms since there's no opponent to review.
 */
export async function submitGuestReport(matchId: string, submittedBy: string): Promise<void> {
  const now = Date.now();
  await updateDoc(matchDoc(matchId), {
    status: 'completed',
    completedAt: now,
    reportSubmission: {
      submittedBy,
      submittedAt: now,
      status: 'confirmed',
      confirmedBy: submittedBy,
      confirmedAt: now,
    },
  });
}

/**
 * Links a real player account to a match that was originally recorded against a guest.
 * Updates playerIds so the match appears in both players' match histories.
 */
export async function linkGuestOpponent(
  matchId: string,
  player2Id: string,
  player2Name: string,
  currentPlayerIds: string[],
): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    player2Id,
    player2Name,
    player2IsGuest: false,
    playerIds: [...new Set([...currentPlayerIds, player2Id])],
  });
}

export async function cancelMatch(matchId: string): Promise<void> {
  await updateDoc(matchDoc(matchId), { status: 'cancelled' });
}

export async function deleteMatch(matchId: string): Promise<void> {
  await deleteDoc(matchDoc(matchId));
}

export async function postponeMatch(matchId: string, newScheduledAt: number): Promise<void> {
  await updateDoc(matchDoc(matchId), { scheduledAt: newScheduledAt });
}

export async function startMatch(matchId: string, server: 'player1' | 'player2'): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    status: 'in_progress',
    startedAt: Date.now(),
    'liveScore.server': server,
  });
}

export async function scorePoint(
  matchId: string,
  match: Match,
  scorer: 'player1' | 'player2'
): Promise<{ matchWinner?: 'player1' | 'player2'; tips: TipTrigger[] }> {
  const result = applyPoint(match.liveScore, scorer, match.format);

  const updates: Record<string, unknown> = {
    liveScore: result.nextScore,
    undoSnapshot: {
      liveScore: match.liveScore,
      status: match.status,
      ...(match.winner !== undefined && { winner: match.winner }),
    },
  };

  if (result.matchWinner) {
    updates.status = 'pending_report';
    updates.winner = result.matchWinner;
    updates.completedAt = Date.now();
  }

  await updateDoc(matchDoc(matchId), updates);
  return { matchWinner: result.matchWinner, tips: result.tips };
}

export async function undoLastPoint(matchId: string, match: Match): Promise<void> {
  const snapshot = match.undoSnapshot;
  if (!snapshot) return;
  await updateDoc(matchDoc(matchId), {
    liveScore: snapshot.liveScore,
    status: snapshot.status,
    winner: deleteField(),
    completedAt: deleteField(),
    undoSnapshot: deleteField(),
  });
}

/**
 * Either player submits the end-of-match report.
 * The opponent receives a push notification to review and confirm or dispute.
 */
export async function submitMatchReport(matchId: string, submittedBy: string): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    reportSubmission: {
      submittedBy,
      submittedAt: Date.now(),
      status: 'pending_confirmation',
    },
  });
}

/**
 * The non-submitting player confirms the report is accurate.
 * Triggers ranking recalculation and PDF generation via Cloud Function.
 */
export async function confirmMatchReport(matchId: string, confirmedBy: string): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    status: 'completed',
    'reportSubmission.status': 'confirmed',
    'reportSubmission.confirmedBy': confirmedBy,
    'reportSubmission.confirmedAt': Date.now(),
  });
}

/**
 * The non-submitting player disputes the report.
 * Escalates to the division leader via Cloud Function notification.
 */
export async function disputeMatchReport(matchId: string, disputedBy: string): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    status: 'disputed',
    'reportSubmission.status': 'disputed',
    'reportSubmission.disputedBy': disputedBy,
    'reportSubmission.disputedAt': Date.now(),
  });
}

/**
 * Division leader resolves a disputed report via a server-side callable
 * that enforces the leader authorization check.
 */
export async function resolveDisputedReport(matchId: string): Promise<void> {
  const callable = httpsCallable(functions, 'resolveDisputedReport');
  await callable({ matchId });
}

export async function editMatchScore(
  matchId: string,
  sets: { p1: number; p2: number }[],
): Promise<void> {
  const { score, winner } = buildHistoricScore(sets);
  await updateDoc(matchDoc(matchId), {
    liveScore: score,
    winner,
    status: 'pending_report',
    completedAt: deleteField(),
    reportSubmission: deleteField(),
    undoSnapshot: deleteField(),
  });
}

export async function recalculateDivisionRankings(divisionId: string): Promise<void> {
  const callable = httpsCallable(functions, 'recalculateDivisionRankings');
  await callable({ divisionId });
}

/**
 * Subscribes to all in-progress matches for a division in real time.
 * Useful for spectator views and live-match dashboards.
 */
export function useLiveMatches(divisionId: string | null) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!divisionId) { setLoading(false); return; }
    const unsub = onSnapshot(liveMatchesQuery(divisionId), (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Match, 'id'>) })));
      setLoading(false);
    });
    return unsub;
  }, [divisionId]);

  return { matches, loading };
}
