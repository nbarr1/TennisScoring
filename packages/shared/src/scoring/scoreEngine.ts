import type {
  LiveScore,
  Player,
  TennisPoint,
  MatchFormat_Config,
  SetScore,
  ServiceSide,
  GameScore,
} from '../types/match';

export type TipTrigger =
  | 'service_change'
  | 'tiebreak_start'
  | 'deuce'
  | 'advantage'
  | 'game_point'
  | 'set_point'
  | 'match_point'
  | 'new_set'
  | 'match_complete';

export interface ScoreResult {
  nextScore: LiveScore;
  tips: TipTrigger[];
  matchWinner?: Player;
  setCompleted?: { setIndex: number; winner: Player };
  gameCompleted?: { winner: Player };
}

const POINT_SEQUENCE: TennisPoint[] = ['0', '15', '30', '40'];

function nextPoint(current: TennisPoint): TennisPoint {
  const idx = POINT_SEQUENCE.indexOf(current);
  return idx < POINT_SEQUENCE.length - 1 ? POINT_SEQUENCE[idx + 1] : '40';
}

function oppositePlayer(p: Player): Player {
  return p === 'player1' ? 'player2' : 'player1';
}

function nextServiceSide(side: ServiceSide): ServiceSide {
  return side === 'deuce' ? 'advantage' : 'deuce';
}

function makeEmptySet(setNumber: number): SetScore {
  return { setNumber, player1Games: 0, player2Games: 0 };
}

function initialLiveScore(): LiveScore {
  return {
    sets: [makeEmptySet(0)],
    currentSet: 0,
    currentGame: { player1: '0', player2: '0' },
    isTiebreak: false,
    server: 'player1',
    serviceSide: 'deuce',
    player1SetsWon: 0,
    player2SetsWon: 0,
  };
}

function deepCloneScore(score: LiveScore): LiveScore {
  return {
    ...score,
    sets: score.sets.map((s) => ({
      ...s,
      tiebreak: s.tiebreak ? { ...s.tiebreak } : undefined,
    })),
    currentGame: { ...score.currentGame },
    tiebreakScore: score.tiebreakScore ? { ...score.tiebreakScore } : undefined,
  };
}

function isMatchPoint(score: LiveScore, scorer: Player, format: MatchFormat_Config): boolean {
  const scorerSets = scorer === 'player1' ? score.player1SetsWon : score.player2SetsWon;
  return scorerSets === format.setsToWin - 1;
}

/** True when `player` wins the current game by taking the next point. */
function isGamePointFor(game: GameScore, player: Player): boolean {
  const mine = game[player];
  const theirs = game[oppositePlayer(player)];
  return mine === 'Ad' || (mine === '40' && theirs !== '40' && theirs !== 'Ad');
}

/**
 * The player one point from winning the current game, if any. At most one player
 * can hold that position, and at deuce neither does.
 */
function playerAtGamePoint(game: GameScore): Player | undefined {
  if (isGamePointFor(game, 'player1')) return 'player1';
  if (isGamePointFor(game, 'player2')) return 'player2';
  return undefined;
}

/**
 * Emits at most one of match_point / set_point / game_point.
 *
 * A set or match point is a *game* point that also decides the set or match, so the
 * game-point check has to gate the others: without it, every point of a game played at
 * 5-3 reports "set point" even at 15-0. The tip describes whoever is actually one point
 * away, which is not necessarily the player who just scored.
 */
function pushOpportunityTips(
  score: LiveScore,
  format: MatchFormat_Config,
  tips: TipTrigger[]
): void {
  const player = playerAtGamePoint(score.currentGame);
  if (!player) return;

  const setPoint = isSetPoint(score, player, format);
  if (setPoint && isMatchPoint(score, player, format)) {
    tips.push('match_point');
  } else if (setPoint) {
    tips.push('set_point');
  } else {
    tips.push('game_point');
  }
}

function isSetPoint(score: LiveScore, scorer: Player, format: MatchFormat_Config): boolean {
  const currentSet = score.sets[score.currentSet];
  const scorerGames = scorer === 'player1' ? currentSet.player1Games : currentSet.player2Games;
  const opponentGames = scorer === 'player1' ? currentSet.player2Games : currentSet.player1Games;
  const scorerGamesIfWinsCurrentGame = scorerGames + 1;
  return (
    scorerGamesIfWinsCurrentGame >= format.gamesPerSet &&
    scorerGamesIfWinsCurrentGame - opponentGames >= 2
  );
}

