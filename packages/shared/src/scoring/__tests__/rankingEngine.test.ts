import { computeRankings, computeDoublesRankings, extractMatchTotals } from '../rankingEngine';
import type { RankingInput, DoublesTeamRankingInput } from '../rankingEngine';
import type { HeadToHead } from '../../types/ranking';

const makePlayer = (
  overrides: Partial<RankingInput> & { userId: string },
): RankingInput => ({
  userId: overrides.userId,
  displayName: overrides.displayName ?? overrides.userId,
  divisionId: 'div1',
  season: '2024',
  matchesWon: overrides.matchesWon ?? 0,
  matchesLost: overrides.matchesLost ?? 0,
  setsWon: overrides.setsWon ?? 0,
  setsLost: overrides.setsLost ?? 0,
  gamesWon: overrides.gamesWon ?? 0,
  gamesLost: overrides.gamesLost ?? 0,
});

describe('extractMatchTotals', () => {
  it('sums games and counts set winners', () => {
    const sets = [
      { player1Games: 6, player2Games: 3, winner: 'player1' as const },
      { player1Games: 4, player2Games: 6, winner: 'player2' as const },
      { player1Games: 6, player2Games: 2, winner: 'player1' as const },
    ];
    expect(extractMatchTotals(sets)).toEqual({
      p1Sets: 2,
      p2Sets: 1,
      p1Games: 16,
      p2Games: 11,
    });
  });

  it('returns zeros for an empty sets array', () => {
    expect(extractMatchTotals([])).toEqual({
      p1Sets: 0,
      p2Sets: 0,
      p1Games: 0,
      p2Games: 0,
    });
  });

  it('infers winners for completed sets that do not include a winner field', () => {
    const sets = [
      { player1Games: 6, player2Games: 3 },
      { player1Games: 2, player2Games: 6 },
    ];
    const result = extractMatchTotals(sets);
    expect(result.p1Sets).toBe(1);
    expect(result.p2Sets).toBe(1);
    expect(result.p1Games).toBe(8);
    expect(result.p2Games).toBe(9);
  });

  it('ignores sets that are still tied with no winner', () => {
    const sets = [
      { player1Games: 6, player2Games: 3, winner: 'player1' as const },
      { player1Games: 2, player2Games: 2 },
    ];
    const result = extractMatchTotals(sets);
    expect(result.p1Sets).toBe(1);
    expect(result.p2Sets).toBe(0);
    expect(result.p1Games).toBe(6);
    expect(result.p2Games).toBe(3);
  });


  it('does not infer winners for in-progress set scores', () => {
    const sets = [
      { player1Games: 5, player2Games: 4 },
      { player1Games: 1, player2Games: 0 },
    ];
    expect(extractMatchTotals(sets)).toEqual({
      p1Sets: 0,
      p2Sets: 0,
      p1Games: 0,
      p2Games: 0,
    });
  });

  it('infers winners for valid 7-6 and 7-5 completed sets', () => {
    const sets = [
      { player1Games: 7, player2Games: 6 },
      { player1Games: 5, player2Games: 7 },
    ];
    expect(extractMatchTotals(sets)).toEqual({
      p1Sets: 1,
      p2Sets: 1,
      p1Games: 12,
      p2Games: 13,
    });
  });

  it('handles a straight-sets match', () => {
    const sets = [
      { player1Games: 6, player2Games: 1, winner: 'player1' as const },
      { player1Games: 6, player2Games: 2, winner: 'player1' as const },
    ];
    expect(extractMatchTotals(sets)).toEqual({
      p1Sets: 2,
      p2Sets: 0,
      p1Games: 12,
      p2Games: 3,
    });
  });
});

