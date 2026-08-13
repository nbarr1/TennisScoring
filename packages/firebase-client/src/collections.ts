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
import type { User, PublicProfile, Match, Division, DivisionLevel, DivisionMembership, Channel, Message, MessageReport, PlayerRanking, HeadToHead } from '@tennis/shared';

// Typed collection helpers
export const usersCol = () => collection(db, 'users') as CollectionReference<User>;
export const userDoc = (uid: string) => doc(db, 'users', uid) as DocumentReference<User>;

export const profilesCol = () => collection(db, 'profiles') as CollectionReference<PublicProfile>;
export const profileDoc = (uid: string) => doc(db, 'profiles', uid) as DocumentReference<PublicProfile>;

export const divisionsCol = () => collection(db, 'divisions') as CollectionReference<Division>;
export const divisionDoc = (id: string) => doc(db, 'divisions', id) as DocumentReference<Division>;

export const rankingsCol = (divisionId: string) =>
  collection(db, 'divisions', divisionId, 'rankings') as CollectionReference<PlayerRanking>;

export const divisionLevelsCol = (divisionId: string) =>
  collection(db, 'divisions', divisionId, 'levels') as CollectionReference<DivisionLevel>;

export const divisionLevelDoc = (divisionId: string, levelId: string) =>
  doc(db, 'divisions', divisionId, 'levels', levelId) as DocumentReference<DivisionLevel>;

export const divisionMembershipsCol = (divisionId: string) =>
  collection(db, 'divisions', divisionId, 'memberships') as CollectionReference<DivisionMembership>;

export const divisionMembershipDoc = (divisionId: string, membershipId: string) =>
  doc(db, 'divisions', divisionId, 'memberships', membershipId) as DocumentReference<DivisionMembership>;

export const matchesCol = () => collection(db, 'matches') as CollectionReference<Match>;
export const matchDoc = (id: string) => doc(db, 'matches', id) as DocumentReference<Match>;

export const channelsCol = () => collection(db, 'channels') as CollectionReference<Channel>;
export const channelDoc = (id: string) => doc(db, 'channels', id) as DocumentReference<Channel>;

export const messagesCol = (channelId: string) =>
  collection(db, 'channels', channelId, 'messages') as CollectionReference<Message>;

export const messageDoc = (channelId: string, messageId: string) =>
  doc(db, 'channels', channelId, 'messages', messageId) as DocumentReference<Message>;

export const h2hCol = () => collection(db, 'headToHead') as CollectionReference<HeadToHead>;

export const messageReportsCol = () => collection(db, 'messageReports') as CollectionReference<MessageReport>;
export const messageReportDoc = (id: string) => doc(db, 'messageReports', id) as DocumentReference<MessageReport>;

// Common query builders
export const divisionMatchesQuery = (divisionId: string, ...extra: QueryConstraint[]) =>
  query(matchesCol(), where('divisionId', '==', divisionId), orderBy('createdAt', 'desc'), ...extra);

export const divisionMatchesUnorderedQuery = (divisionId: string) =>
  query(matchesCol(), where('divisionId', '==', divisionId));

export const liveMatchesQuery = (divisionId: string) =>
  query(matchesCol(), where('divisionId', '==', divisionId), where('status', '==', 'in_progress'));

export const completedDivisionMatchesQuery = (divisionId: string, ...extra: QueryConstraint[]) =>
  query(matchesCol(), where('divisionId', '==', divisionId), where('status', '==', 'completed'), ...extra);

export const playerMatchesQuery = (playerId: string) =>
  query(matchesCol(), where('playerIds', 'array-contains', playerId), orderBy('createdAt', 'desc'));

export const rankingsQuery = (divisionId: string, ...extra: QueryConstraint[]) =>
  query(rankingsCol(divisionId), orderBy('rank', 'asc'), ...extra);

export const divisionMembershipsQuery = (divisionId: string, seasonId: string, ...extra: QueryConstraint[]) =>
  query(divisionMembershipsCol(divisionId), where('seasonId', '==', seasonId), ...extra);

export const channelMessagesQuery = (channelId: string, messageLimit = 50) =>
  query(messagesCol(channelId), orderBy('createdAt', 'asc'), limit(messageLimit));

export const userChannelsQuery = (userId: string) =>
  query(channelsCol(), where('participantIds', 'array-contains', userId), orderBy('createdAt', 'desc'));

export const divisionMessageReportsQuery = (divisionId: string) =>
  query(
    messageReportsCol(),
    where('divisionId', '==', divisionId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
