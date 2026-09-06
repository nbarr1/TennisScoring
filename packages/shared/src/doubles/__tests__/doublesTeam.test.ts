import {
  doublesTeamId,
  doublesTeamPlayerIds,
  formatDoublesTeamName,
  doublesHeadToHeadId,
} from '../doublesTeam';
import {
  sidePlayerIds,
  sideDisplayName,
  sideOfPlayer,
  opposingSide,
  isDoublesMatch,
  isMatchParticipant,
  arePartners,
  canRespondToReport,
  type MatchSidesLike,
} from '../../match/matchSides';

describe('doublesTeamId', () => {
  it('is order independent', () => {
    expect(doublesTeamId(['bob', 'ann'])).toBe(doublesTeamId(['ann', 'bob']));
  });

  it('sorts member ids', () => {
    expect(doublesTeamId(['bob', 'ann'])).toBe('ann_bob');
  });

  it('is stable across repeated calls, so a partnership accumulates one row', () => {
    const first = doublesTeamId(['uidC', 'uidA']);
    const second = doublesTeamId(['uidA', 'uidC']);
    const third = doublesTeamId(['uidC', 'uidA']);
    expect(new Set([first, second, third]).size).toBe(1);
  });

  it('distinguishes different partnerships that share a player', () => {
    expect(doublesTeamId(['ann', 'bob'])).not.toBe(doublesTeamId(['ann', 'cara']));
  });

  it('dedupes and drops blank ids', () => {
    expect(doublesTeamId(['ann', '', '  ', 'ann'])).toBe('ann');
    expect(doublesTeamId([])).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(doublesTeamId([' ann ', 'bob'])).toBe('ann_bob');
  });

  it('round-trips through doublesTeamPlayerIds', () => {
    expect(doublesTeamPlayerIds(doublesTeamId(['bob', 'ann']))).toEqual(['ann', 'bob']);
    expect(doublesTeamPlayerIds('')).toEqual([]);
  });
});

describe('formatDoublesTeamName', () => {
  it('joins names in the order given', () => {
    expect(formatDoublesTeamName(['Ann Smith', 'Bob Jones'])).toBe('Ann Smith / Bob Jones');
  });

  it('skips blank names rather than leaving a dangling separator', () => {
    expect(formatDoublesTeamName(['Ann Smith', '  '])).toBe('Ann Smith');
    expect(formatDoublesTeamName([])).toBe('');
  });
});

describe('doublesHeadToHeadId', () => {
  it('is order independent', () => {
    expect(doublesHeadToHeadId('ann_bob', 'cara_dan')).toBe(
      doublesHeadToHeadId('cara_dan', 'ann_bob'),
    );
  });

  it('scopes to a season when one is supplied, so seasons cannot conflate', () => {
    const spring = doublesHeadToHeadId('ann_bob', 'cara_dan', 'spring-2026');
    const fall = doublesHeadToHeadId('ann_bob', 'cara_dan', 'fall-2026');
    expect(spring).not.toBe(fall);
    expect(spring).not.toBe(doublesHeadToHeadId('ann_bob', 'cara_dan'));
    expect(spring.startsWith('doubles_spring-2026_')).toBe(true);
  });

  it('ignores a blank season, falling back to the unscoped id', () => {
    expect(doublesHeadToHeadId('ann_bob', 'cara_dan', '  ')).toBe(
      doublesHeadToHeadId('ann_bob', 'cara_dan'),
    );
  });

  it('is prefixed so it cannot collide with a singles head-to-head id', () => {
    const singlesStyleId = ['ann', 'bob'].sort().join('_');
    expect(doublesHeadToHeadId('ann_bob', 'cara_dan')).not.toBe(singlesStyleId);
    expect(doublesHeadToHeadId('ann_bob', 'cara_dan').startsWith('doubles_')).toBe(true);
  });
});

const singlesMatch: MatchSidesLike = {
  player1Id: 'ann',
  player2Id: 'bob',
  player1Name: 'Ann Smith',
  player2Name: 'Bob Jones',
  playerIds: ['ann', 'bob'],
};

const doublesMatch: MatchSidesLike = {
  matchType: 'doubles',
  side1: { playerIds: ['ann', 'bob'], displayName: 'Ann Smith / Bob Jones' },
  side2: { playerIds: ['cara', 'dan'], displayName: 'Cara Lee / Dan Ruiz' },
  player1Id: 'ann',
  player2Id: 'cara',
  player1Name: 'Ann Smith / Bob Jones',
  player2Name: 'Cara Lee / Dan Ruiz',
  playerIds: ['ann', 'bob', 'cara', 'dan'],
};