describe('rankingEngine', () => {
  it('ranks by matches won', () => {
    const players = [
      makePlayer({ userId: 'a', matchesWon: 1 }),
      makePlayer({ userId: 'b', matchesWon: 3 }),
      makePlayer({ userId: 'c', matchesWon: 2 }),
    ];
    const rankings = computeRankings(players, []);
    expect(rankings[0].userId).toBe('b');
    expect(rankings[1].userId).toBe('c');
    expect(rankings[2].userId).toBe('a');
  });

  it('breaks tie by sets won', () => {
    const players = [
      makePlayer({ userId: 'a', matchesWon: 2, setsWon: 4 }),
      makePlayer({ userId: 'b', matchesWon: 2, setsWon: 6 }),
    ];
    const rankings = computeRankings(players, []);
    expect(rankings[0].userId).toBe('b');
  });

  it('breaks tie by games won', () => {
    const players = [
      makePlayer({ userId: 'a', matchesWon: 2, setsWon: 4, gamesWon: 20 }),
      makePlayer({ userId: 'b', matchesWon: 2, setsWon: 4, gamesWon: 25 }),
    ];
    const rankings = computeRankings(players, []);
    expect(rankings[0].userId).toBe('b');
  });

  it('breaks tie by game differential', () => {
    const players = [
      makePlayer({
        userId: 'a',
        matchesWon: 2,
        setsWon: 4,
        gamesWon: 20,
        gamesLost: 15,
      }),
      makePlayer({
        userId: 'b',
        matchesWon: 2,
        setsWon: 4,
        gamesWon: 20,
        gamesLost: 10,
      }),
    ];
    const rankings = computeRankings(players, []);
    expect(rankings[0].userId).toBe('b'); // +10 > +5
  });

  it('breaks tie by head-to-head', () => {
    const players = [
      makePlayer({
        userId: 'a',
        matchesWon: 2,
        setsWon: 4,
        gamesWon: 20,
        gamesLost: 10,
      }),
      makePlayer({
        userId: 'b',
        matchesWon: 2,
        setsWon: 4,
        gamesWon: 20,
        gamesLost: 10,
      }),
    ];
    const h2h: HeadToHead[] = [
      {
        id: 'a_b',
        divisionId: 'div1',
        player1Id: 'a',
        player2Id: 'b',
        player1Wins: 2,
        player2Wins: 1,
      },
    ];
    const rankings = computeRankings(players, h2h);
    expect(rankings[0].userId).toBe('a'); // a beat b 2-1
  });

  it('assigns correct rank numbers', () => {
    const players = [
      makePlayer({ userId: 'a', matchesWon: 1 }),
      makePlayer({ userId: 'b', matchesWon: 3 }),
      makePlayer({ userId: 'c', matchesWon: 2 }),
    ];
    const rankings = computeRankings(players, []);
    expect(rankings.find((r) => r.userId === 'b')!.rank).toBe(1);
    expect(rankings.find((r) => r.userId === 'c')!.rank).toBe(2);
    expect(rankings.find((r) => r.userId === 'a')!.rank).toBe(3);
  });
});

const makeTeam = (
  overrides: Partial<DoublesTeamRankingInput> & { teamId: string },
): DoublesTeamRankingInput => ({
  teamId: overrides.teamId,
  playerIds: overrides.playerIds ?? overrides.teamId.split('_'),
  displayName: overrides.displayName ?? overrides.teamId,
  divisionId: 'div1',
  season: '2024',
  matchesWon: overrides.matchesWon ?? 0,
  matchesLost: overrides.matchesLost ?? 0,
  setsWon: overrides.setsWon ?? 0,
  setsLost: overrides.setsLost ?? 0,
  gamesWon: overrides.gamesWon ?? 0,
  gamesLost: overrides.gamesLost ?? 0,
  ...(overrides.seasonId ? { seasonId: overrides.seasonId } : {}),
  ...(overrides.divisionLevelId ? { divisionLevelId: overrides.divisionLevelId } : {}),
});

