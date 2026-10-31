import type { Match } from '../types/match';
import { sideDisplayName, sidePlayerIds, type MatchSidesLike } from '../match/matchSides';

/**
 * How long a calendar event for a match lasts. Matches carry a start time but
 * no length, and most league matches finish within this.
 */
export const MATCH_CALENDAR_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * How far ahead of a scheduled match its players get a reminder. The
 * `sendMatchReminders` job runs hourly, so the reminder lands between this and
 * one hour less before the start.
 */
export const MATCH_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

type CalendarMatch = MatchSidesLike &
  Pick<Match, 'scheduledAt' | 'player1Name' | 'player2Name'> &
  Partial<Pick<Match, 'playoff'>>;

/**
 * True when a match should get its reminder now: it is scheduled, starts
 * within `MATCH_REMINDER_LEAD_MS`, and no reminder was sent for this start
 * time. A postponed match has a new `scheduledAt`, so it is reminded again.
 */
export function matchNeedsReminder(
  match: Pick<Match, 'status' | 'scheduledAt' | 'reminderSentFor'>,
  now: number,
): boolean {
  if (match.status !== 'scheduled') return false;
  const start = match.scheduledAt;
  if (typeof start !== 'number' || !Number.isFinite(start)) return false;
  if (start <= now || start - now > MATCH_REMINDER_LEAD_MS) return false;
  return match.reminderSentFor !== start;
}

/**
 * The reminder text for one player. Server code sends this without knowing the
 * player's time zone, so it says how long until the match, never a clock time.
 */
export function formatMatchReminder(
  match: CalendarMatch,
  playerId: string,
  now: number,
): { title: string; body: string } {
  const opponentSide = sidePlayerIds(match, 'player1').includes(playerId) ? 'player2' : 'player1';
  const opponent = sideDisplayName(match, opponentSide) || 'your opponent';
  const hours = Math.round(((match.scheduledAt ?? now) - now) / (60 * 60 * 1000));
  const when =
    hours < 1 ? 'in under an hour' : hours === 1 ? 'in about an hour' : `in about ${hours} hours`;
  return {
    title: match.playoff ? 'Playoff match reminder' : 'Match reminder',
    body: `Your match against ${opponent} starts ${when}.`,
  };
}

/** The event title, from the reader's side when `viewerId` is on the match. */
export function matchCalendarTitle(match: CalendarMatch, viewerId?: string): string {
  const name1 = sideDisplayName(match, 'player1') || 'Player 1';
  const name2 = sideDisplayName(match, 'player2') || 'Player 2';
  let title: string;
  if (viewerId && sidePlayerIds(match, 'player1').includes(viewerId)) {
    title = `Tennis vs ${name2}`;
  } else if (viewerId && sidePlayerIds(match, 'player2').includes(viewerId)) {
    title = `Tennis vs ${name1}`;
  } else {
    title = `Tennis: ${name1} vs ${name2}`;
  }
  return match.playoff ? `${title} (playoff)` : title;
}

/** A file name for the match's `.ics` download. */
export function matchCalendarFilename(match: CalendarMatch, viewerId?: string): string {
  // Split and join rather than trimming dashes with a regex, which backtracks
  // badly on long runs of separators.
  const slug = matchCalendarTitle(match, viewerId)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
  return `${slug || 'tennis-match'}.ics`;
}

function icsDate(ms: number): string {
  // 20261031T130000Z: UTC, so every calendar app places it in the reader's zone.
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 text escaping: backslash, semicolon, comma, and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds a content line at 75 characters, as RFC 5545 asks. It counts UTF-16
 * code units rather than octets, which keeps ASCII lines exact and only folds
 * lines with accented names a little later than the spec's limit; calendar
 * apps accept that.
 */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

/**
 * An iCalendar (`.ics`) file with one event for a scheduled match, or `null`
 * when the match has no start time. The UID is stable per match, so importing
 * the file again after a postponement updates the event in most calendar apps
 * instead of adding a second one. The event carries a one-hour alarm.
 */
export function buildMatchCalendarFile(
  match: CalendarMatch,
  options: { matchId: string; viewerId?: string; matchUrl?: string; now?: number },
): string | null {
  const start = match.scheduledAt;
  if (typeof start !== 'number' || !Number.isFinite(start)) return null;
  const end = start + MATCH_CALENDAR_EVENT_DURATION_MS;
  const name1 = sideDisplayName(match, 'player1') || 'Player 1';
  const name2 = sideDisplayName(match, 'player2') || 'Player 2';
  const description = [
    `${name1} vs ${name2}`,
    ...(options.matchUrl ? [`Match page: ${options.matchUrl}`] : []),
  ].join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tennis League//Match calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:match-${options.matchId}@tennis-league`,
    `DTSTAMP:${icsDate(options.now ?? Date.now())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeIcsText(matchCalendarTitle(match, options.viewerId))}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(options.matchUrl ? [`URL:${options.matchUrl}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Tennis match in one hour',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