describe('matchSides accessors', () => {
  it('falls back to the flat ids on a legacy singles match with no sides', () => {
    expect(sidePlayerIds(singlesMatch, 'player1')).toEqual(['ann']);
    expect(sidePlayerIds(singlesMatch, 'player2')).toEqual(['bob']);
    expect(sideDisplayName(singlesMatch, 'player1')).toBe('Ann Smith');
    expect(isDoublesMatch(singlesMatch)).toBe(false);
  });

  it('does not treat a two-player match tagged matchType doubles as doubles', () => {
    // `matchType` is stamped from the division level onto every match created
    // in it, so an ordinary singles match inside a "Beginner Doubles" level
    // carries the label. Counting it as doubles drops it from singles standings.
    const mislabelled: MatchSidesLike = { ...singlesMatch, matchType: 'doubles' };
    expect(isDoublesMatch(mislabelled)).toBe(false);
  });

  it('does not treat a half-populated side as doubles', () => {
    const halfPopulated: MatchSidesLike = {
      ...doublesMatch,
      side2: { playerIds: ['cara'] },
    };
    expect(isDoublesMatch(halfPopulated)).toBe(false);
  });

  it('treats a four-player match with no matchType label as doubles', () => {
    const unlabelled: MatchSidesLike = { ...doublesMatch, matchType: undefined };
    expect(isDoublesMatch(unlabelled)).toBe(true);
  });

  it('reads both partners off a doubles side', () => {
    expect(sidePlayerIds(doublesMatch, 'player1')).toEqual(['ann', 'bob']);
    expect(sidePlayerIds(doublesMatch, 'player2')).toEqual(['cara', 'dan']);
    expect(sideDisplayName(doublesMatch, 'player2')).toBe('Cara Lee / Dan Ruiz');
    expect(isDoublesMatch(doublesMatch)).toBe(true);
  });

  it('falls back to the flat name when a side omits its display name', () => {
    const partial: MatchSidesLike = {
      ...doublesMatch,
      side1: { playerIds: ['ann', 'bob'] },
    };
    expect(sideDisplayName(partial, 'player1')).toBe('Ann Smith / Bob Jones');
  });

  it('falls back to the flat id when a side carries only blank ids', () => {
    const blank: MatchSidesLike = {
      ...singlesMatch,
      side1: { playerIds: ['   '] },
    };
    expect(sidePlayerIds(blank, 'player1')).toEqual(['ann']);
  });

  it('resolves the side a player is on, including a partner', () => {
    expect(sideOfPlayer(doublesMatch, 'ann')).toBe('player1');
    expect(sideOfPlayer(doublesMatch, 'bob')).toBe('player1');
    expect(sideOfPlayer(doublesMatch, 'dan')).toBe('player2');
    expect(sideOfPlayer(doublesMatch, 'stranger')).toBeUndefined();
  });

  it('flips sides', () => {
    expect(opposingSide('player1')).toBe('player2');
    expect(opposingSide('player2')).toBe('player1');
  });
});

describe('isMatchParticipant', () => {
  it('accepts a doubles partner who is not the side captain', () => {
    expect(isMatchParticipant(doublesMatch, 'bob')).toBe(true);
    expect(isMatchParticipant(doublesMatch, 'dan')).toBe(true);
  });

  it('rejects a non-participant and an empty id', () => {
    expect(isMatchParticipant(doublesMatch, 'stranger')).toBe(false);
    expect(isMatchParticipant(doublesMatch, '')).toBe(false);
  });

  it('still works on a singles match', () => {
    expect(isMatchParticipant(singlesMatch, 'bob')).toBe(true);
    expect(isMatchParticipant(singlesMatch, 'cara')).toBe(false);
  });
});

describe('arePartners', () => {
  it('is true for two players on the same side', () => {
    expect(arePartners(doublesMatch, 'ann', 'bob')).toBe(true);
    expect(arePartners(doublesMatch, 'cara', 'dan')).toBe(true);
  });

  it('is false across sides and for a player against themselves', () => {
    expect(arePartners(doublesMatch, 'ann', 'cara')).toBe(false);
    expect(arePartners(doublesMatch, 'ann', 'ann')).toBe(false);
  });
});

describe('canRespondToReport', () => {
  it('lets an opponent confirm a doubles report', () => {
    expect(canRespondToReport(doublesMatch, 'cara', 'ann')).toBe(true);
    expect(canRespondToReport(doublesMatch, 'dan', 'ann')).toBe(true);
  });

  it("refuses the submitter's own partner", () => {
    expect(canRespondToReport(doublesMatch, 'bob', 'ann')).toBe(false);
  });

  it('refuses the submitter and non-participants', () => {
    expect(canRespondToReport(doublesMatch, 'ann', 'ann')).toBe(false);
    expect(canRespondToReport(doublesMatch, 'stranger', 'ann')).toBe(false);
  });

  it('reduces to "not the submitter" on a singles match', () => {
    expect(canRespondToReport(singlesMatch, 'bob', 'ann')).toBe(true);
    expect(canRespondToReport(singlesMatch, 'ann', 'ann')).toBe(false);
  });

  it('is false when no report has been submitted', () => {
    expect(canRespondToReport(doublesMatch, 'cara', undefined)).toBe(false);
  });
});
