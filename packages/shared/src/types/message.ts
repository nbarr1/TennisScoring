export type ChannelType = 'division' | 'direct';

export interface Channel {
  id: string;
  type: ChannelType;
  divisionId?: string;
  participantIds: string[];
  name?: string;
  lastMessage?: {
    content: string;
    senderId: string;
    senderName: string;
    timestamp: number;
  };
  createdAt: number;
}

export interface SharedContact {
  phone?: string;
  email?: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'system' | 'contact_share';
  sharedContact?: SharedContact;
  readBy: string[];
  createdAt: number;
}

export interface MatchReport {
  matchId: string;
  divisionId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  finalScore: string;       // e.g. "6-4, 3-6, 7-5"
  durationMinutes: number;
  pdfUrl: string;
  generatedAt: number;
}
