export type UserRole = 'player' | 'division_leader' | 'admin';

export interface ContactPreferences {
  allowEmail: boolean;
  allowSMS: boolean;
  allowInApp: boolean;
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  contactPreferences: ContactPreferences;
  divisionId?: string;
  role: UserRole;
  fcmTokens: string[];
  tipsEnabled: boolean;
  ssoProvider?: 'google' | 'microsoft' | 'pingid' | 'saml';
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
}
