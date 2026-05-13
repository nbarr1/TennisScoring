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

export interface Division {
  id: string;
  name: string;
  inviteCode: string;
  leaderIds: string[];
  playerIds: string[];
  activeSeasonId?: string;
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
