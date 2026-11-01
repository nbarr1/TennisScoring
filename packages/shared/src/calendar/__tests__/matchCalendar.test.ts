import {
  MATCH_REMINDER_LEAD_MS,
  buildMatchCalendarFile,
  escapeIcsText,
  formatMatchReminder,
  matchCalendarFilename,
  matchCalendarTitle,
  matchNeedsReminder,
} from '../matchCalendar';

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 3, 18, 30);

const match = {
  player1Id: 'ann',
  player2Id: 'bob',
  player1Name: 'Ann Smith',
  player2Name: 'Bob Jones, Jr.',
  scheduledAt: START,
};

describe('matchNeedsReminder', () => {
  const base = { status: 'scheduled' as const, scheduledAt: START };

  it('reminds a scheduled match inside the lead window', () => {
    expect(matchNeedsReminder(base, START - 23 * HOUR)).toBe(true);
    expect(matchNeedsReminder(base, START - MATCH_REMINDER_LEAD_MS)).toBe(true);
  });

  it('waits until the match is inside the window', () => {
    expect(matchNeedsReminder(base, START - MATCH_REMINDER_LEAD_MS - 1)).toBe(false);
  });

  it('skips a match that started or has no time', () => {
    expect(matchNeedsReminder(base, START)).toBe(false);
    expect(matchNeedsReminder({ status: 'scheduled' }, START - HOUR)).toBe(false);
  });

  it('skips matches that are not scheduled', () => {
    expect(matchNeedsReminder({ ...base, status: 'proposed' }, START - HOUR)).toBe(false);
    expect(matchNeedsReminder({ ...base, status: 'cancelled' }, START - HOUR)).toBe(false);
  });

  it('sends once per start time, and again after a postponement', () => {
    expect(matchNeedsReminder({ ...base, reminderSentFor: START }, START - HOUR)).toBe(false);
    expect(matchNeedsReminder({ ...base, reminderSentFor: START - 2 * HOUR }, START - HOUR)).toBe(true);
  });
});

describe('formatMatchReminder', () => {
  it('names the opponent and the hours left', () => {
    expect(formatMatchReminder(match, 'ann', START - 23.6 * HOUR)).toEqual({
      title: 'Match reminder',
      body: 'Your match against Bob Jones, Jr. starts in about 24 hours.',
    });
    expect(formatMatchReminder(match, 'bob', START - HOUR).body).toBe(
      'Your match against Ann Smith starts in about an hour.',
    );
    expect(formatMatchReminder(match, 'bob', START - 10 * 60 * 1000).body).toBe(
      'Your match against Ann Smith starts in under an hour.',
    );
  });

  it('names the other doubles team', () => {
    const doubles = {
      ...match,
      side1: { playerIds: ['ann', 'cara'], displayName: 'Ann / Cara' },
      side2: { playerIds: ['bob', 'dan'], displayName: 'Bob / Dan' },
    };
    expect(formatMatchReminder(doubles, 'cara', START - 2 * HOUR).body).toBe(
      'Your match against Bob / Dan starts in about 2 hours.',
    );
  });

  it('says when it is a playoff match', () => {
    const playoff = { ...match, playoff: { bracketId: 'b', round: 1, slot: 0, totalRounds: 2 } };
    expect(formatMatchReminder(playoff, 'ann', START - 2 * HOUR).title).toBe('Playoff match reminder');
  });
});

describe('matchCalendarTitle', () => {
  it('reads from the viewer side', () => {
    expect(matchCalendarTitle(match, 'ann')).toBe('Tennis vs Bob Jones, Jr.');
    expect(matchCalendarTitle(match, 'bob')).toBe('Tennis vs Ann Smith');
    expect(matchCalendarTitle(match)).toBe('Tennis: Ann Smith vs Bob Jones, Jr.');
  });

  it('builds a safe file name', () => {
    expect(matchCalendarFilename(match, 'ann')).toBe('tennis-vs-bob-jones-jr.ics');
  });
});

describe('buildMatchCalendarFile', () => {
  it('returns null without a start time', () => {
    expect(buildMatchCalendarFile({ ...match, scheduledAt: undefined }, { matchId: 'm1' })).toBeNull();
  });

  it('writes one UTC event with a stable UID and an alarm', () => {
    const ics = buildMatchCalendarFile(match, {
      matchId: 'm1',
      viewerId: 'ann',
      matchUrl: 'https://league.example/matches/m1',
      now: Date.UTC(2026, 9, 31, 12, 0),
    })!;
    const lines = ics.split('\r\n');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('UID:match-m1@tennis-league');
    expect(lines).toContain('DTSTAMP:20261031T120000Z');
    expect(lines).toContain('DTSTART:20261103T183000Z');
    expect(lines).toContain('DTEND:20261103T203000Z');
    expect(lines).toContain('SUMMARY:Tennis vs Bob Jones\\, Jr.');
    expect(lines).toContain('URL:https://league.example/matches/m1');
    expect(lines).toContain('TRIGGER:-PT1H');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('folds long lines at 75 characters', () => {
    const long = { ...match, player2Name: 'B'.repeat(200) };
    const ics = buildMatchCalendarFile(long, { matchId: 'm1', now: 0 })!;
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics).toContain('\r\n B');
  });
});

describe('escapeIcsText', () => {
  it('escapes the RFC 5545 specials', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
});
