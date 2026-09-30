import { applyPoint, createInitialScore } from '../scoreEngine';
import { getMatchMoment } from '../matchMoment';
import { DEFAULT_FORMAT, type LiveScore } from '../../types/match';

/** Replays points through the engine: 'A' is a point to player1, 'B' to player2. */
function play(seq: string, from: LiveScore = createInitialScore(DEFAULT_FORMAT)): LiveScore {
  let score = from;
  for (const ch of seq.replace(/\s/g, '')) {
    score = applyPoint(score, ch === 'A' ? 'player1' : 'player2', DEFAULT_FORMAT).nextScore;
  }
  return score;
}

/** Each letter is a game won to love by that player. */
const games = (winners: string) =>
  winners
    .split('')
    .map((w) => w.repeat(4))
    .join('');

const moment = (score: LiveScore) => getMatchMoment(score, DEFAULT_FORMAT);

describe('getMatchMoment', () => {
  it('reads Deuce at 40-40 when player1 serves', () => {
    const score = play('ABABAB');
    expect(score.server).toBe('player1');
    expect(moment(score)).toMatchObject({ label: 'Deuce', tone: 'deuce', flags: {} });
    expect(moment(score).player).toBeUndefined();
  });

  it('reads Deuce at 40-40 when player2 serves', () => {
    const score = play(games('A') + 'ABABAB');
    expect(score.server).toBe('player2');
    expect(moment(score)).toMatchObject({ label: 'Deuce', flags: {} });
  });

  it('gives Advantage to the server without flagging the receiver on 40', () => {
    const score = play('ABABAB' + 'A');
    expect(moment(score)).toMatchObject({ label: 'Advantage', tone: 'ad', player: 'player1', flags: {} });
  });

  it('flags a break point for the receiver at 30-40', () => {
    const score = play('ABBBA');
    expect(moment(score)).toMatchObject({ label: 'Break point', player: 'player2', flags: { player2: 'BP' } });
  });

  it('flags a break point for the receiver with the advantage', () => {
    const score = play('ABABAB' + 'B');
    expect(moment(score)).toMatchObject({ label: 'Break point', player: 'player2', flags: { player2: 'BP' } });
  });

  it('reads Live for the server at 40-30', () => {
    expect(moment(play('AAABB'))).toMatchObject({ label: 'Live', tone: 'live', flags: {} });
  });

  it('does not report a set point at deuce', () => {
    // 5-4 to player1, then deuce.
    const score = play(games('ABABABABA') + 'ABABAB');
    expect(moment(score).label).toBe('Deuce');
  });

  it('reports a set point once the leader can win the game', () => {
    const setPoint = play(games('ABABABABA') + 'AAA');
    expect(moment(setPoint)).toMatchObject({ label: 'Set point', player: 'player1', flags: { player1: 'SP' } });
  });

  it('reports a match point in the deciding moment of the second set', () => {
    const score = play(games('ABABABABAA') + games('ABABABAA') + 'AABA');
    expect(moment(score)).toMatchObject({ label: 'Match point', player: 'player1', flags: { player1: 'MP' } });
  });

  it('reads Side change only at the start of the game after an odd game', () => {
    const afterGame = play(games('ABA'));
    expect(moment(afterGame)).toMatchObject({ label: 'Side change', tone: 'ok', changeEnds: true });
    const onePointIn = play('A', afterGame);
    expect(moment(onePointIn)).toMatchObject({ label: 'Live', changeEnds: false });
    expect(moment(play(games('AB'))).changeEnds).toBe(false);
  });

  describe('tiebreak', () => {
    const sixAll = games('ABABABABABAB');
    const tb = (seq: string) => play(sixAll + seq);

    it('reads Tiebreak once the tiebreak starts', () => {
      expect(moment(tb('ABA'))).toMatchObject({ label: 'Tiebreak', tone: 'tb' });
    });

    it('reads Side change after six tiebreak points', () => {
      expect(moment(tb('ABABAB'))).toMatchObject({ label: 'Side change', changeEnds: true });
    });

    it('reports a set point at 6-1', () => {
      expect(moment(tb('AAAAABA'))).toMatchObject({ label: 'Set point', player: 'player1', flags: { player1: 'SP' } });
    });

    it('reports a match point when the leader already has a set', () => {
      const matchPoint = play(games('ABABABABAA') + sixAll + 'AAAAABA');
      expect(moment(matchPoint)).toMatchObject({ label: 'Match point', player: 'player1', flags: { player1: 'MP' } });
    });
  });
});
