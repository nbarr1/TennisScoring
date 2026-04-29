export type UserRole = 'player' | 'division_leader' | 'admin';

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
  rankingSummary?: {
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
  };
  createdAt: number; // Unix ms timestamp
  updatedAt: number;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  contactPreferences: ContactPreferences;
  availability?: Availability;
}