function completeTiebreak(
  score: LiveScore,
  scorer: Player
): { updatedScore: LiveScore; tips: TipTrigger[]; setWinner?: Player } {
  const next = deepCloneScore(score);
  const tb = next.tiebreakScore!;
  const tips: TipTrigger[] = [];

  if (scorer === 'player1') {
    tb.player1Points++;
  } else {
    tb.player2Points++;
  }

  // Switch ends every 6 points total in tiebreak
  const total = tb.player1Points + tb.player2Points;
  if (total % 6 === 0 && total > 0) {
    tips.push('service_change');
  }

  // Tiebreak service order: one opening point, then alternating two-point blocks.
  if (total > 0 && total % 2 === 1) {
    next.server = oppositePlayer(next.server);
    next.serviceSide = 'deuce';
  } else if (total > 0) {
    next.serviceSide = nextServiceSide(next.serviceSide);
  }

  const winner = resolveTiebreakWinner(tb.player1Points, tb.player2Points);
  if (winner) {
    const currentSet = next.sets[next.currentSet];
    if (winner === 'player1') {
      currentSet.player1Games = Math.max(currentSet.player1Games, currentSet.player2Games + 1);
    } else {
      currentSet.player2Games = Math.max(currentSet.player2Games, currentSet.player1Games + 1);
    }
    currentSet.tiebreak = { ...tb };
    currentSet.winner = winner;
    return { updatedScore: next, tips, setWinner: winner };
  }

  next.tiebreakScore = tb;
  return { updatedScore: next, tips };
}

function resolveTiebreakWinner(p1: number, p2: number): Player | undefined {
  if (p1 >= 7 && p1 - p2 >= 2) return 'player1';
  if (p2 >= 7 && p2 - p1 >= 2) return 'player2';
  return undefined;
}

function resolveSetWinner(
  p1Games: number,
  p2Games: number,
  format: MatchFormat_Config
): Player | undefined {
  const target = format.gamesPerSet;
  if (p1Games >= target && p1Games - p2Games >= 2) return 'player1';
  if (p2Games >= target && p2Games - p1Games >= 2) return 'player2';
  return undefined;
}

export function applyPoint(
  score: LiveScore,
  scorer: Player,
  format: MatchFormat_Config
): ScoreResult {
  const tips: TipTrigger[] = [];

  if (score.isTiebreak) {
    const { updatedScore, tips: tbTips, setWinner } = completeTiebreak(score, scorer);
    tips.push(...tbTips);

    if (!setWinner) {
      return { nextScore: updatedScore, tips };
    }

    return completeSet(updatedScore, setWinner, format, tips);
  }

  const next = deepCloneScore(score);
  const game = next.currentGame;

  // Advance score
  let gameWinner: Player | undefined;

  if (scorer === 'player1') {
    if (game.player1 === 'Ad') {
      // Had advantage — wins game
      gameWinner = 'player1';
    } else if (game.player1 === '40' && game.player2 === 'Ad') {
      // Opponent had advantage — back to deuce
      game.player2 = '40';
      tips.push('deuce');
      return { nextScore: next, tips };
    } else if (game.player1 === '40' && game.player2 === '40') {
      game.player1 = 'Ad';
      tips.push('advantage');
      pushOpportunityTips(next, format, tips);
      return { nextScore: next, tips };
    } else {
      const wasAtForty = game.player1 === '40';
      game.player1 = nextPoint(game.player1);
      if (wasAtForty) gameWinner = 'player1';
    }
  } else {
    if (game.player2 === 'Ad') {
      gameWinner = 'player2';
    } else if (game.player2 === '40' && game.player1 === 'Ad') {
      game.player1 = '40';
      tips.push('deuce');
      return { nextScore: next, tips };
    } else if (game.player2 === '40' && game.player1 === '40') {
      game.player2 = 'Ad';
      tips.push('advantage');
      pushOpportunityTips(next, format, tips);
      return { nextScore: next, tips };
    } else {
      const wasAtForty = game.player2 === '40';
      game.player2 = nextPoint(game.player2);
      if (wasAtForty) gameWinner = 'player2';
    }
  }

  if (!gameWinner) {
    if (game.player1 === '40' && game.player2 === '40') {
      tips.push('deuce');
    }
    pushOpportunityTips(next, format, tips);
    return { nextScore: next, tips };
  }

  // Game won — reset game score, advance server
  next.currentGame = { player1: '0', player2: '0' };
  next.serviceSide = 'deuce';

  if (gameWinner === 'player1') {
    next.sets[next.currentSet].player1Games++;
  } else {
    next.sets[next.currentSet].player2Games++;
  }

  const curSet = next.sets[next.currentSet];

  // Check for tiebreak trigger — skip in the deciding set when finalSetTiebreak is disabled
  const isFinalSet =
    next.player1SetsWon === format.setsToWin - 1 &&
    next.player2SetsWon === format.setsToWin - 1;
  if (
    curSet.player1Games === format.tiebreakAt &&
    curSet.player2Games === format.tiebreakAt &&
    (!isFinalSet || format.finalSetTiebreak)
  ) {
    next.server = oppositePlayer(next.server);
    next.serviceSide = 'deuce';
    next.isTiebreak = true;
    next.tiebreakScore = { player1Points: 0, player2Points: 0 };
    tips.push('service_change', 'tiebreak_start');
    return { nextScore: next, tips };
  }

  // Rotate server after every game
  next.server = oppositePlayer(next.server);
  tips.push('service_change');

  const setWinner = resolveSetWinner(curSet.player1Games, curSet.player2Games, format);
  if (!setWinner) {
    return { nextScore: next, tips, gameCompleted: { winner: gameWinner } };
  }

  return completeSet(next, setWinner, format, tips);
}

