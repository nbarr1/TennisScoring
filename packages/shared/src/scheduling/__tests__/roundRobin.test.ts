import { generateRoundRobinSchedule } from '../roundRobin';

function pairKey(player1Id: string, player2Id: string): string {
  return [player1Id, player2Id].sort().join('_');
}

describe('generateRoundRobinSchedule', () => {
  it('returns an empty schedule for fewer than 2 players', () => {
    expect(generateRoundRobinSchedule([])).toEqual([]);
    expect(generateRoundRobinSchedule(['A'])).toEqual([]);
  });

  it('pairs 2 players in a single round', () => {
    const schedule = generateRoundRobinSchedule(['A', 'B']);
    expect(schedule).toEqual([{ round: 1, player1Id: 'A', player2Id: 'B', leg: 1 }]);
  });

  it('has every pair play exactly once for an even player count', () => {
    const players = ['A', 'B', 'C', 'D'];
    const schedule = generateRoundRobinSchedule(players);

    // 4 players -> 3 rounds, 2 matches per round, 6 total matches
    expect(schedule).toHaveLength(6);
    expect(new Set(schedule.map((m) => m.round))).toEqual(new Set([1, 2, 3]));

    const seenPairs = new Set(schedule.map((m) => pairKey(m.player1Id, m.player2Id)));
    expect(seenPairs.size).toBe(6);
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        expect(seenPairs.has(pairKey(players[i], players[j]))).toBe(true);
      }
    }
  });

  it('handles an odd player count with a rotating bye', () => {
    const players = ['A', 'B', 'C', 'D', 'E'];
    const schedule = generateRoundRobinSchedule(players);

    // 5 players -> padded to 6 -> 5 rounds, C(5,2) = 10 total matches
    expect(schedule).toHaveLength(10);
    expect(new Set(schedule.map((m) => m.round))).toEqual(new Set([1, 2, 3, 4, 5]));

    const seenPairs = new Set(schedule.map((m) => pairKey(m.player1Id, m.player2Id)));
    expect(seenPairs.size).toBe(10);
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        expect(seenPairs.has(pairKey(players[i], players[j]))).toBe(true);
      }
    }

    // Every round has at most 2 matches (5 players -> 1 sits out each round)
    for (let round = 1; round <= 5; round++) {
      expect(schedule.filter((m) => m.round === round).length).toBeLessThanOrEqual(2);
    }
  });

  it('mirrors leg 1 with swapped sides and continued round numbers for double round robin', () => {
    const players = ['A', 'B', 'C', 'D'];
    const schedule = generateRoundRobinSchedule(players, { doubleRoundRobin: true });

    const leg1 = schedule.filter((m) => m.leg === 1);
    const leg2 = schedule.filter((m) => m.leg === 2);

    expect(leg1).toHaveLength(6);
    expect(leg2).toHaveLength(6);
    expect(new Set(leg1.map((m) => m.round))).toEqual(new Set([1, 2, 3]));
    expect(new Set(leg2.map((m) => m.round))).toEqual(new Set([4, 5, 6]));

    // Leg 2 is leg 1's pairings with sides swapped and round offset by 3
    for (const m of leg1) {
      const hasMirror = leg2.some(
        (m2) =>
          m2.round === m.round + 3 &&
          m2.player1Id === m.player2Id &&
          m2.player2Id === m.player1Id,
      );
      expect(hasMirror).toBe(true);
    }
  });

  it('deduplicates repeated player ids', () => {
    const schedule = generateRoundRobinSchedule(['A', 'B', 'A']);
    expect(schedule).toHaveLength(1);
  });
});
