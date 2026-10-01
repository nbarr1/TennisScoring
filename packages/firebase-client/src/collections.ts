import {
  collection,
  doc,
  getDoc,
  CollectionReference,
  DocumentReference,
  query,
  where,
  orderBy,
  limit,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './config';
import type { User, PublicProfile, Match, Division, DivisionLevel, DivisionMembership, Channel, Message, MessageReport, PlayerRanking, DoublesTeamRanking, HeadToHead } from '@tennis/shared';

// Typed collection helpers
export const usersCol = () => collection(db, 'users') as CollectionReference<User>;
export const userDoc = (uid: string) => doc(db, 'users', uid) as DocumentReference<User>;

/**
 * Reads users/{uid}, resolving to null when the rules deny the read.
 *
 * A leader may read the private user doc only of players whose active division
 * is theirs, so a roster can include members whose doc is unreadable (a player
 * who belongs to several divisions and is active in another). Roster loads read
 * every member at once, and one denied read must not fail the whole load.
 */
export async function readableUserDoc(uid: string) {
  try {
    return await getDoc(userDoc(uid));
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') return null;
    throw err;
  }
}

export const profilesCol = () => collection(db, 'profiles') as CollectionReference<PublicProfile>;
export const profileDoc = (uid: string) => doc(db, 'profiles', uid) as DocumentReference<PublicProfile>;

export const divisionsCol = () => collection(db, 'divisions') as CollectionReference<Division>;
export const divisionDoc = (id: string) => doc(db, 'divisions', id) as DocumentReference<Division>;

export const rankingsCol = (divisionId: string) =>
  collection(db, 'divisions', divisionId, 'rankings') as CollectionReference<PlayerRanking>;

// Doubles standings live in a sibling of `rankings` so singles and doubles
// tables never pool together and neither recompute can prune the other's docs.
export const doublesRankingsCol = (divisionId: string) =>
  collection(db, 'divisions', divisionId, 'doublesRankings') as CollectionReference<DoublesTeamRanking>;

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

export const doublesRankingsQuery = (divisionId: string, ...extra: QueryConstraint[]) =>
  query(doublesRankingsCol(divisionId), orderBy('rank', 'asc'), ...extra);

export const divisionMembershipsQuery = (divisionId: string, seasonId: string, ...extra: QueryConstraint[]) =>
  query(divisionMembershipsCol(divisionId), where('seasonId', '==', seasonId), ...extra);

/**
 * The newest `messageLimit` messages in a channel, **newest first**. Read results
 * through `messagesFromSnapshot()`, which returns them oldest first for display.
 *
 * Ordering ascending with a limit selects the channel's *oldest* page instead, so
 * once a channel passed the limit, new messages stopped appearing.
 */
export const channelMessagesQuery = (channelId: string, messageLimit = 50) =>
  query(messagesCol(channelId), orderBy('createdAt', 'desc'), limit(messageLimit));

export const userChannelsQuery = (userId: string) =>
  query(channelsCol(), where('participantIds', 'array-contains', userId), orderBy('createdAt', 'desc'));

export const divisionMessageReportsQuery = (divisionId: string) =>
  query(
    messageReportsCol(),
    where('divisionId', '==', divisionId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