function completeSet(
  score: LiveScore,
  setWinner: Player,
  format: MatchFormat_Config,
  tips: TipTrigger[]
): ScoreResult {
  const next = deepCloneScore(score);
  next.sets[next.currentSet].winner = setWinner;
  next.isTiebreak = false;
  delete next.tiebreakScore;

  if (setWinner === 'player1') {
    next.player1SetsWon++;
  } else {
    next.player2SetsWon++;
  }

  const setCompleted = { setIndex: next.currentSet, winner: setWinner };

  if (next.player1SetsWon === format.setsToWin) {
    tips.push('match_complete');
    return { nextScore: next, tips, matchWinner: 'player1', setCompleted };
  }
  if (next.player2SetsWon === format.setsToWin) {
    tips.push('match_complete');
    return { nextScore: next, tips, matchWinner: 'player2', setCompleted };
  }

  // Start new set
  next.currentSet++;
  next.sets.push(makeEmptySet(next.currentSet));
  next.currentGame = { player1: '0', player2: '0' };
  next.serviceSide = 'deuce';
  tips.push('new_set');

  return { nextScore: next, tips, setCompleted };
}

export function createInitialScore(format: MatchFormat_Config): LiveScore {
  void format;
  return initialLiveScore();
}

export function formatScoreDisplay(score: LiveScore): string {
  const sets = score.sets
    .filter((s) => s.winner !== undefined || score.sets.indexOf(s) === score.currentSet)
    .map((s) => {
      if (s.tiebreak && s.winner) {
        const loserPts = s.winner === 'player1' ? s.tiebreak.player2Points : s.tiebreak.player1Points;
        return `${s.player1Games}-${s.player2Games}(${loserPts})`;
      }
      return `${s.player1Games}-${s.player2Games}`;
    });
  return sets.join(', ');
}

export function formatGameScore(score: LiveScore): string {
  if (score.isTiebreak && score.tiebreakScore) {
    return `${score.tiebreakScore.player1Points}-${score.tiebreakScore.player2Points}`;
  }
  const { player1, player2 } = score.currentGame;
  if (player1 === '40' && player2 === '40') return 'Deuce';
  if (player1 === 'Ad') return score.server === 'player1' ? 'Ad In' : 'Ad Out';
  if (player2 === 'Ad') return score.server === 'player2' ? 'Ad In' : 'Ad Out';
  if (player1 === '0' && player2 === '0') return 'Love-all';
  if (player1 === player2) return `${player1}-all`;
  const fmt = (p: TennisPoint) => (p === '0' ? 'Love' : p);
  return `${fmt(player1)} – ${fmt(player2)}`;
}
