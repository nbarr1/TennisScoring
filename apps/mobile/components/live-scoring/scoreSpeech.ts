import {
  formatGameScore,
  formatScoreDisplay,
  type LiveScore,
  type Player,
} from "@tennis/shared";

/**
 * How the live score is read aloud and summarised. VoiceOver and TalkBack read
 * "6-4" as "6 minus 4" and "0" as "zero", so the screen speaks the score the
 * way an umpire calls it instead. Display only: nothing here touches scoring.
 */

type Names = Record<Player, string>;

const other = (player: Player): Player =>
  player === "player1" ? "player2" : "player1";

function spokenPoint(point: string): string {
  if (point === "0") return "love";
  if (point === "Ad") return "advantage";
  return point;
}

/**
 * The game score as an umpire calls it: the server's points first, whichever
 * row they occupy. formatGameScore reads player1 first, which put the call
 * backwards whenever player2 served.
 */
export function serverFirstCall(score: LiveScore): string {
  const call = formatGameScore(score);
  if (score.server !== "player2") return call;
  const [first, second, ...rest] = call.split(" – ");
  return second !== undefined && rest.length === 0
    ? `${second} – ${first}`
    : call;
}

/** "Deuce", "Advantage Rivera", "30–15", "Tiebreak, Rivera 4, Lee 3". */
export function spokenGameCall(score: LiveScore, names: Names): string {
  if (score.isTiebreak && score.tiebreakScore) {
    return `Tiebreak, ${names.player1} ${score.tiebreakScore.player1Points}, ${names.player2} ${score.tiebreakScore.player2Points}`;
  }
  const { player1, player2 } = score.currentGame;
  if (player1 === "40" && player2 === "40") return "Deuce";
  if (player1 === "Ad") return `Advantage ${names.player1}`;
  if (player2 === "Ad") return `Advantage ${names.player2}`;
  const server = score.server;
  const serverPoint = score.currentGame[server];
  const receiverPoint = score.currentGame[other(server)];
  if (serverPoint === receiverPoint) return `${spokenPoint(serverPoint)} all`;
  return `${spokenPoint(serverPoint)}, ${spokenPoint(receiverPoint)}`;
}

/** Set scores for speech: "6 to 4, 3 to 2". */
export function spokenSets(score: LiveScore): string {
  return formatScoreDisplay(score)
    .replace(/[[\]]/g, "")
    .replace(/\((\d+)\)/g, ", tiebreak $1")
    .replace(/-/g, " to ");
}

function gamesInCurrentSet(score: LiveScore): { p1: number; p2: number } {
  const set = score.sets[score.currentSet];
  return { p1: set?.player1Games ?? 0, p2: set?.player2Games ?? 0 };
}

export function spokenGames(score: LiveScore, names: Names): string {
  const { p1, p2 } = gamesInCurrentSet(score);
  return `Games: ${names.player1} ${p1}, ${names.player2} ${p2}`;
}

/**
 * What a screen reader hears after a point lands. Names the point's winner,
 * then whatever changed: the game call, a game, a set, or the match.
 */
export function describePoint(
  prev: LiveScore,
  next: LiveScore,
  scorer: Player,
  names: Names,
  matchWinner?: Player,
): string {
  const who = names[scorer];
  if (matchWinner) {
    return `Game, set, and match, ${names[matchWinner]}. Final score ${spokenSets(next)}.`;
  }
  const setsBefore = prev.player1SetsWon + prev.player2SetsWon;
  const setsAfter = next.player1SetsWon + next.player2SetsWon;
  if (setsAfter > setsBefore) {
    return `Set, ${who}. Sets: ${names.player1} ${next.player1SetsWon}, ${names.player2} ${next.player2SetsWon}. ${names[next.server]} to serve.`;
  }
  const before = gamesInCurrentSet(prev);
  const after = gamesInCurrentSet(next);
  if (
    next.currentSet === prev.currentSet &&
    after.p1 + after.p2 > before.p1 + before.p2
  ) {
    return `Game, ${who}. ${spokenGames(next, names)}. ${names[next.server]} to serve.`;
  }
  return `Point, ${who}. ${spokenGameCall(next, names)}.`;
}

/**
 * The short line on the undo key saying where undo goes back to, with the
 * games when the last point finished a game.
 */
export function undoTargetLabel(current: LiveScore, target: LiveScore): string {
  const call = serverFirstCall(target);
  const now = gamesInCurrentSet(current);
  const then = gamesInCurrentSet(target);
  const gamesChanged =
    current.currentSet !== target.currentSet ||
    now.p1 !== then.p1 ||
    now.p2 !== then.p2;
  return gamesChanged
    ? `Back to ${call} · games ${then.p1}–${then.p2}`
    : `Back to ${call}`;
}

export function spokenUndoTarget(target: LiveScore, names: Names): string {
  return `${spokenGameCall(target, names)}. ${spokenGames(target, names)}`;
}

export { spokenPoint };
