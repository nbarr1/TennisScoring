import { useState, useEffect } from 'react';
import {
  onSnapshot,
  updateDoc,
  addDoc,
  deleteField,
  deleteDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { matchDoc, matchesCol, liveMatchesQuery } from '../collections';
import { functions } from '../config';
import type {
  Match,
  Player,
  TipTrigger,
  LiveScore,
  SetScore,
} from '@tennis/shared';
import {
  DEFAULT_FORMAT as defaultFormat,
  createInitialScore,
  EMPTY_STATS,
} from '@tennis/shared';

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
      },
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
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  createdBy: string;
  scheduledAt?: number;
  isDivisionMatch?: boolean;
}): Promise<string> {
  const {
    player1Id,
    player2Id,
    player1Name,
    player2Name,
    player2IsGuest,
    divisionId,
    seasonId,
    divisionLevelId,
    matchType,
    createdBy,
    scheduledAt,
    isDivisionMatch,
  } = params;
  const isGuest = player2IsGuest ?? false;

  const matchData: Omit<Match, 'id'> = {
    divisionId,
    ...(seasonId && { seasonId }),
    ...(divisionLevelId && { divisionLevelId }),
    ...(matchType && { matchType }),
    player1Id,
    player2Id,
    ...(player1Name && { player1Name }),
    ...(player2Name && { player2Name }),
    player2IsGuest: isGuest,
    playerIds: isGuest ? [player1Id] : [player1Id, player2Id],
    format: defaultFormat,
    status: 'scheduled',
    liveScore: createInitialScore(defaultFormat),
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    advancedStatsEnabled: false,
    tipsEnabled: true,
    source: 'live',
    isDivisionMatch: isDivisionMatch ?? true,
    createdBy,
    ...(scheduledAt !== undefined && { scheduledAt }),
    createdAt: Date.now(),
  };

  const ref = await addDoc(matchesCol(), matchData as Match);
  return ref.id;
}

function buildHistoricScore(sets: { p1: number; p2: number }[]): {
  score: LiveScore;
  winner: Player;
} {
  if (sets.length === 0) {
    throw new Error('At least one set is required.');
  }
  for (const set of sets) {
    if (set.p1 === set.p2) {
      throw new Error('Each set must have a clear winner.');
    }
  }

  let p1Sets = 0;
  let p2Sets = 0;
  const builtSets: SetScore[] = sets.map((s, i) => {
    const setWinner: Player = s.p1 > s.p2 ? 'player1' : 'player2';
    if (setWinner === 'player1') p1Sets++;
    else p2Sets++;
    return {
      setNumber: i,
      player1Games: s.p1,
      player2Games: s.p2,
      winner: setWinner,
    };
  });
  const winner: Player = p1Sets > p2Sets ? 'player1' : 'player2';
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
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  /** Doubles only: both members of each side. The server derives every flat field from these. */
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
  createdBy: string;
  sets: { p1: number; p2: number }[];
  isDivisionMatch?: boolean;
}): Promise<string> {
  const callable = httpsCallable<
    Omit<typeof params, 'createdBy'>,
    { success: boolean; matchId: string; status: Match['status'] }
  >(functions, 'recordHistoricMatch');
  const result = await callable({
    player1Id: params.player1Id,
    player2Id: params.player2Id,
    player1Name: params.player1Name,
    player2Name: params.player2Name,
    player2IsGuest: params.player2IsGuest,
    divisionId: params.divisionId,
    seasonId: params.seasonId,
    divisionLevelId: params.divisionLevelId,
    matchType: params.matchType,
    side1PlayerIds: params.side1PlayerIds,
    side2PlayerIds: params.side2PlayerIds,
    sets: params.sets,
    isDivisionMatch: params.isDivisionMatch,
  });
  return result.data.matchId;
}



export async function recordMatchOnBehalf(params: {
  player1Id: string;
  player2Id: string;
  divisionId: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  /** Doubles only: both members of each side. The server derives every flat field from these. */
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
  sets: { p1: number; p2: number }[];
  isDivisionMatch?: boolean;
  notifyPlayers?: boolean;
}): Promise<string> {
  const callable = httpsCallable<
    typeof params,
    { success: boolean; matchId: string }
  >(functions, 'recordMatchOnBehalf');
  const result = await callable(params);
  return result.data.matchId;
}

/**
 * For guest matches: submitting auto-confirms since there's no opponent to review.
 */
