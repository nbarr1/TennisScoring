/**
 * Doubles team identity.
 *
 * A doubles team is a *fixed partnership* identified by the sorted pair of its
 * members' user ids. There is no team collection and no team CRUD: the same two
 * players always resolve to the same team id, so their results accumulate onto
 * one standings row across a season without anyone registering a team first.
 */

const DOUBLES_H2H_PREFIX = "doubles";

/** Encode arbitrary Firebase ids without relying on a reserved delimiter. */
function encodeIdParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

function decodeIdParts(value: string): string[] {
  const parts: string[] = [];
  let offset = 0;
  while (offset < value.length) {
    const colon = value.indexOf(":", offset);
    if (colon < 0) return [];
    const lengthText = value.slice(offset, colon);
    if (!/^\d+$/.test(lengthText)) return [];
    const length = Number(lengthText);
    const start = colon + 1;
    const end = start + length;
    if (!Number.isSafeInteger(length) || end > value.length) return [];
    parts.push(value.slice(start, end));
    offset = end;
  }
  return parts;
}

function normalizeIds(playerIds: readonly string[]): string[] {
  return playerIds
    .filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    )
    .map((id) => id.trim());
}

/**
 * Stable, order-independent id for a partnership.
 *
 * Ids are sorted before encoding, so [a, b] and [b, a] produce the same team.
 * Returns an empty string when no usable ids are supplied.
 */
export function doublesTeamId(playerIds: readonly string[]): string {
  const ids = Array.from(new Set(normalizeIds(playerIds))).sort();
  return encodeIdParts(ids);
}

/** The member ids encoded in a team id, in sorted order. */
export function doublesTeamPlayerIds(teamId: string): string[] {
  if (typeof teamId !== "string" || teamId.trim().length === 0) return [];
  return decodeIdParts(teamId);
}

/**
 * Display name for a partnership, e.g. "Ann Smith / Bob Jones".
 *
 * Names are joined in the order given, so pass them in the same order as the
 * side's `playerIds` to keep the name aligned with serve order.
 */
export function formatDoublesTeamName(displayNames: readonly string[]): string {
  const names = displayNames
    .filter(
      (name): name is string =>
        typeof name === "string" && name.trim().length > 0,
    )
    .map((name) => name.trim());
  return names.join(" / ");
}

/**
 * Head-to-head document id for a doubles pairing.
 *
 * Encoded with a doubles marker so it can share the `headToHead` collection
 * with singles records without collisions.
 *
 * Pass `seasonId` to scope the record to one season, matching how doubles
 * standings are bucketed — otherwise a season's tiebreak would be decided by
 * an all-time record.
 */
export function doublesHeadToHeadId(
  teamAId: string,
  teamBId: string,
  seasonId?: string,
  divisionLevelId?: string,
  divisionId?: string,
): string {
  const [first, second] = [teamAId, teamBId].sort();
  const parts = [DOUBLES_H2H_PREFIX];
  if (divisionId && divisionId.trim().length > 0) parts.push(divisionId.trim());
  if (seasonId && seasonId.trim().length > 0) parts.push(seasonId.trim());
  if (divisionLevelId && divisionLevelId.trim().length > 0)
    parts.push(divisionLevelId.trim());
  parts.push(first, second);
  return encodeIdParts(parts);
}
