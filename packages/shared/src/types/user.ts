export type UserRole = 'player' | 'division_leader' | 'admin' | 'app_developer';

export const PRIVILEGED_ROLES: readonly UserRole[] = [
  'admin',
  'division_leader',
  'app_developer',
];

export function isPrivilegedRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (PRIVILEGED_ROLES as readonly string[]).includes(role);
}

export interface ContactPreferences {
  allowEmail: boolean;
  allowSMS: boolean;
  allowInApp: boolean;
}

export type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface AvailabilitySlot {
  day: DayOfWeek;
  from: string; // "HH:MM" 24-hour
  to: string;   // "HH:MM" 24-hour
}

export interface Availability {
  slots: AvailabilitySlot[];
  note?: string;
}

export const DAYS_OF_WEEK: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
};

export interface User {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  contactPreferences: ContactPreferences;
  availability?: Availability;
  divisionId?: string;
  role: UserRole;
  fcmTokens: string[];
  tipsEnabled: boolean;
  tutorialDone?: boolean;
  isRegistered?: boolean;
  inviteStatus?: 'none' | 'invite_sent' | 'registered';
  invitedAt?: number;
  invitedBy?: string;
  rankingSummary?: UserRankingSummary;
  createdAt: number; // Unix ms timestamp
  updatedAt: number;
}

export interface UserRankingSummary {
  divisionId: string;
  rank: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
  updatedAt: number;
}

/**
 * Publicly accessible profile data that can be shared with division members.
 * Does NOT contain PII like email, phone, or FCM tokens.
 */
export interface PublicProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  divisionId?: string;
  role: UserRole;
  tutorialDone?: boolean;
  rankingSummary?: UserRankingSummary;
  updatedAt: number;
}

/** @deprecated Use PublicProfile or User (Private) depending on context */
export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  contactPreferences: ContactPreferences;
  availability?: Availability;
}
