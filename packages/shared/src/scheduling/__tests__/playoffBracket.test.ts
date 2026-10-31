import {
  createPlayoffSlots,
  nextPlayoffPlace,
  playoffBracketSize,
  playoffChampion,
  playoffRoundName,
  playoffRounds,
  playoffSeedOrder,
  playoffSlotKey,
  readyPlayoffSlots,
  recordPlayoffWinner,
} from '../playoffBracket';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('playoffBracketSize', () => {
  it('pads to the next power of two', () => {
    expect(playoffBracketSize(2)).toBe(2);
    expect(playoffBracketSize(3)).toBe(4);
    expect(playoffBracketSize(5)).toBe(8);
    expect(playoffBracketSize(8)).toBe(8);
    expect(playoffBracketSize(17)).toBe(32);
  });

  it('refuses counts outside 2 to 32', () => {
    expect(playoffBracketSize(1)).toBe(0);
    expect(playoffBracketSize(33)).toBe(0);
    expect(playoffBracketSize(2.5)).toBe(0);
  });
});

describe('playoffSeedOrder', () => {
  it('keeps the top seeds apart', () => {
    expect(playoffSeedOrder(2)).toEqual([1, 2]);
    expect(playoffSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(playoffSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('pairs seeds that sum to size + 1', () => {
    const order = playoffSeedOrder(16);
    for (let i = 0; i < order.length; i += 2) expect(order[i] + order[i + 1]).toBe(17);
  });
});

describe('playoffRoundName', () => {
  it('names the late rounds', () => {
    expect(playoffRoundName(3, 3)).toBe('Final');
    expect(playoffRoundName(2, 3)).toBe('Semifinal');
    expect(playoffRoundName(1, 3)).toBe('Quarterfinal');
    expect(playoffRoundName(1, 4)).toBe('Round of 16');
    expect(playoffRoundName(1, 5)).toBe('Round of 32');
  });
});

describe('nextPlayoffPlace', () => {
  it('sends even slots to player 1 and odd slots to player 2', () => {
    expect(nextPlayoffPlace(1, 0, 3)).toEqual({ round: 2, slot: 0, side: 'player1' });
    expect(nextPlayoffPlace(1, 3, 3)).toEqual({ round: 2, slot: 1, side: 'player2' });
    expect(nextPlayoffPlace(3, 0, 3)).toBeUndefined();
  });
});

describe('createPlayoffSlots', () => {
  it('pairs a full bracket of four', () => {
    const { size, totalRounds, slots } = createPlayoffSlots(players(4));
    expect(size).toBe(4);
    expect(totalRounds).toBe(2);
    expect(slots[playoffSlotKey(1, 0)]).toMatchObject({ player1Id: 'p1', player2Id: 'p4' });
    expect(slots[playoffSlotKey(1, 1)]).toMatchObject({ player1Id: 'p2', player2Id: 'p3' });
    expect(slots[playoffSlotKey(2, 0)]).toMatchObject({ player1Id: null, player2Id: null });
    expect(readyPlayoffSlots(slots).map((s) => s.slot)).toEqual([0, 1]);
  });

  it('gives byes to the top seeds and moves them into round 2', () => {
    const { size, slots } = createPlayoffSlots(players(6));
    expect(size).toBe(8);
    const r1 = playoffRounds(slots, 3)[0];
    expect(r1.filter((s) => s.bye).map((s) => s.winnerId).sort()).toEqual(['p1', 'p2']);
    expect(slots[playoffSlotKey(2, 0)]).toMatchObject({ player1Id: 'p1', player1Seed: 1, player2Id: null });
    expect(slots[playoffSlotKey(2, 1)]).toMatchObject({ player1Id: 'p2', player1Seed: 2, player2Id: null });
    // Only the four real round-1 matches are ready.
    expect(readyPlayoffSlots(slots)).toHaveLength(2);
  });

  it('makes a round-2 match ready when both feeders were byes', () => {
    // 3 players in 4 places: seed 1 has a bye, seeds 2 and 3 play.
    const { slots } = createPlayoffSlots(players(3));
    expect(slots[playoffSlotKey(1, 0)]).toMatchObject({ winnerId: 'p1', bye: true });
    expect(readyPlayoffSlots(slots).map((s) => playoffSlotKey(s.round, s.slot))).toEqual(['r1s1']);
  });

  it('drops duplicate and empty ids', () => {
    expect(createPlayoffSlots(['a', 'b', 'a', '', ' ']).seedIds).toEqual(['a', 'b']);
  });

  it('refuses too few or too many players', () => {
    expect(() => createPlayoffSlots(['a'])).toThrow();
    expect(() => createPlayoffSlots(players(33))).toThrow();
  });
});

describe('recordPlayoffWinner', () => {
  it('plays a bracket of four through to a champion', () => {
    let { slots } = createPlayoffSlots(players(4));
    slots = recordPlayoffWinner(slots, 2, 1, 0, 'p4')!;
    expect(slots[playoffSlotKey(2, 0)]).toMatchObject({ player1Id: 'p4', player1Seed: 4 });
    expect(readyPlayoffSlots(slots)).toHaveLength(1);
    slots = recordPlayoffWinner(slots, 2, 1, 1, 'p2')!;
    expect(readyPlayoffSlots(slots).map((s) => s.round)).toEqual([2]);
    expect(playoffChampion(slots, 2)).toBeUndefined();
    slots = recordPlayoffWinner(slots, 2, 2, 0, 'p2')!;
    expect(playoffChampion(slots, 2)).toBe('p2');
    expect(readyPlayoffSlots(slots)).toHaveLength(0);
  });

  it('ignores a repeat, an unknown slot, or a winner who is not in the slot', () => {
    const { slots } = createPlayoffSlots(players(4));
    const decided = recordPlayoffWinner(slots, 2, 1, 0, 'p1')!;
    expect(recordPlayoffWinner(decided, 2, 1, 0, 'p4')).toBeNull();
    expect(recordPlayoffWinner(slots, 2, 3, 0, 'p1')).toBeNull();
    expect(recordPlayoffWinner(slots, 2, 1, 0, 'p2')).toBeNull();
  });

  it('does not change the slots it was given', () => {
    const { slots } = createPlayoffSlots(players(4));
    const before = JSON.stringify(slots);
    recordPlayoffWinner(slots, 2, 1, 0, 'p1');
    expect(JSON.stringify(slots)).toBe(before);
  });
});
