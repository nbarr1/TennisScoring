import type { Match, MatchSide, Player } from '../types/match';

/**
 * Side accessors for matches.
 *
 * `Player` ('player1' | 'player2') is a *side* label, not a person: singles
 * matches carry one player per side, doubles matches carry two. Legacy singles
 * documents predate `side1`/`side2` entirely, so every accessor here falls back
 * to the flat `player1Id`/`player2Id`/`player1Name`/`player2Name` fields.
 *
 * Consumers should read sides through these helpers rather than touching
 * `player1Id`/`player2Id` directly, so singles and doubles behave identically.
 */

/** The part of a match these helpers need. Accepts a full `Match` or a partial read. */
export type MatchSidesLike = Pick<Match, 'player1Id' | 'player2Id'> &
  Partial<Pick<Match, 'side1' | 'side2' | 'player1Name' | 'player2Name' | 'playerIds' | 'matchType'>>;

function sideOf(match: MatchSidesLike, side: Player): MatchSide | undefined {
  return side === 'player1' ? match.side1 : match.side2;
}

export function opposingSide(side: Player): Player {
  return side === 'player1' ? 'player2' : 'player1';
}

/**
 * True when the document actually has two full partnerships.
 *
 * Deliberately tests the *shape*, not `matchType`. `matchType` is a label
 * stamped from the division level onto every match created in it, so an
 * ordinary two-player match inside a "Beginner Doubles" level carries
 * `matchType: 'doubles'` while being a singles match. It is also
 * client-writable. The side rosters are the only trustworthy signal.
 */
export function isDoublesMatch(match: MatchSidesLike): boolean {
  return (
    sidePlayerIds(match, 'player1').length === 2 &&
    sidePlayerIds(match, 'player2').length === 2
  );
}

/**
 * Every user id on one side, in serve order. Falls back to the single flat id
 * for singles matches and for any document written before `side1`/`side2`.
 */
export function sidePlayerIds(match: MatchSidesLike, side: Player): string[] {
  const ids = sideOf(match, side)?.playerIds;
  if (Array.isArray(ids)) {
    const cleaned = ids.filter((id) => typeof id === 'string' && id.trim().length > 0);
    if (cleaned.length > 0) return cleaned;
  }
  const flatId = side === 'player1' ? match.player1Id : match.player2Id;
  return typeof flatId === 'string' && flatId.trim().length > 0 ? [flatId] : [];
}

/**
 * The name to show for a side. Doubles matches store the team name on the side
 * *and* mirror it into `player1Name`/`player2Name`, so either source is correct.
 */
export function sideDisplayName(match: MatchSidesLike, side: Player): string {
  const sideName = sideOf(match, side)?.displayName?.trim();
  if (sideName) return sideName;
  const flatName = (side === 'player1' ? match.player1Name : match.player2Name)?.trim();
  if (flatName) return flatName;
  return sidePlayerIds(match, side)[0] ?? '';
}

/** Which side a user plays on, or undefined when they are not in the match. */
export function sideOfPlayer(match: MatchSidesLike, userId: string): Player | undefined {
  if (sidePlayerIds(match, 'player1').includes(userId)) return 'player1';
  if (sidePlayerIds(match, 'player2').includes(userId)) return 'player2';
  return undefined;
}

/** True when the user plays in the match, on either side. */
export function isMatchParticipant(match: MatchSidesLike, userId: string): boolean {
  if (!userId) return false;
  if (Array.isArray(match.playerIds) && match.playerIds.includes(userId)) return true;
  return sideOfPlayer(match, userId) !== undefined;
}

/** True when both users play on the same side — i.e. they are partners. */
export function arePartners(match: MatchSidesLike, userId: string, otherUserId: string): boolean {
  if (userId === otherUserId) return false;
  const side = sideOfPlayer(match, userId);
  return side !== undefined && side === sideOfPlayer(match, otherUserId);
}

/**
 * True when the user may confirm or dispute a report submitted by `submittedBy`.
 *
 * A report is confirmed by the *opposing* side, never by the submitter or their
 * partner. For legacy singles documents this reduces to "not the submitter".
 */
export function canRespondToReport(
  match: MatchSidesLike,
  userId: string,
  submittedBy: string | undefined,
): boolean {
  if (!userId || !submittedBy || userId === submittedBy) return false;
  const submitterSide = sideOfPlayer(match, submittedBy);
  if (submitterSide === undefined) return isMatchParticipant(match, userId);
  return sideOfPlayer(match, userId) === opposingSide(submitterSide);
}
