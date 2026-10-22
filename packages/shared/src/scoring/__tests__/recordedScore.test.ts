import {
  buildRecordedMatchScore,
  canBeMatchTiebreak,
  formatRecordedScoreLine,
  isValidMatchTiebreakScore,
  parseRecordedScoreLine,
  parseRecordedSetToken,
  recordedSetsFromScore,
  validateRecordedSets,
} from '../recordedScore';
import { extractMatchTotals } from '../rankingEngine';
import { formatScoreDisplay } from '../scoreEngine';

describe('isValidMatchTiebreakScore', () => {
  it.each([
    [10, 8],
    [10, 0],
    [8, 10],
    [12, 10],
    [15, 13],
  ])('accepts %i-%i', (p1, p2) => {
    expect(isValidMatchTiebreakScore(p1, p2)).toBe(true);
  });

  it.each([
    [10, 9],
    [9, 7],
    [11, 8],
    [13, 10],
    [10, 10],
    [-1, 10],
    [10.5, 8],
  ])('rejects %d-%d', (p1, p2) => {
    expect(isValidMatchTiebreakScore(p1, p2)).toBe(false);
  });
});

describe('canBeMatchTiebreak', () => {
  it('allows only the last of an odd number of three or more sets', () => {
    expect(canBeMatchTiebreak(2, 3)).toBe(true);
    expect(canBeMatchTiebreak(4, 5)).toBe(true);
    expect(canBeMatchTiebreak(1, 3)).toBe(false);
    expect(canBeMatchTiebreak(0, 1)).toBe(false);
    expect(canBeMatchTiebreak(1, 2)).toBe(false);
    expect(canBeMatchTiebreak(3, 4)).toBe(false);
  });
});

describe('validateRecordedSets', () => {
  it('accepts a split match decided by a match tiebreak', () => {
    expect(
      validateRecordedSets([
        { p1: 6, p2: 4 },
        { p1: 3, p2: 6 },
        { p1: 10, p2: 7, matchTiebreak: true },
      ]),
    ).toBeNull();
  });

  it('rejects a match tiebreak that is not the deciding set', () => {
    expect(
      validateRecordedSets([
        { p1: 6, p2: 4 },
        { p1: 6, p2: 3 },
        { p1: 10, p2: 7, matchTiebreak: true },
      ]),
    ).toMatch(/deciding set/);
    expect(
      validateRecordedSets([
        { p1: 10, p2: 7, matchTiebreak: true },
        { p1: 6, p2: 3 },
        { p1: 6, p2: 3 },
      ]),
    ).toMatch(/deciding set/);
  });

  it('rejects an unfinished match tiebreak score', () => {
    expect(
      validateRecordedSets([
        { p1: 6, p2: 4 },
        { p1: 3, p2: 6 },
        { p1: 10, p2: 9, matchTiebreak: true },
      ]),
    ).toMatch(/10 points/);
  });

  it('keeps the existing checks for ordinary sets', () => {
    expect(validateRecordedSets([])).toMatch(/At least one set/);
    expect(validateRecordedSets([{ p1: NaN, p2: 4 }])).toMatch(/whole number/);
    expect(validateRecordedSets([{ p1: 4, p2: 4 }])).toMatch(/clear winner/);
    expect(
      validateRecordedSets([
        { p1: 6, p2: 4 },
        { p1: 4, p2: 6 },
      ]),
    ).toMatch(/match must have a clear winner/);
  });
});

