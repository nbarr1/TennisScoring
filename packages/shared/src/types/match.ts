import type { RecordedSetInput } from '../scoring/recordedScore';

export type TennisPoint = '0' | '15' | '30' | '40' | 'Ad';
export type MatchFormat = 'best-of-3' | 'best-of-5' | 'pro-set';
// pending_report: game over, waiting for a player to submit the report
// completed: report confirmed by both players — rankings are updated from this state only
// disputed: the non-submitting player rejected the report — awaits division leader resolution
export type MatchStatus = 'proposed' | 'scheduled' | 'in_progress' | 'pending_report' | 'completed' | 'disputed' | 'cancelled';
export type MatchStatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary' | 'accent';

export interface MatchStatusMetadata {
  label: string;
  icon: string;
  color: string;
  tone: MatchStatusTone;
  accessibilityLabel: string;
}

export const MATCH_STATUS_METADATA: Record<MatchStatus, MatchStatusMetadata> = {
  proposed: {
    label: 'Proposed',
    icon: '○',
    color: '#8e44ad',
    tone: 'accent',
    accessibilityLabel: 'Match proposed',
  },
  scheduled: {
    label: 'Scheduled',
    icon: '●',
    color: '#1a472a',
    tone: 'primary',
    accessibilityLabel: 'Match scheduled',
  },
  in_progress: {
    label: 'Live',
    icon: '●',
    color: '#27ae60',
    tone: 'success',
    accessibilityLabel: 'Match live',
  },
  pending_report: {
    label: 'Pending Report',
    icon: '◐',
    color: '#e67e22',
    tone: 'warning',
    accessibilityLabel: 'Match pending report',
  },
  completed: {
    label: 'Final',
    icon: '✓',
    color: '#555',
    tone: 'neutral',
    accessibilityLabel: 'Match final',
  },
  disputed: {
    label: 'Disputed',
    icon: '⚠',
    color: '#c0392b',
    tone: 'danger',
    accessibilityLabel: 'Match disputed',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '×',
    color: '#777',
    tone: 'neutral',
    accessibilityLabel: 'Match cancelled',
  },
};

export function getMatchStatusMetadata(status: MatchStatus): MatchStatusMetadata {
  return MATCH_STATUS_METADATA[status];
}

export type ServiceSide = 'deuce' | 'advantage';
export type Player = 'player1' | 'player2';

export interface MatchSide {
  playerIds: string[];
  displayName?: string;
}

export interface MatchFormat_Config {
  setsToWin: number;       // 2 for best-of-3, 3 for best-of-5
  gamesPerSet: number;     // 6
  tiebreakAt: number;      // 6 (trigger tiebreak at 6-6)
  finalSetTiebreak: boolean; // true = 7-point tiebreak; false = play out
}

export const DEFAULT_FORMAT: MatchFormat_Config = {
  setsToWin: 2,
  gamesPerSet: 6,
  tiebreakAt: 6,
  finalSetTiebreak: true,
};

export interface TiebreakScore {
  player1Points: number;
  player2Points: number;
}