export async function submitGuestReport(
  matchId: string,
  submittedBy: string,
): Promise<void> {
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

export async function postponeMatch(
  matchId: string,
  newScheduledAt: number,
): Promise<void> {
  await updateDoc(matchDoc(matchId), { scheduledAt: newScheduledAt });
}

/**
 * Creates a match proposal that the opponent must accept before it becomes scheduled.
 * Mirrors createMatch but writes status: 'proposed'. Guests can't be proposed to.
 */
export async function proposeMatch(params: {
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  divisionId: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  createdBy: string;
  scheduledAt: number;
}): Promise<string> {
  const {
    player1Id,
    player2Id,
    player1Name,
    player2Name,
    divisionId,
    seasonId,
    divisionLevelId,
    matchType,
    createdBy,
    scheduledAt,
  } = params;
  const matchData: Omit<Match, 'id'> = {
    divisionId,
    ...(seasonId && { seasonId }),
    ...(divisionLevelId && { divisionLevelId }),
    ...(matchType && { matchType }),
    player1Id,
    player2Id,
    ...(player1Name && { player1Name }),
    ...(player2Name && { player2Name }),
    player2IsGuest: false,
    playerIds: [player1Id, player2Id],
    format: defaultFormat,
    status: 'proposed',
    liveScore: createInitialScore(defaultFormat),
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    advancedStatsEnabled: false,
    tipsEnabled: true,
    source: 'live',
    isDivisionMatch: true,
    createdBy,
    scheduledAt,
    createdAt: Date.now(),
  };
  const ref = await addDoc(matchesCol(), matchData as Match);
  return ref.id;
}

/**
 * Creates a doubles match (four players, two fixed partnerships).
 *
 * Goes through a Cloud Function rather than a direct write: the client-side
 * create rule pins `playerIds` to a two-element array, and validating four
 * players' division membership in rules would exceed the per-request document
 * access limit. The server derives `side1`/`side2`, the team display names, and
 * the flat `player1*`/`player2*` fields from the two side rosters.
 */
export async function createDoublesMatch(params: {
  side1PlayerIds: string[];
  side2PlayerIds: string[];
  divisionId: string;
  seasonId?: string;
  divisionLevelId?: string;
  status?: 'proposed' | 'scheduled';
  scheduledAt?: number;
  isDivisionMatch?: boolean;
}): Promise<string> {
  const callable = httpsCallable<
    typeof params,
    { success: boolean; matchId: string; status: Match['status'] }
  >(functions, 'createDoublesMatch');
  const result = await callable(params);
  return result.data.matchId;
}

/** Proposes a doubles match — the opposing pair accepts or declines it. */
export async function proposeDoublesMatch(params: {
  side1PlayerIds: string[];
  side2PlayerIds: string[];
  divisionId: string;
  seasonId?: string;
  divisionLevelId?: string;
  scheduledAt: number;
}): Promise<string> {
  return createDoublesMatch({ ...params, status: 'proposed' });
}

/** Opponent accepts a proposed match — moves it to 'scheduled'. */
export async function acceptMatchProposal(matchId: string): Promise<void> {
  await updateDoc(matchDoc(matchId), { status: 'scheduled' });
}

/** Opponent declines (or proposer withdraws) a proposed match — moves it to 'cancelled'. */
export async function declineMatchProposal(matchId: string): Promise<void> {
  await updateDoc(matchDoc(matchId), { status: 'cancelled' });
}

export async function startMatch(
  matchId: string,
  server: 'player1' | 'player2',
  advancedStatsEnabled = false,
  liveScore?: LiveScore,
): Promise<void> {
  const startedAt = Date.now();
  const updates: Record<string, any> = {
    status: 'in_progress',
    startedAt,
    currentSetStartedAt: startedAt,
    advancedStatsEnabled,
  };
  if (liveScore) {
    updates.liveScore = {
      ...liveScore,
      server,
      sets: liveScore.sets.map((set, index) =>
        index === liveScore.currentSet ? { ...set, startedAt } : set,
      ),
    };
  } else {
    updates['liveScore.server'] = server;
  }
  await updateDoc(matchDoc(matchId), updates);
}

export type PointAttribution = 'ace' | 'winner' | 'opponent_error';

export async function scorePoint(
  matchId: string,
  _match: Match,
  scorer: 'player1' | 'player2',
  pointAttribution?: PointAttribution,
): Promise<{
  nextScore: LiveScore;
  matchWinner?: 'player1' | 'player2';
  tips: TipTrigger[];
}> {
  const callable = httpsCallable<
    { matchId: string; scorer: 'player1' | 'player2'; pointAttribution?: PointAttribution },
    { nextScore: LiveScore; matchWinner?: 'player1' | 'player2'; tips: TipTrigger[] }
  >(functions, 'scoreMatchPoint');
  const result = await callable({ matchId, scorer, ...(pointAttribution && { pointAttribution }) });
  return result.data;
}

export async function undoLastPoint(
  matchId: string,
  match: Match,
): Promise<void> {
  const snapshot = match.undoSnapshot;
  if (!snapshot) return;
  await updateDoc(matchDoc(matchId), {
    liveScore: snapshot.liveScore,
    status: snapshot.status,
    stats: snapshot.stats,
    winner: snapshot.winner ?? deleteField(),
    completedAt: snapshot.completedAt ?? deleteField(),
    currentSetStartedAt: snapshot.currentSetStartedAt ?? deleteField(),
    matchDurationMs: snapshot.matchDurationMs ?? deleteField(),
    undoSnapshot: deleteField(),
  });
}

/**
 * Either player submits the end-of-match report.
 * The opponent receives a push notification to review and confirm or dispute.
 */
export async function submitMatchReport(
  matchId: string,
  submittedBy: string,
): Promise<void> {
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
export async function confirmMatchReport(
  matchId: string,
  confirmedBy: string,
): Promise<void> {
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
export async function disputeMatchReport(
  matchId: string,
  disputedBy: string,
): Promise<void> {
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

export async function recalculateDivisionRankings(
  divisionId: string,
  normalizeMatches = false,
): Promise<unknown> {
  const callable = httpsCallable(functions, 'recalculateDivisionRankings');
  const result = await callable({ divisionId, normalizeMatches });
  return result.data;
}

export async function repairAllDivisionRankings(
  normalizeMatches = false,
): Promise<unknown> {
  const callable = httpsCallable(functions, 'repairAllDivisionRankings');
  const result = await callable({ normalizeMatches });
  return result.data;
}

/**
 * Subscribes to all in-progress matches for a division in real time.
 * Useful for spectator views and live-match dashboards.
 */
export function useLiveMatches(divisionId: string | null) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!divisionId) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(liveMatchesQuery(divisionId), (snap) => {
      setMatches(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Match, 'id'>),
        })),
      );
      setLoading(false);
    });
    return unsub;
  }, [divisionId]);

  return { matches, loading };
}
