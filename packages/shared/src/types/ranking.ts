export interface PlayerRanking {
  userId: string;
  displayName: string;
  divisionId: string;
  season: string;
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

export interface Division {
  id: string;
  name: string;
  leaderId: string;
  playerIds: string[];
  season: string;
  createdAt: number;
}