export interface SetScore {
  setNumber: number;
  player1Games: number;
  player2Games: number;
  tiebreak?: TiebreakScore;
  /**
   * The set was replaced by a 10-point match tiebreak. Games read 1-0 to the
   * winner and `tiebreak` holds the points. Only recorded matches set this.
   */
  matchTiebreak?: boolean;
  winner?: Player;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface GameScore {
  player1: TennisPoint;
  player2: TennisPoint;
}

export interface LiveScore {
  sets: SetScore[];
  currentSet: number;          // 0-based index into sets[]
  currentGame: GameScore;
  isTiebreak: boolean;
  tiebreakScore?: TiebreakScore;
  server: Player;
  serviceSide: ServiceSide;
  player1SetsWon: number;
  player2SetsWon: number;
}

export interface ScoreAction {
  id: string;
  type: 'point' | 'undo';
  pointFor?: Player;
  proposedBy: string;          // userId
  confirmedBy?: string;        // userId
  status: 'pending' | 'confirmed' | 'rejected';
  scoreSnapshotBefore: LiveScore;
  createdAt: number;
}

export type ReportSubmissionStatus = 'pending_confirmation' | 'confirmed' | 'disputed';

export interface ReportSubmission {
  submittedBy: string;          // userId of the player who filed the report
  submittedAt: number;
  status: ReportSubmissionStatus;
  confirmedBy?: string;         // userId of the player who confirmed
  confirmedAt?: number;
  disputedBy?: string;          // userId of the player who disputed
  disputedAt?: number;
  leaderNotifiedAt?: number;    // set when escalated to division leader
  /**
   * When the opposing side's window to confirm or dispute closes, in Unix
   * milliseconds. Only Cloud Functions write it, from the server clock, when
   * the report is submitted (`submittedAt` is the submitter's own clock, so it
   * cannot decide the window). After it passes the report is confirmed
   * automatically, and any change goes through an appeal.
   */
  confirmationDeadline?: number;
  /** True when the report was confirmed because the window closed unanswered. */
  autoConfirmed?: boolean;
}

export type MatchAppealStatus = 'pending' | 'approved' | 'rejected';

/**
 * A player's request that a division leader or admin review a confirmed
 * result. A match carries at most one appeal; only Cloud Functions write it.
 */
export interface MatchAppeal {
  requestedBy: string;          // userId of the participant who appealed
  requestedAt: number;
  reason: string;
  /** The score the player says is right, from player 1's side. Optional. */
  proposedSets?: RecordedSetInput[];
  status: MatchAppealStatus;
  decidedBy?: string;           // userId of the leader or admin who decided
  decidedAt?: number;
  decisionNote?: string;
  /** The score saved when the appeal was approved. */
  appliedSets?: RecordedSetInput[];
}

export interface PlayerMatchStats {
  aces: number;
  doubleFaults: number;
  firstServeIn: number;
  firstServeTotal: number;
  winners: number;
  unforcedErrors: number;
  servicePointsWon: number;
  servicePointsTotal: number;
  receivingPointsWon: number;
  receivingPointsTotal: number;
  breakPointsWon: number;
  breakPointsFaced: number;
}

export interface MatchStats {
  player1: PlayerMatchStats;
  player2: PlayerMatchStats;
}

export const EMPTY_STATS: PlayerMatchStats = {
  aces: 0,
  doubleFaults: 0,
  firstServeIn: 0,
  firstServeTotal: 0,
  winners: 0,
  unforcedErrors: 0,
  servicePointsWon: 0,
  servicePointsTotal: 0,
  receivingPointsWon: 0,
  receivingPointsTotal: 0,
  breakPointsWon: 0,
  breakPointsFaced: 0,
};

export interface UndoSnapshot {
  liveScore: LiveScore;
  status: MatchStatus;
  winner?: Player;
  completedAt?: number;
  stats: MatchStats;
  currentSetStartedAt?: number;
  matchDurationMs?: number;
}

export interface Match {
  id: string;
  divisionId: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: 'singles' | 'doubles';
  side1?: MatchSide;
  side2?: MatchSide;
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  player2IsGuest?: boolean;
  playerIds: string[];
  format: MatchFormat_Config;
  status: MatchStatus;
  liveScore: LiveScore;
  stats: MatchStats;
  advancedStatsEnabled?: boolean;
  currentSetStartedAt?: number;
  matchDurationMs?: number;
  reportSubmission?: ReportSubmission;
  appeal?: MatchAppeal;
  winner?: Player;
  reportUrl?: string;
  tipsEnabled: boolean;
  undoSnapshot?: UndoSnapshot;
  /**
   * The client-generated id of the last point `scoreMatchPoint` applied. Only
   * the Admin SDK writes it; a retried call carrying the same id is ignored, so
   * a request whose reply was lost cannot count its point twice.
   */
  lastPointId?: string;
  source?: 'live' | 'manual' | 'schedule';
  isDivisionMatch?: boolean;  // Whether this match counts toward division rankings
  createdBy: string;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}
