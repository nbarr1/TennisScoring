import type { LiveScore, Player, SetScore } from '../types/match';

/**
 * One set of a manually recorded (not live-scored) match.
 *
 * `p1`/`p2` are games for an ordinary set. When `matchTiebreak` is true the set
 * was replaced by a match tiebreak, and `p1`/`p2` are the tiebreak's points.
 */
export interface RecordedSetInput {
  p1: number;
  p2: number;
  matchTiebreak?: boolean;
}

/** Points needed to win a match tiebreak (a "super tiebreak"), by a margin of two. */
export const MATCH_TIEBREAK_POINTS = 10;

/**
 * Whether a points score is a finished match tiebreak: the winner reached 10
 * with a two-point lead, and a score past 10 ended as soon as the lead was two.
 */
export function isValidMatchTiebreakScore(p1: number, p2: number): boolean {
  if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) return false;
  const high = Math.max(p1, p2);
  const low = Math.min(p1, p2);
  if (high < MATCH_TIEBREAK_POINTS || high - low < 2) return false;
  return high === MATCH_TIEBREAK_POINTS || high - low === 2;
}

/**
 * Whether the set at `index` could be played as a match tiebreak: the last of an
 * odd number of sets (three or more), which is the deciding set when the sets
 * before it are split.
 */
export function canBeMatchTiebreak(index: number, setCount: number): boolean {
  return setCount >= 3 && setCount % 2 === 1 && index === setCount - 1;
}

/**
 * Returns a user-facing message describing why `sets` is not a valid completed
 * match, or `null` when it is. `buildRecordedMatchScore` throws the same message.
 */
export function validateRecordedSets(sets: RecordedSetInput[]): string | null {
  if (sets.length === 0) return 'At least one set is required.';

  let p1Sets = 0;
  let p2Sets = 0;
  for (const [index, set] of sets.entries()) {
    if (set.matchTiebreak) {
      if (index !== sets.length - 1 || p1Sets !== p2Sets || p1Sets === 0) {
        return 'Only the deciding set can be a match tiebreak.';
      }
      if (!isValidMatchTiebreakScore(set.p1, set.p2)) {
        return 'A match tiebreak is won by the first player to 10 points with a two-point lead (for example, 10-8 or 12-10).';
      }
    } else if (
      !Number.isInteger(set.p1) ||
      !Number.isInteger(set.p2) ||
      set.p1 < 0 ||
      set.p2 < 0
    ) {
      return 'Enter a whole number of games for each set.';
    } else if (set.p1 === set.p2) {
      return 'Each set must have a clear winner. Check the set scores.';
    }
    if (set.p1 > set.p2) p1Sets += 1;
    else p2Sets += 1;
  }

  if (p1Sets === p2Sets) {
    return 'The match must have a clear winner. Check the set scores.';
  }
  return null;
}

/**
 * Builds the completed `LiveScore` for a manually recorded match.
 *
 * A match tiebreak is stored as a 1-0 set carrying its points in `tiebreak`,
 * which is how standings count it: one set and one game to the winner.
 */
export function buildRecordedMatchScore(sets: RecordedSetInput[]): {
  score: LiveScore;
  winner: Player;
} {
  const error = validateRecordedSets(sets);
  if (error) throw new Error(error);

  let p1Sets = 0;
  let p2Sets = 0;
  const builtSets: SetScore[] = sets.map((set, index) => {
    const winner: Player = set.p1 > set.p2 ? 'player1' : 'player2';
    if (winner === 'player1') p1Sets += 1;
    else p2Sets += 1;
    if (set.matchTiebreak) {
      return {
        setNumber: index,
        player1Games: winner === 'player1' ? 1 : 0,
        player2Games: winner === 'player2' ? 1 : 0,
        tiebreak: { player1Points: set.p1, player2Points: set.p2 },
        matchTiebreak: true,
        winner,
      };
    }
    return {
      setNumber: index,
      player1Games: set.p1,
      player2Games: set.p2,
      winner,
    };
  });

  return {
    winner: p1Sets > p2Sets ? 'player1' : 'player2',
    score: {
      sets: builtSets,
      currentSet: sets.length - 1,
      currentGame: { player1: '0', player2: '0' },
      isTiebreak: false,
      server: 'player1',
      serviceSide: 'deuce',
      player1SetsWon: p1Sets,
      player2SetsWon: p2Sets,
    },
  };
}

/** The inverse of `buildRecordedMatchScore`, for pre-filling a score editor. */
export function recordedSetsFromScore(score: LiveScore): RecordedSetInput[] {
  return score.sets.map((set) =>
    set.matchTiebreak && set.tiebreak
      ? { p1: set.tiebreak.player1Points, p2: set.tiebreak.player2Points, matchTiebreak: true }
      : { p1: set.player1Games, p2: set.player2Games },
  );
}

/**
 * Parses one set token from a typed score line: `6-4` or `7:5` for games, and
 * `[10-8]` for a match tiebreak. Returns `null` for anything else.
 */
export function parseRecordedSetToken(token: string): RecordedSetInput | null {
  const trimmed = token.trim();
  const tiebreak = trimmed.match(/^\[\s*(\d{1,2})\s*[-:]\s*(\d{1,2})\s*\]$/);
  if (tiebreak) {
    return { p1: parseInt(tiebreak[1], 10), p2: parseInt(tiebreak[2], 10), matchTiebreak: true };
  }
  const games = trimmed.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
  if (!games) return null;
  return { p1: parseInt(games[1], 10), p2: parseInt(games[2], 10) };
}

const SET_TOKEN = /\[\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*\]|\d{1,2}\s*[-:]\s*\d{1,2}/g;

/**
 * Parses a whole typed score line such as `6-4, 3-6, [10-8]` (commas,
 * semicolons, or spaces between sets) into sets from player 1's side. Returns
 * `null` when the line holds no set or anything other than set tokens.
 * Whether the sets form a valid match is `validateRecordedSets()`'s job.
 */
export function parseRecordedScoreLine(line: string): RecordedSetInput[] | null {
  const tokens = line.match(SET_TOKEN) ?? [];
  if (tokens.length === 0) return null;
  if (line.replace(SET_TOKEN, '').replace(/[\s,;]/g, '') !== '') return null;
  const sets = tokens.map(parseRecordedSetToken);
  return sets.every((set): set is RecordedSetInput => set !== null) ? sets : null;
}
