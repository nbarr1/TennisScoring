import type { LiveScore, MatchFormat_Config, Player } from '../types/match';

export type MatchMomentTone = 'mp' | 'sp' | 'bp' | 'ad' | 'deuce' | 'tb' | 'ok' | 'live';
export type MatchMomentFlag = 'MP' | 'SP' | 'BP';

export interface MatchMoment {
  label: string;
  tone: MatchMomentTone;
  /** The player the moment belongs to: the one on match, set, or break point, or with the advantage. */
  player?: Player;
  flags: Partial<Record<Player, MatchMomentFlag>>;
  /** True only at a changeover: the first point after an odd game, or every six tiebreak points. */
  changeEnds: boolean;
}

/**
 * Whether a player wins the game by winning the next point. Holding 40 is not
 * enough on its own: at 40-40 or 40-Ad the next point only reaches advantage
 * or deuce.
 */
function winsGameOnNextPoint(point: string, opponent: string): boolean {
  if (point === 'Ad') return true;
  return point === '40' && opponent !== '40' && opponent !== 'Ad';
}

/** Describes the current moment of a live match for the scoring screen's status pill. */
export function getMatchMoment(score: LiveScore, format: MatchFormat_Config): MatchMoment {
  const currentSet = score.sets[score.currentSet];
  const p1Point = score.currentGame.player1;
  const p2Point = score.currentGame.player2;

  const totalGames = score.sets.reduce(
    (sum, set) => sum + set.player1Games + set.player2Games,
    0,
  );
  const tiebreakPoints = score.tiebreakScore
    ? score.tiebreakScore.player1Points + score.tiebreakScore.player2Points
    : 0;
  const changeEnds = score.isTiebreak
    ? tiebreakPoints > 0 && tiebreakPoints % 6 === 0
    : totalGames % 2 === 1 && p1Point === '0' && p2Point === '0';

  const moment = (
    label: string,
    tone: MatchMomentTone,
    player?: Player,
    flag?: MatchMomentFlag,
  ): MatchMoment => ({
    label,
    tone,
    ...(player && { player }),
    flags: player && flag ? { [player]: flag } : {},
    changeEnds,
  });

  const onMatchPoint = (player: Player) =>
    (player === 'player1' ? score.player1SetsWon : score.player2SetsWon) === format.setsToWin - 1;

  if (score.isTiebreak && score.tiebreakScore) {
    const tb = score.tiebreakScore;
    const leader: Player | undefined =
      tb.player1Points >= 6 && tb.player1Points > tb.player2Points
        ? 'player1'
        : tb.player2Points >= 6 && tb.player2Points > tb.player1Points
          ? 'player2'
          : undefined;
    if (leader && onMatchPoint(leader)) return moment('Match point', 'mp', leader, 'MP');
    if (leader) return moment('Set point', 'sp', leader, 'SP');
    if (changeEnds) return moment('Side change', 'ok');
    return moment('Tiebreak', 'tb');
  }

  const gamePoint: Player | undefined = winsGameOnNextPoint(p1Point, p2Point)
    ? 'player1'
    : winsGameOnNextPoint(p2Point, p1Point)
      ? 'player2'
      : undefined;

  if (gamePoint) {
    const games = gamePoint === 'player1' ? currentSet.player1Games : currentSet.player2Games;
    const opponentGames = gamePoint === 'player1' ? currentSet.player2Games : currentSet.player1Games;
    const setPoint = games + 1 >= format.gamesPerSet && games + 1 - opponentGames >= 2;
    if (setPoint && onMatchPoint(gamePoint)) return moment('Match point', 'mp', gamePoint, 'MP');
    if (setPoint) return moment('Set point', 'sp', gamePoint, 'SP');
    if (score.server !== gamePoint) return moment('Break point', 'bp', gamePoint, 'BP');
    if (p1Point === 'Ad' || p2Point === 'Ad') return moment('Advantage', 'ad', gamePoint);
  }

  if (p1Point === '40' && p2Point === '40') return moment('Deuce', 'deuce');
  if (changeEnds) return moment('Side change', 'ok');
  return moment('Live', 'live');
}
