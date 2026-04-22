import * as functions from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { computeRankings, extractMatchTotals, updateRankingWithMatchResult } from '@tennis/shared';
import type { Match, HeadToHead, PlayerRanking } from '@tennis/shared';

if (!getApps().length) initializeApp();

/**
 * Triggered whenever a match document is written.
 * When status transitions to 'completed', recalculates division rankings.
 */
export const onMatchUpdate = functions.firestore.onDocumentWritten(
  'matches/{matchId}',
  async (event) => {
    const before = event.data?.before?.data() as Match | undefined;
    const after = event.data?.after?.data() as Match | undefined;

    if (!after) return;
    if (before?.status === 'completed' || after.status !== 'completed') return;

    await recalculateRankings(after.divisionId);
  }
);

async function recalculateRankings(divisionId: string) {
  const db = getFirestore();

  const matchesSnap = await db
    .collection('matches')
    .where('divisionId', '==', divisionId)
    .where('status', '==', 'completed')
    .get();

  const matches = matchesSnap.docs.map((d) => d.data() as Match);

  // Aggregate stats per player
  const statsMap = new Map<string, {
    matchesWon: number; matchesLost: number;
    setsWon: number; setsLost: number;
    gamesWon: number; gamesLost: number;
  }>();

  const h2hAccum = new Map<string, HeadToHead>();

  for (const match of matches) {
    if (!match.winner) continue;

    const { player1Id, player2Id, liveScore, winner } = match;

    for (const pid of [player1Id, player2Id]) {
      if (!statsMap.has(pid)) {
        statsMap.set(pid, { matchesWon: 0, matchesLost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 });
      }
    }

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(liveScore.sets);

    const p1Won = winner === 'player1';
    const p1Stats = statsMap.get(player1Id)!;
    const p2Stats = statsMap.get(player2Id)!;

    if (p1Won) {
      p1Stats.matchesWon++;
      p2Stats.matchesLost++;
    } else {
      p2Stats.matchesWon++;
      p1Stats.matchesLost++;
    }
    p1Stats.setsWon += p1Sets;
    p1Stats.setsLost += p2Sets;
    p2Stats.setsWon += p2Sets;
    p2Stats.setsLost += p1Sets;
    p1Stats.gamesWon += p1Games;
    p1Stats.gamesLost += p2Games;
    p2Stats.gamesWon += p2Games;
    p2Stats.gamesLost += p1Games;

    // Head-to-head
    const h2hId = [player1Id, player2Id].sort().join('_');
    if (!h2hAccum.has(h2hId)) {
      h2hAccum.set(h2hId, {
        id: h2hId,
        divisionId,
        player1Id: [player1Id, player2Id].sort()[0],
        player2Id: [player1Id, player2Id].sort()[1],
        player1Wins: 0,
        player2Wins: 0,
      });
    }
    const h2h = h2hAccum.get(h2hId)!;
    const sortedIds = [player1Id, player2Id].sort();
    if (winner === 'player1') {
      if (player1Id === sortedIds[0]) h2h.player1Wins++;
      else h2h.player2Wins++;
    } else {
      if (player2Id === sortedIds[0]) h2h.player1Wins++;
      else h2h.player2Wins++;
    }
  }

  // Fetch display names
  const divisionSnap = await db.collection('divisions').doc(divisionId).get();
  const division = divisionSnap.data();
  const playerIds: string[] = division?.playerIds ?? [...statsMap.keys()];

  const userSnaps = await Promise.all(
    playerIds.map((id) => db.collection('users').doc(id).get())
  );
  const displayNames = new Map(userSnaps.map((s) => [s.id, s.data()?.displayName ?? s.id]));

  const rankingInputs = playerIds.map((userId) => {
    const stats = statsMap.get(userId) ?? {
      matchesWon: 0, matchesLost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0
    };
    return {
      userId,
      displayName: displayNames.get(userId) ?? userId,
      divisionId,
      season: division?.season ?? '2024',
      ...stats,
    };
  });

  const rankings = computeRankings(rankingInputs, [...h2hAccum.values()]);

  // Write rankings and h2h atomically
  const batch = db.batch();
  for (const ranking of rankings) {
    const ref = db.collection('divisions').doc(divisionId).collection('rankings').doc(ranking.userId);
    batch.set(ref, { ...ranking, updatedAt: FieldValue.serverTimestamp() });
  }
  for (const h2h of h2hAccum.values()) {
    const ref = db.collection('headToHead').doc(h2h.id);
    batch.set(ref, { ...h2h, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}

/**
 * HTTPS callable: resolve a match score conflict.
 * Division leaders call this to pick the correct score.
 */
export const resolveConflict = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { matchId, resolution } = request.data as { matchId: string; resolution: string };
  const db = getFirestore();

  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data() as Match;

  if (!match) throw new functions.https.HttpsError('not-found', 'Match not found');

  const isLeader = await checkIsLeader(request.auth.uid, match.divisionId);
  const isParticipant = request.auth.uid === match.player1Id || request.auth.uid === match.player2Id;

  if (!isLeader && !isParticipant) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }

  const resolvedScore = JSON.parse(resolution);

  await matchRef.update({
    status: 'in_progress',
    liveScore: resolvedScore,
    conflictState: {
      ...match.conflictState,
      resolvedAt: Date.now(),
      resolvedBy: isLeader ? 'leader' : 'consensus',
      resolution: resolvedScore,
    },
  });

  return { success: true };
});

/**
 * HTTPS callable: schedule conflict escalation via Cloud Tasks.
 * Called internally when a conflict is triggered.
 */
export const scheduleConflictEscalation = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { matchId } = request.data as { matchId: string };
  const db = getFirestore();

  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data() as Match;

  if (!match) throw new functions.https.HttpsError('not-found', 'Match not found');

  // Notify the division leader
  const divisionSnap = await db.collection('divisions').doc(match.divisionId).get();
  const leaderId = divisionSnap.data()?.leaderId;

  if (leaderId) {
    const leaderSnap = await db.collection('users').doc(leaderId).get();
    const leader = leaderSnap.data();
    if (leader?.fcmTokens?.length) {
      const { getMessaging } = await import('firebase-admin/messaging');
      await getMessaging().sendEachForMulticast({
        tokens: leader.fcmTokens,
        notification: {
          title: 'Score Dispute',
          body: `A score dispute in match ${matchId} needs your resolution.`,
        },
        data: { type: 'conflict', matchId },
      });
    }
  }

  await matchRef.update({
    'conflictState.leaderNotifiedAt': Date.now(),
  });

  return { success: true };
});

async function checkIsLeader(uid: string, divisionId: string): Promise<boolean> {
  const db = getFirestore();
  const divSnap = await db.collection('divisions').doc(divisionId).get();
  return divSnap.data()?.leaderId === uid;
}
