import {
  currentSeasonForDate,
  defaultSeasonOptions,
  formatDivisionLevelName,
  formatSeasonName,
  seasonId,
  toCsv,
} from '../..';

describe('division season helpers', () => {
  it('formats canonical Spring/Fall season identifiers and labels', () => {
    expect(seasonId(2026, 'spring')).toBe('spring-2026');
    expect(formatSeasonName(2026, 'fall')).toBe('Fall 2026');
  });

  it('selects spring for January through June and fall for July through December', () => {
    expect(currentSeasonForDate(new Date('2026-05-13T00:00:00Z'))).toEqual({
      id: 'spring-2026',
      year: 2026,
      half: 'spring',
      name: 'Spring 2026',
    });
    expect(currentSeasonForDate(new Date('2026-10-01T00:00:00Z')).id).toBe('fall-2026');
  });

  it('builds adjacent year season options', () => {
    expect(defaultSeasonOptions(new Date('2026-05-13T00:00:00Z')).map((s) => s.id)).toEqual([
      'spring-2025',
      'fall-2025',
      'spring-2026',
      'fall-2026',
      'spring-2027',
      'fall-2027',
    ]);
  });

  it('formats default level names', () => {
    expect(formatDivisionLevelName('beginner', 'doubles')).toBe('Beginner Doubles');
  });

  it('escapes csv values', () => {
    expect(toCsv([['Name', 'Note'], ['Ava', 'Won "fast", then left']])).toBe(
      'Name,Note\nAva,"Won ""fast"", then left"\n',
    );
  });
});
