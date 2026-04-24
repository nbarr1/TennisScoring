import type {
  LiveScore,
  Player,
  TennisPoint,
  MatchFormat_Config,
  SetScore,
  ServiceSide,
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

function initialLiveScore(format: MatchFormat_Config): LiveScore {
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
  return JSON.parse(JSON.stringify(score));
}

function isMatchPoint(score: LiveScore, scorer: Player, format: MatchFormat_Config): boolean {
  const scorerSets = scorer === 'player1' ? score.player1SetsWon : score.player2SetsWon;
  return scorerSets === format.setsToWin - 1;
}

function isSetPoint(score: LiveScore, scorer: Player, format: MatchFormat_Config): boolean {
  const currentSet = score.sets[score.currentSet];
  const scorerGames = scorer === 'player1' ? currentSet.player1Games : currentSet.player2Games;
  const opponentGames = scorer === 'player1' ? currentSet.player2Games : currentSet.player1Games;
  return scorerGames >= format.gamesPerSet - 1 && scorerGames >= opponentGames;
}

function completeTiebreak(
  score: LiveScore,
  scorer: Player,
  format: MatchFormat_Config
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

  // Alternate server every 2 points (start of tiebreak, then every 2)
  if (total > 0 && total % 2 === 0) {
    next.server = oppositePlayer(next.server);
    next.serviceSide = 'deuce';
  } else if (total > 0) {
    next.serviceSide = nextServiceSide(next.serviceSide);
  }

  const winner = resolveTiebreakWinner(tb.player1Points, tb.player2Points);
  if (winner) {
    next.sets[next.currentSet].tiebreak = { ...tb };
    next.sets[next.currentSet].winner = winner;
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

function resolveGameWinner(p1: TennisPoint, p2: TennisPoint): Player | undefined {
  if (p1 === '40' && p2 !== '40' && p2 !== 'Ad') return 'player1';
  if (p2 === '40' && p1 !== '40' && p1 !== 'Ad') return 'player2';
  if (p1 === 'Ad') return 'player1';
  if (p2 === 'Ad') return 'player2';
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
    const { updatedScore, tips: tbTips, setWinner } = completeTiebreak(score, scorer, format);
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
    if (isMatchPoint(next, scorer, format) && isSetPoint(next, scorer, format)) {
      tips.push('match_point');
    } else if (isSetPoint(next, scorer, format)) {
      tips.push('set_point');
    } else if (game.player1 === '40' || game.player2 === '40') {
      tips.push('game_point');
    }
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

  // Check for tiebreak trigger
  if (
    curSet.player1Games === format.tiebreakAt &&
    curSet.player2Games === format.tiebreakAt
  ) {
    next.isTiebreak = true;
    next.tiebreakScore = { player1Points: 0, player2Points: 0 };
    tips.push('tiebreak_start');
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
  next.tiebreakScore = undefined;

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
  return initialLiveScore(format);
}

export function formatScoreDisplay(score: LiveScore): string {
  const sets = score.sets
    .filter((s) => s.winner !== undefined || score.sets.indexOf(s) === score.currentSet)
    .map((s, i) => {
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
  if (player1 === 'Ad') return score.server === 'player1' ? 'Ad-In' : 'Ad-Out';
  if (player2 === 'Ad') return score.server === 'player2' ? 'Ad-In' : 'Ad-Out';
  if (player1 === '0' && player2 === '0') return 'Love-all';
  if (player1 === player2) return `${player1}-all`;
  const fmt = (p: TennisPoint) => (p === '0' ? 'Love' : p);
  return `${fmt(player1)} – ${fmt(player2)}`;
}
