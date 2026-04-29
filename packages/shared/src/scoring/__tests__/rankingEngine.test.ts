import { computeRankings, extractMatchTotals } from '../rankingEngine';
import type { RankingInput } from '../rankingEngine';
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
