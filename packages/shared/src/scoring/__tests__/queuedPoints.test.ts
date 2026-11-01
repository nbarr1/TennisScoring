import { DEFAULT_FORMAT } from '../../types/match';
import { createInitialScore } from '../scoreEngine';
import { projectQueuedPoints, unappliedQueuedPoints, type QueuedPoint } from '../queuedPoints';

const point = (pointId: string, scorer: 'player1' | 'player2' = 'player1'): QueuedPoint => ({
  pointId,
  scorer,
  queuedAt: 0,
});

describe('unappliedQueuedPoints', () => {
  const queue = [point('a'), point('b'), point('c')];

  it('keeps the whole queue when the server has none of it', () => {
    expect(unappliedQueuedPoints(queue, undefined)).toEqual(queue);
    expect(unappliedQueuedPoints(queue, 'other')).toEqual(queue);
  });

  it('drops the points up to the last one applied', () => {
    expect(unappliedQueuedPoints(queue, 'a').map((p) => p.pointId)).toEqual(['b', 'c']);
    expect(unappliedQueuedPoints(queue, 'c')).toEqual([]);
  });
});

describe('projectQueuedPoints', () => {
  const start = createInitialScore(DEFAULT_FORMAT);

  it('returns the score unchanged for an empty queue', () => {
    expect(projectQueuedPoints(start, DEFAULT_FORMAT, [])).toEqual({ score: start, applied: 0 });
  });

  it('plays the queue on top of the stored score', () => {
    const result = projectQueuedPoints(start, DEFAULT_FORMAT, [point('a'), point('b'), point('c', 'player2')]);
    expect(result.applied).toBe(3);
    expect(result.score.currentGame).toEqual({ player1: '30', player2: '15' });
  });

  it('stops at the point that wins the match', () => {
    // Best of three: 48 straight points win two 6-0 sets.
    const queue = Array.from({ length: 50 }, (_, i) => point(`p${i}`));
    const result = projectQueuedPoints(start, DEFAULT_FORMAT, queue);
    expect(result.matchWinner).toBe('player1');
    expect(result.applied).toBe(48);
  });
});