describe('computeDoublesRankings', () => {
  it('ranks teams by matches won', () => {
    const teams = [
      makeTeam({ teamId: 'ann_bob', matchesWon: 1, matchesLost: 2 }),
      makeTeam({ teamId: 'cara_dan', matchesWon: 3, matchesLost: 0 }),
    ];
    const rankings = computeDoublesRankings(teams, []);
    expect(rankings[0].teamId).toBe('cara_dan');
    expect(rankings[0].rank).toBe(1);
    expect(rankings[1].rank).toBe(2);
  });

  it('breaks a matches-won tie on sets won', () => {
    const teams = [
      makeTeam({ teamId: 'ann_bob', matchesWon: 2, setsWon: 4 }),
      makeTeam({ teamId: 'cara_dan', matchesWon: 2, setsWon: 5 }),
    ];
    expect(computeDoublesRankings(teams, [])[0].teamId).toBe('cara_dan');
  });

  it('breaks a sets tie on games won', () => {
    const teams = [
      makeTeam({ teamId: 'ann_bob', matchesWon: 2, setsWon: 4, gamesWon: 30 }),
      makeTeam({ teamId: 'cara_dan', matchesWon: 2, setsWon: 4, gamesWon: 34 }),
    ];
    expect(computeDoublesRankings(teams, [])[0].teamId).toBe('cara_dan');
  });

  it('breaks a games-won tie on game differential', () => {
    const teams = [
      makeTeam({ teamId: 'ann_bob', matchesWon: 2, setsWon: 4, gamesWon: 30, gamesLost: 25 }),
      makeTeam({ teamId: 'cara_dan', matchesWon: 2, setsWon: 4, gamesWon: 30, gamesLost: 20 }),
    ];
    expect(computeDoublesRankings(teams, [])[0].teamId).toBe('cara_dan');
  });

  it('breaks an otherwise exact tie on team head-to-head', () => {
    const teams = [
      makeTeam({ teamId: 'ann_bob', matchesWon: 2, setsWon: 4, gamesWon: 30, gamesLost: 20 }),
      makeTeam({ teamId: 'cara_dan', matchesWon: 2, setsWon: 4, gamesWon: 30, gamesLost: 20 }),
    ];
    const h2h: HeadToHead[] = [
      {
        id: 'doubles_ann_bob_cara_dan',
        divisionId: 'div1',
        player1Id: 'ann_bob',
        player2Id: 'cara_dan',
        player1Wins: 2,
        player2Wins: 1,
        matchType: 'doubles',
      },
    ];
    expect(computeDoublesRankings(teams, h2h)[0].teamId).toBe('ann_bob');
  });

  it('falls back to display name when teams are completely level', () => {
    const teams = [
      makeTeam({ teamId: 'cara_dan', displayName: 'Cara Lee / Dan Ruiz', matchesWon: 1 }),
      makeTeam({ teamId: 'ann_bob', displayName: 'Ann Smith / Bob Jones', matchesWon: 1 }),
    ];
    expect(computeDoublesRankings(teams, [])[0].teamId).toBe('ann_bob');
  });

  it('derives matchesPlayed and gameDifferential, and keeps the member ids', () => {
    const teams = [
      makeTeam({
        teamId: 'ann_bob',
        playerIds: ['ann', 'bob'],
        matchesWon: 3,
        matchesLost: 1,
        gamesWon: 40,
        gamesLost: 28,
      }),
    ];
    const [row] = computeDoublesRankings(teams, []);
    expect(row.matchesPlayed).toBe(4);
    expect(row.gameDifferential).toBe(12);
    expect(row.playerIds).toEqual(['ann', 'bob']);
    expect(row.updatedAt).toBeGreaterThan(0);
  });

  it('carries seasonId and divisionLevelId through to the row', () => {
    // The doublesRankings queries filter on these fields, so a row written
    // without them would be invisible to a season- or level-scoped standings view.
    const [row] = computeDoublesRankings(
      [
        makeTeam({
          teamId: 'ann_bob',
          seasonId: 'spring-2026',
          divisionLevelId: 'level-1',
          matchesWon: 1,
        }),
      ],
      [],
    );
    expect(row.seasonId).toBe('spring-2026');
    expect(row.divisionLevelId).toBe('level-1');
  });

  it('omits divisionLevelId rather than emitting undefined when it is unset', () => {
    // Firestore rejects an explicit undefined, so the field must be absent.
    const [row] = computeDoublesRankings([makeTeam({ teamId: 'ann_bob' })], []);
    expect('divisionLevelId' in row).toBe(false);
  });

  it('returns an empty table for no teams', () => {
    expect(computeDoublesRankings([], [])).toEqual([]);
  });
});
