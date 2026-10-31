import type { LiveScore, MatchFormat_Config, Player } from '../types/match';
import { applyPoint } from './scoreEngine';

/**
 * Points scored while the phone couldn't reach the server.
 *
 * The mobile match screen keeps them on the device in tap order and sends them
 * to `scoreMatchPoint` one at a time once the connection is back. Each carries
 * the id that call's duplicate check reads, so a point whose reply was lost is
 * not counted twice when it is sent again. Until the server has them, the
 * scoreboard shows the stored score with the queue played on top.
 */
export interface QueuedPoint {
  pointId: string;
  scorer: Player;
  pointAttribution?: 'ace' | 'winner' | 'opponent_error';
  queuedAt: number;
}

/**
 * The queued points the server has not applied yet. `lastPointId` is the id of
 * the last point the server applied (the match's `lastPointId`); every queued
 * point up to and including it has already landed. Reading it from the match
 * document, rather than trusting the reply, keeps the scoreboard right
 * whichever of the reply and the document update arrives first.
 */
export function unappliedQueuedPoints(
  queue: readonly QueuedPoint[],
  lastPointId: string | undefined,
): QueuedPoint[] {
  if (!lastPointId) return [...queue];
  const index = queue.findIndex((point) => point.pointId === lastPointId);
  return index === -1 ? [...queue] : queue.slice(index + 1);
}

/**
 * The score with `queue` played on top of `score`. Stops at the point that wins
 * the match: anything after it could never be applied.
 */
export function projectQueuedPoints(
  score: LiveScore,
  format: MatchFormat_Config,
  queue: readonly QueuedPoint[],
): { score: LiveScore; matchWinner?: Player; applied: number } {
  let current = score;
  let applied = 0;
  for (const point of queue) {
    const result = applyPoint(current, point.scorer, format);
    current = result.nextScore;
    applied += 1;
    if (result.matchWinner) return { score: current, matchWinner: result.matchWinner, applied };
  }
  return { score: current, applied };
}
