import type { DivisionMatchType } from './division';

export interface PlayerRanking {
  userId: string;
  displayName: string;
  divisionId: string;
  season: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: 'singles' | 'doubles';
  rank: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number; // gamesWon - gamesLost
  updatedAt: number;
}

/**
 * A doubles standings row. One row per fixed partnership, stored at
 * `divisions/{divisionId}/doublesRankings/{teamId}` — a sibling of the
 * per-player `rankings` collection, so singles and doubles standings never
 * pool together and neither prune can delete the other's documents.
 */
export interface DoublesTeamRanking {
  teamId: string;          // doublesTeamId(playerIds) — sorted member ids
  playerIds: string[];
  displayName: string;     // e.g. "Ann Smith / Bob Jones"
  divisionId: string;
  season: string;
  seasonId?: string;
  divisionLevelId?: string;
  rank: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number; // gamesWon - gamesLost
  updatedAt: number;
}

export interface HeadToHead {
  id: string;              // singles: sorted([p1Id, p2Id]).join('_'); doubles: doublesHeadToHeadId(...)
  divisionId: string;
  player1Id: string;       // holds a team id on doubles records
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  matchType?: DivisionMatchType;
}
