/**
 * Doubles team identity.
 *
 * A doubles team is a *fixed partnership* identified by the sorted pair of its
 * members' user ids. There is no team collection and no team CRUD: the same two
 * players always resolve to the same team id, so their results accumulate onto
 * one standings row across a season without anyone registering a team first.
 */

const TEAM_ID_SEPARATOR = '_';
const DOUBLES_H2H_PREFIX = 'doubles';

function normalizeIds(playerIds: readonly string[]): string[] {
  return playerIds
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());
}

/**
 * Stable, order-independent id for a partnership.
 *
 * Ids are sorted before joining, so [a, b] and [b, a] produce the same team.
 * Returns an empty string when no usable ids are supplied.
 */
export function doublesTeamId(playerIds: readonly string[]): string {
  const ids = Array.from(new Set(normalizeIds(playerIds))).sort();
  return ids.join(TEAM_ID_SEPARATOR);
}

/** The member ids encoded in a team id, in sorted order. */
export function doublesTeamPlayerIds(teamId: string): string[] {
  if (typeof teamId !== 'string' || teamId.trim().length === 0) return [];
  return teamId.split(TEAM_ID_SEPARATOR).filter((id) => id.length > 0);
}

/**
 * Display name for a partnership, e.g. "Ann Smith / Bob Jones".
 *
 * Names are joined in the order given, so pass them in the same order as the
 * side's `playerIds` to keep the name aligned with serve order.
 */
export function formatDoublesTeamName(displayNames: readonly string[]): string {
  const names = displayNames
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.trim());
  return names.join(' / ');
}

/**
 * Head-to-head document id for a doubles pairing.
 *
 * Prefixed so it can share the `headToHead` collection with singles records
 * (whose ids are `${userId}_${userId}`) without any chance of collision.
 */
export function doublesHeadToHeadId(teamAId: string, teamBId: string): string {
  const [first, second] = [teamAId, teamBId].sort();
  return [DOUBLES_H2H_PREFIX, first, second].join(TEAM_ID_SEPARATOR);
}
