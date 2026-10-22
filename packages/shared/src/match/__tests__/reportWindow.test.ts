import {
  REPORT_CONFIRMATION_WINDOW_MS,
  canDecideMatchAppeal,
  canRequestMatchAppeal,
  isReportWindowClosed,
  reportConfirmationDeadline,
} from '../reportWindow';
import type { Match, ReportSubmission } from '../../types/match';

const SUBMITTED_AT = 1_000_000;
const DEADLINE = SUBMITTED_AT + REPORT_CONFIRMATION_WINDOW_MS;

const pending = (overrides: Partial<ReportSubmission> = {}): ReportSubmission => ({
  submittedBy: 'p1',
  submittedAt: SUBMITTED_AT,
  status: 'pending_confirmation',
  confirmationDeadline: DEADLINE,
  ...overrides,
});

const singles = (overrides: Partial<Match> = {}) =>
  ({
    player1Id: 'p1',
    player2Id: 'p2',
    playerIds: ['p1', 'p2'],
    status: 'completed',
    player2IsGuest: false,
    ...overrides,
  }) as Match;

describe('report confirmation window', () => {
  it('is 48 hours long', () => {
    expect(REPORT_CONFIRMATION_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('reads the server-stamped deadline of a pending report only', () => {
    expect(reportConfirmationDeadline(pending())).toBe(DEADLINE);
    expect(reportConfirmationDeadline(pending({ status: 'disputed' }))).toBeUndefined();
    expect(reportConfirmationDeadline(pending({ confirmationDeadline: undefined }))).toBeUndefined();
    expect(reportConfirmationDeadline(undefined)).toBeUndefined();
  });

  it('stays open until the deadline and closes at it', () => {
    const match = { status: 'pending_report' as const, reportSubmission: pending() };
    expect(isReportWindowClosed(match, DEADLINE - 1)).toBe(false);
    expect(isReportWindowClosed(match, DEADLINE)).toBe(true);
    expect(isReportWindowClosed(match, DEADLINE + 1)).toBe(true);
  });

  it('never closes for a report without a deadline yet', () => {
    const match = {
      status: 'pending_report' as const,
      reportSubmission: pending({ confirmationDeadline: undefined }),
    };
    expect(isReportWindowClosed(match, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('does not apply once the report has been answered', () => {
    expect(
      isReportWindowClosed({ status: 'disputed', reportSubmission: pending({ status: 'disputed' }) }, DEADLINE + 1),
    ).toBe(false);
    expect(
      isReportWindowClosed({ status: 'completed', reportSubmission: pending({ status: 'confirmed' }) }, DEADLINE + 1),
    ).toBe(false);
  });
});

describe('requesting an appeal', () => {
  it('is open to either player on a confirmed result', () => {
    expect(canRequestMatchAppeal(singles(), 'p1')).toBe(true);
    expect(canRequestMatchAppeal(singles(), 'p2')).toBe(true);
  });

  it('is closed to anyone who did not play', () => {
    expect(canRequestMatchAppeal(singles(), 'leader')).toBe(false);
    expect(canRequestMatchAppeal(singles(), '')).toBe(false);
  });

  it('is closed before the result is confirmed', () => {
    expect(canRequestMatchAppeal(singles({ status: 'pending_report' }), 'p2')).toBe(false);
    expect(canRequestMatchAppeal(singles({ status: 'disputed' }), 'p2')).toBe(false);
  });

  it('is closed for guest matches, which are not in the standings', () => {
    expect(canRequestMatchAppeal(singles({ player2IsGuest: true, playerIds: ['p1'] }), 'p1')).toBe(false);
  });

  it('allows one appeal per match, so a rejection is final', () => {
    for (const status of ['pending', 'approved', 'rejected'] as const) {
      const match = singles({ appeal: { requestedBy: 'p2', requestedAt: 1, reason: 'x', status } });
      expect(canRequestMatchAppeal(match, 'p1')).toBe(false);
      expect(canRequestMatchAppeal(match, 'p2')).toBe(false);
    }
  });

  it('counts a doubles partner as a participant', () => {
    const doubles = singles({
      player1Id: 'a',
      player2Id: 'c',
      playerIds: ['a', 'b', 'c', 'd'],
      side1: { playerIds: ['a', 'b'] },
      side2: { playerIds: ['c', 'd'] },
    });
    expect(canRequestMatchAppeal(doubles, 'b')).toBe(true);
  });
});

describe('deciding an appeal', () => {
  const appealed = singles({ appeal: { requestedBy: 'p2', requestedAt: 1, reason: 'x', status: 'pending' } });
  const leader = { isAdmin: false, isDivisionLeader: true };
  const admin = { isAdmin: true, isDivisionLeader: false };
  const player = { isAdmin: false, isDivisionLeader: false };

  it('is open to a division leader or an admin', () => {
    expect(canDecideMatchAppeal(appealed, 'leader', leader)).toBe(true);
    expect(canDecideMatchAppeal(appealed, 'admin', admin)).toBe(true);
  });

  it('is closed to players without either role', () => {
    expect(canDecideMatchAppeal(appealed, 'p3', player)).toBe(false);
  });

  it('is closed to a leader or admin who played in the match', () => {
    expect(canDecideMatchAppeal(appealed, 'p1', leader)).toBe(false);
    expect(canDecideMatchAppeal(appealed, 'p2', admin)).toBe(false);
  });

  it('is closed once the appeal has been decided', () => {
    const decided = singles({ appeal: { requestedBy: 'p2', requestedAt: 1, reason: 'x', status: 'rejected' } });
    expect(canDecideMatchAppeal(decided, 'leader', leader)).toBe(false);
  });
});
