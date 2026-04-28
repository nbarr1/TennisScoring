export type TennisPoint = '0' | '15' | '30' | '40' | 'Ad';
export type MatchFormat = 'best-of-3' | 'best-of-5' | 'pro-set';
// pending_report: game over, waiting for a player to submit the report
// completed: report confirmed by both players — rankings are updated from this state only
// disputed: the non-submitting player rejected the report — awaits division leader resolution
export type MatchStatus = 'proposed' | 'scheduled' | 'in_progress' | 'pending_report' | 'completed' | 'disputed' | 'cancelled';
export type ServiceSide = 'deuce' | 'advantage';
export type Player = 'player1' | 'player2';

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
  winner?: Player;
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
}

export interface PlayerMatchStats {
  aces: number;
  doubleFaults: number;
  firstServeIn: number;
  firstServeTotal: number;
  winners: number;
  unforcedErrors: number;
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
  breakPointsWon: 0,
  breakPointsFaced: 0,
};

export interface UndoSnapshot {
  liveScore: LiveScore;
  status: MatchStatus;
  winner?: Player;
}

export interface Match {
  id: string;
  divisionId: string;
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
  reportSubmission?: ReportSubmission;
  winner?: Player;
  reportUrl?: string;
  tipsEnabled: boolean;
  undoSnapshot?: UndoSnapshot;
  source?: 'live' | 'manual';
  isDivisionMatch?: boolean;  // NEW: Whether this match counts toward division rankings
  createdBy: string;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}
