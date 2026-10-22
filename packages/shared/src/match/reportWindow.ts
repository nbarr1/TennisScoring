import type { Match, ReportSubmission } from '../types/match';
import { isMatchParticipant, type MatchSidesLike } from './matchSides';

/**
 * How long the opposing side has to confirm or dispute a submitted report.
 * After that the report is confirmed automatically, and changing the result
 * needs a division leader or admin to approve an appeal.
 */
export const REPORT_CONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000;

/** The longest reason a player can give for an appeal. */
export const MAX_APPEAL_REASON_LENGTH = 1000;

/** The longest note a leader or admin can add to an appeal decision. */
export const MAX_APPEAL_NOTE_LENGTH = 1000;

/**
 * When the window to answer a report closes, or `undefined` when the report is
 * not awaiting an answer or the server has not stamped a deadline on it yet.
 */
export function reportConfirmationDeadline(
  submission: ReportSubmission | null | undefined,
): number | undefined {
  if (!submission || submission.status !== 'pending_confirmation') return undefined;
  return typeof submission.confirmationDeadline === 'number' ? submission.confirmationDeadline : undefined;
}

/**
 * True when a submitted report's window has closed without an answer. The
 * opposing side can still confirm it, but nobody can dispute, edit, undo, or
 * resubmit it; the scheduled job confirms it on its next run.
 */
export function isReportWindowClosed(
  match: Pick<Match, 'status' | 'reportSubmission'>,
  now: number,
): boolean {
  if (match.status !== 'pending_report') return false;
  const deadline = reportConfirmationDeadline(match.reportSubmission);
  return deadline !== undefined && now >= deadline;
}

type AppealableMatch = MatchSidesLike & Pick<Match, 'status' | 'player2IsGuest' | 'appeal'>;

/**
 * True when the user may ask a leader or admin to review this result: they
 * played in it, it is confirmed, it counts in the standings (not a guest
 * match), and it has never been appealed. One appeal per match, so a rejected
 * appeal is final.
 */
export function canRequestMatchAppeal(match: AppealableMatch, userId: string): boolean {
  return (
    !!userId &&
    match.status === 'completed' &&
    !match.player2IsGuest &&
    !match.appeal &&
    isMatchParticipant(match, userId)
  );
}

/**
 * True when the user may decide this match's pending appeal: an admin or a
 * leader of the match's division who did not play in the match. The
 * `decideMatchAppeal` callable checks the role for real; callers pass what
 * they know so the UI offers the panel to the same people.
 */
export function canDecideMatchAppeal(
  match: AppealableMatch,
  userId: string,
  reviewer: { isAdmin: boolean; isDivisionLeader: boolean },
): boolean {
  return (
    !!userId &&
    match.appeal?.status === 'pending' &&
    (reviewer.isAdmin || reviewer.isDivisionLeader) &&
    !isMatchParticipant(match, userId)
  );
}
