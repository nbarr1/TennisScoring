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

export interface HeadToHead {
  id: string;              // sorted([p1Id, p2Id]).join('_')
  divisionId: string;
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
}
