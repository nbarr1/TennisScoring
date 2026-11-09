export type SeasonHalf = 'spring' | 'fall';
export type SeasonStatus = 'draft' | 'active' | 'completed' | 'archived';
export type DivisionSkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'open';
export type DivisionMatchType = 'singles' | 'doubles';

export interface Season {
  id: string;
  divisionId: string;
  year: number;
  half: SeasonHalf;
  name: string;
  startsAt?: number;
  endsAt?: number;
  status: SeasonStatus;
  createdAt: number;
  updatedAt: number;
}

export interface DivisionLevel {
  id: string;
  divisionId: string;
  seasonId: string;
  year: number;
  seasonHalf: SeasonHalf;
  name: string;
  skillLevel: DivisionSkillLevel;
  matchType: DivisionMatchType;
  description?: string;
  rankingsEnabled: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}


export type DivisionMembershipRole = 'player' | 'division_leader';
export type DivisionMembershipStatus = 'active' | 'waitlisted' | 'removed';
export type DivisionMembershipSource = 'registered_user' | 'placeholder' | 'imported' | 'migration';

export interface DivisionMembership {
  id: string;
  divisionId: string;
  seasonId: string;
  divisionLevelId: string;
  userId: string;
  displayNameSnapshot: string;
  emailSnapshot?: string;
  phoneSnapshot?: string;
  role: DivisionMembershipRole;
  status: DivisionMembershipStatus;
  source: DivisionMembershipSource;
  assignedBy: string;
  createdAt: number;
  updatedAt: number;
}

export function divisionMembershipId(
  seasonId: string,
  divisionLevelId: string,
  userId: string,
): string {
  return `${seasonId}_${divisionLevelId}_${userId}`;
}

export interface Division {
  id: string;
  name: string;
  inviteCode: string;
  leaderIds: string[];
  playerIds: string[];
  activeSeasonId?: string;
  /**
   * Written by Cloud Functions on every whole-division ranking recalculation:
   * how many completed matches carry no `seasonId`. Those count in the active
   * season, so a recalculation is limited to the active season only while this
   * is 0. Never written by clients.
   */
  rankingsUnseasonedMatchCount?: number;
  createdAt: number;
  updatedAt: number;
}

export const SEASON_HALVES: SeasonHalf[] = ['spring', 'fall'];
export const DIVISION_SKILL_LEVELS: DivisionSkillLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'open',
];
export const DIVISION_MATCH_TYPES: DivisionMatchType[] = ['singles', 'doubles'];

export function seasonId(year: number, half: SeasonHalf): string {
  return `${half}-${year}`;
}

export function formatSeasonName(year: number, half: SeasonHalf): string {
  return `${half === 'spring' ? 'Spring' : 'Fall'} ${year}`;
}

export function currentSeasonForDate(date = new Date()): Pick<Season, 'id' | 'year' | 'half' | 'name'> {
  const year = date.getUTCFullYear();
  const half: SeasonHalf = date.getUTCMonth() < 6 ? 'spring' : 'fall';
  return { id: seasonId(year, half), year, half, name: formatSeasonName(year, half) };
}

export function defaultSeasonOptions(
  baseDate = new Date(),
): Array<Pick<Season, 'id' | 'year' | 'half' | 'name'>> {
  const year = baseDate.getUTCFullYear();
  return [year - 1, year, year + 1].flatMap((seasonYear) =>
    SEASON_HALVES.map((half) => ({
      id: seasonId(seasonYear, half),
      year: seasonYear,
      half,
      name: formatSeasonName(seasonYear, half),
    })),
  );
}

export function formatDivisionLevelName(
  skillLevel: DivisionSkillLevel,
  matchType: DivisionMatchType,
): string {
  const skill = skillLevel[0].toUpperCase() + skillLevel.slice(1);
  return `${skill} ${matchType === 'singles' ? 'Singles' : 'Doubles'}`;
}

/**
 * The match type a level plays. Levels saved before match types existed carry
 * none and read as singles, which is what they were.
 */
export function divisionLevelMatchType(
  level: { matchType?: unknown } | null | undefined,
): DivisionMatchType {
  return level?.matchType === 'doubles' ? 'doubles' : 'singles';
}

/**
 * A player holds at most one rostered membership per match type in a season,
 * so they can play one singles level and one doubles level side by side.
 * Writing a membership retires the player's other membership of the *same*
 * match type (a move between levels) and leaves the other match type alone.
 *
 * Returns the level a player holds for each match type, from that player's
 * rostered memberships for one season. When legacy data holds two of one
 * type, the most recently updated wins, so a roster never shows both.
 */
export function levelIdsByMatchType(
  memberships: ReadonlyArray<Pick<DivisionMembership, 'divisionLevelId'> & { updatedAt?: unknown }>,
  levelById: ReadonlyMap<string, { matchType?: unknown }>,
): Partial<Record<DivisionMatchType, string>> {
  const result: Partial<Record<DivisionMatchType, string>> = {};
  const newest: Partial<Record<DivisionMatchType, number>> = {};
  memberships.forEach((membership) => {
    if (!membership.divisionLevelId) return;
    const type = divisionLevelMatchType(levelById.get(membership.divisionLevelId));
    const updated = timestampMillisOf(membership.updatedAt);
    if (result[type] === undefined || updated > (newest[type] ?? 0)) {
      result[type] = membership.divisionLevelId;
      newest[type] = updated;
    }
  });
  return result;
}

/** The match types that have at least one level, singles first. */
export function matchTypesOfLevels(
  levels: ReadonlyArray<{ matchType?: unknown }>,
): DivisionMatchType[] {
  const present = new Set(levels.map((level) => divisionLevelMatchType(level)));
  return DIVISION_MATCH_TYPES.filter((type) => present.has(type));
}

/**
 * Milliseconds from a stored timestamp: a number, a Firestore `Timestamp`, or
 * its `{ seconds }` shape. Anything else (including a pending server
 * timestamp) is 0.
 */
function timestampMillisOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === 'function') return candidate.toMillis();
    if (typeof candidate.seconds === 'number') return candidate.seconds * 1000;
  }
  return 0;
}