describe('buildRecordedMatchScore', () => {
  it('stores a match tiebreak as a 1-0 set carrying its points', () => {
    const { score, winner } = buildRecordedMatchScore([
      { p1: 6, p2: 4 },
      { p1: 3, p2: 6 },
      { p1: 8, p2: 10, matchTiebreak: true },
    ]);
    expect(winner).toBe('player2');
    expect(score.player1SetsWon).toBe(1);
    expect(score.player2SetsWon).toBe(2);
    expect(score.sets[2]).toEqual({
      setNumber: 2,
      player1Games: 0,
      player2Games: 1,
      tiebreak: { player1Points: 8, player2Points: 10 },
      matchTiebreak: true,
      winner: 'player2',
    });
    expect(formatScoreDisplay(score)).toBe('6-4, 3-6, [8-10]');
  });

  it('counts the match tiebreak as one set and one game in the standings totals', () => {
    const { score } = buildRecordedMatchScore([
      { p1: 6, p2: 4 },
      { p1: 3, p2: 6 },
      { p1: 10, p2: 6, matchTiebreak: true },
    ]);
    expect(extractMatchTotals(score.sets)).toEqual({
      p1Sets: 2,
      p2Sets: 1,
      p1Games: 10,
      p2Games: 10,
    });
  });

  it('builds ordinary sets without tiebreak fields', () => {
    const { score } = buildRecordedMatchScore([
      { p1: 6, p2: 4 },
      { p1: 7, p2: 5 },
    ]);
    expect(score.sets[1]).toEqual({ setNumber: 1, player1Games: 7, player2Games: 5, winner: 'player1' });
  });

  it('throws the validation message', () => {
    expect(() => buildRecordedMatchScore([{ p1: 4, p2: 4 }])).toThrow(/clear winner/);
  });

  it('round-trips through recordedSetsFromScore', () => {
    const sets = [
      { p1: 6, p2: 4 },
      { p1: 3, p2: 6 },
      { p1: 12, p2: 10, matchTiebreak: true },
    ];
    expect(recordedSetsFromScore(buildRecordedMatchScore(sets).score)).toEqual(sets);
  });
});

describe('parseRecordedSetToken', () => {
  it('reads games and bracketed match tiebreaks', () => {
    expect(parseRecordedSetToken('6-4')).toEqual({ p1: 6, p2: 4 });
    expect(parseRecordedSetToken(' 7:5 ')).toEqual({ p1: 7, p2: 5 });
    expect(parseRecordedSetToken('[10-8]')).toEqual({ p1: 10, p2: 8, matchTiebreak: true });
    expect(parseRecordedSetToken('[ 12 - 10 ]')).toEqual({ p1: 12, p2: 10, matchTiebreak: true });
    expect(parseRecordedSetToken('six-four')).toBeNull();
    expect(parseRecordedSetToken('[10-8')).toBeNull();
  });
});

describe('parseRecordedScoreLine', () => {
  it('reads sets separated by commas, semicolons, or spaces', () => {
    expect(parseRecordedScoreLine('6-4, 3-6, [10-8]')).toEqual([
      { p1: 6, p2: 4 },
      { p1: 3, p2: 6 },
      { p1: 10, p2: 8, matchTiebreak: true },
    ]);
    expect(parseRecordedScoreLine('6-4 7:5')).toEqual([{ p1: 6, p2: 4 }, { p1: 7, p2: 5 }]);
    expect(parseRecordedScoreLine(' 6 - 4 ; [ 12 - 10 ] ')).toEqual([
      { p1: 6, p2: 4 },
      { p1: 12, p2: 10, matchTiebreak: true },
    ]);
  });

  it('rejects empty lines and anything that is not a set', () => {
    expect(parseRecordedScoreLine('')).toBeNull();
    expect(parseRecordedScoreLine('  ,  ')).toBeNull();
    expect(parseRecordedScoreLine('6-4, six-three')).toBeNull();
    expect(parseRecordedScoreLine('6-4, [10-8')).toBeNull();
    expect(parseRecordedScoreLine('6-4-3')).toBeNull();
  });
});

describe('formatRecordedScoreLine', () => {
  it('writes a line parseRecordedScoreLine reads back', () => {
    const sets = [{ p1: 6, p2: 4 }, { p1: 3, p2: 6 }, { p1: 10, p2: 8, matchTiebreak: true }];
    expect(formatRecordedScoreLine(sets)).toBe('6-4, 3-6, [10-8]');
    expect(parseRecordedScoreLine(formatRecordedScoreLine(sets))).toEqual(sets);
  });
});
