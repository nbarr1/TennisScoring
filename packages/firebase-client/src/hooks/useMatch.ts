import { useState, useEffect } from 'react';
import { onSnapshot, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { matchDoc, matchesCol } from '../collections';
import type { Match, LiveScore } from '@tennis/shared';
import { applyPoint, DEFAULT_FORMAT as defaultFormat, createInitialScore } from '@tennis/shared';

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
  divisionId: string;
  createdBy: string;
  scheduledAt?: number;
}): Promise<string> {
  const { player1Id, player2Id, divisionId, createdBy, scheduledAt } = params;

  const initialScore = createInitialScore(defaultFormat);

  const matchData: Omit<Match, 'id'> = {
    divisionId,
    player1Id,
    player2Id,
    format: defaultFormat,
    status: 'scheduled',
    liveScore: initialScore,
    stats: {
      player1: { aces: 0, doubleFaults: 0, firstServeIn: 0, firstServeTotal: 0, winners: 0, unforcedErrors: 0, breakPointsWon: 0, breakPointsFaced: 0 },
      player2: { aces: 0, doubleFaults: 0, firstServeIn: 0, firstServeTotal: 0, winners: 0, unforcedErrors: 0, breakPointsWon: 0, breakPointsFaced: 0 },
    },
    tipsEnabled: true,
    createdBy,
    scheduledAt,
    createdAt: Date.now(),
  };

  const ref = await addDoc(matchesCol(), matchData as Match);
  return ref.id;
}

export async function startMatch(matchId: string): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    status: 'in_progress',
    startedAt: Date.now(),
  });
}

export async function scorePoint(
  matchId: string,
  match: Match,
  scorer: 'player1' | 'player2'
): Promise<{ matchWinner?: 'player1' | 'player2' }> {
  const result = applyPoint(match.liveScore, scorer, match.format);

  const updates: Partial<Match> = {
    liveScore: result.nextScore,
  };

  if (result.matchWinner) {
    // Game over — move to pending_report so either player can submit the report.
    // Status transitions to 'completed' only after the opponent confirms the report.
    updates.status = 'pending_report';
    updates.winner = result.matchWinner;
    updates.completedAt = Date.now();
  }

  await updateDoc(matchDoc(matchId), updates as Record<string, unknown>);
  return { matchWinner: result.matchWinner };
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
 * Division leader resolves a disputed report and forces it to confirmed.
 */
export async function resolveDisputedReport(matchId: string, resolvedBy: string): Promise<void> {
  await updateDoc(matchDoc(matchId), {
    status: 'completed',
    'reportSubmission.status': 'confirmed',
    'reportSubmission.confirmedBy': resolvedBy,
    'reportSubmission.confirmedAt': Date.now(),
  });
}
