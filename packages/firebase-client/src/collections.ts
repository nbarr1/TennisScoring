import {
  collection,
  doc,
  CollectionReference,
  DocumentReference,
  query,
  where,
  orderBy,
  limit,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './config';
import type { User, Match, Division, Channel, Message, PlayerRanking, HeadToHead } from '@tennis/shared';

// Typed collection helpers
export const usersCol = () => collection(db, 'users') as CollectionReference<User>;
export const userDoc = (uid: string) => doc(db, 'users', uid) as DocumentReference<User>;

export const divisionsCol = () => collection(db, 'divisions') as CollectionReference<Division>;
export const divisionDoc = (id: string) => doc(db, 'divisions', id) as DocumentReference<Division>;

export const rankingsCol = (divisionId: string) =>
  collection(db, 'divisions', divisionId, 'rankings') as CollectionReference<PlayerRanking>;

export const matchesCol = () => collection(db, 'matches') as CollectionReference<Match>;
export const matchDoc = (id: string) => doc(db, 'matches', id) as DocumentReference<Match>;

export const channelsCol = () => collection(db, 'channels') as CollectionReference<Channel>;
export const channelDoc = (id: string) => doc(db, 'channels', id) as DocumentReference<Channel>;

export const messagesCol = (channelId: string) =>
  collection(db, 'channels', channelId, 'messages') as CollectionReference<Message>;

export const h2hCol = () => collection(db, 'headToHead') as CollectionReference<HeadToHead>;

// Common query builders
export const divisionMatchesQuery = (divisionId: string, ...extra: QueryConstraint[]) =>
  query(matchesCol(), where('divisionId', '==', divisionId), orderBy('createdAt', 'desc'), ...extra);

export const liveMatchesQuery = (divisionId: string) =>
  query(matchesCol(), where('divisionId', '==', divisionId), where('status', '==', 'in_progress'));

export const completedDivisionMatchesQuery = (divisionId: string) =>
  query(matchesCol(), where('divisionId', '==', divisionId), where('status', '==', 'completed'));

export const playerMatchesQuery = (playerId: string) =>
  query(matchesCol(), where('playerIds', 'array-contains', playerId), orderBy('createdAt', 'desc'));

export const rankingsQuery = (divisionId: string) =>
  query(rankingsCol(divisionId), orderBy('rank', 'asc'));

export const channelMessagesQuery = (channelId: string, messageLimit = 50) =>
  query(messagesCol(channelId), orderBy('createdAt', 'asc'), limit(messageLimit));

export const userChannelsQuery = (userId: string) =>
  query(channelsCol(), where('participantIds', 'array-contains', userId), orderBy('createdAt', 'desc'));
