import {
  divisionLevelMatchType,
  levelIdsByMatchType,
  matchTypesOfLevels,
} from '../division';

const levels = new Map<string, { matchType?: unknown }>([
  ['beginner-singles', { matchType: 'singles' }],
  ['advanced-singles', { matchType: 'singles' }],
  ['intermediate-doubles', { matchType: 'doubles' }],
  ['legacy', {}],
]);

describe('divisionLevelMatchType', () => {
  it('reads a level with no match type as singles', () => {
    expect(divisionLevelMatchType({})).toBe('singles');
    expect(divisionLevelMatchType(undefined)).toBe('singles');
    expect(divisionLevelMatchType({ matchType: 'doubles' })).toBe('doubles');
  });
});

describe('levelIdsByMatchType', () => {
  it('keeps one singles and one doubles registration side by side', () => {
    expect(
      levelIdsByMatchType(
        [{ divisionLevelId: 'beginner-singles' }, { divisionLevelId: 'intermediate-doubles' }],
        levels,
      ),
    ).toEqual({ singles: 'beginner-singles', doubles: 'intermediate-doubles' });
  });

  it('picks the most recently updated of two legacy memberships of one type', () => {
    expect(
      levelIdsByMatchType(
        [
          { divisionLevelId: 'advanced-singles', updatedAt: { seconds: 200 } },
          { divisionLevelId: 'beginner-singles', updatedAt: { toMillis: () => 100_000 } },
        ],
        levels,
      ),
    ).toEqual({ singles: 'advanced-singles' });
  });

  it('treats a level with no match type, or an unknown level, as singles', () => {
    expect(levelIdsByMatchType([{ divisionLevelId: 'legacy' }], levels)).toEqual({ singles: 'legacy' });
    expect(levelIdsByMatchType([{ divisionLevelId: 'gone' }], levels)).toEqual({ singles: 'gone' });
  });
});

describe('matchTypesOfLevels', () => {
  it('lists the match types a season offers, singles first', () => {
    expect(matchTypesOfLevels([{ matchType: 'doubles' }, {}])).toEqual(['singles', 'doubles']);
    expect(matchTypesOfLevels([{ matchType: 'doubles' }])).toEqual(['doubles']);
    expect(matchTypesOfLevels([])).toEqual([]);
  });
});
