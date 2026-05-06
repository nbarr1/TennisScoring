import * as functions from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { applyPoint, computeRankings, extractMatchTotals } from '@tennis/shared';
import type { Match, HeadToHead, ReportSubmission } from '@tennis/shared';

if (!getApps().length) initializeApp();

type RankingStats = {
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

type RecalculateRankingsOptions = {
  normalizeMatches?: boolean;
};

type RecalculateRankingsResult = {
  divisionId: string;
  completedMatchesScanned: number;
  countedMatches: number;
  skippedMissingWinner: number;
  skippedMissingScore: number;
  skippedNonDivisionMatches: number;
  guestMatchesCounted: number;
  matchesNormalized: number;
  rankingsWritten: number;
  rankingsDeleted: number;
  headToHeadsWritten: number;
  headToHeadsDeleted: number;
};

const emptyRankingStats = (): RankingStats => ({
  matchesWon: 0,
  matchesLost: 0,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
});

/**
 * Triggered on every match document write. Handles three transitions:
 *
 * 1. reportSubmission.status → 'pending_confirmation'
 *    Notify the other player that a report has been submitted for their review.
 *
 * 2. status → 'completed' (reportSubmission.status === 'confirmed')
 *    Recalculate division rankings and trigger PDF report generation.
 *
 * 3. status → 'disputed' (reportSubmission.status === 'disputed')
 *    Notify the division leader to resolve the disagreement.
 */
export const onMatchUpdate = functions.firestore.onDocumentWritten(
  'matches/{matchId}',
  async (event) => {
    const before = event.data?.before?.data() as Match | undefined;
    const after = event.data?.after?.data() as Match | undefined;

    const matchId = event.params.matchId;
    const db = getFirestore();

    // Document deleted — recalculate rankings if a completed match was removed
    if (!after) {
      if (before?.status === 'completed') {
        await recalculateRankings(before.divisionId);
      }
      return;
    }

    const prevSubmission = before?.reportSubmission;
    const curSubmission = after.reportSubmission;

    // 1. Match proposed (new doc) — notify the opponent
    if (!before && after.status === 'proposed' && !after.player2IsGuest) {
      await notifyMatchProposed(db, after, matchId);
      return;
    }

    // 2. Proposal accepted — notify the proposer
    if (before?.status === 'proposed' && after.status === 'scheduled') {
      await notifyMatchAccepted(db, after, matchId);
      return;
    }

    // 3. Proposal cancelled (declined or withdrawn) — notify the proposer
    if (before?.status === 'proposed' && after.status === 'cancelled') {
      await notifyMatchProposalCancelled(db, after, matchId);
      return;
    }

    // 4. Report submitted — notify the other player
    if (
      curSubmission?.status === 'pending_confirmation' &&
      prevSubmission?.status !== 'pending_confirmation'
    ) {
      await notifyOpponentOfSubmission(db, after, matchId, curSubmission);
      return;
    }

    // 5. Report confirmed — update rankings (PDF is handled by generateReport trigger)
    if (after.status === 'completed' && before?.status !== 'completed') {
      // CLEANUP: Remove any open/incomplete sets and persist to Firestore
      if (after.liveScore && Array.isArray(after.liveScore.sets)) {
        const cleanedSets = after.liveScore.sets.filter((set) => !!set.winner);
        if (cleanedSets.length !== after.liveScore.sets.length) {
          const db = getFirestore();
          await db.collection('matches').doc(event.params.matchId).update({
            'liveScore.sets': cleanedSets,
          });
          after.liveScore.sets = cleanedSets;
        }
      }

      await recalculateRankings(after.divisionId);
      return;
    }
    if (before?.status === 'completed' && after.status !== 'completed') {
      await recalculateRankings(before.divisionId);
      return;
    }

    if (
      before?.status === 'completed' &&
      after.status === 'completed' &&
      rankingsRelevantFieldsChanged(before, after)
    ) {
      if (before.divisionId !== after.divisionId) {
        await recalculateRankings(before.divisionId);
      }
      await recalculateRankings(after.divisionId);
      return;
    }
    // 6. Report disputed — notify division leader
    if (after.status === 'disputed' && before?.status !== 'disputed') {
      await notifyLeaderOfDispute(db, after, matchId);
      return;
    }
  },
);

function rankingsRelevantFieldsChanged(before: Match, after: Match): boolean {
  return (
    before.divisionId !== after.divisionId ||
    before.player1Id !== after.player1Id ||
    before.player2Id !== after.player2Id ||
    before.player2IsGuest !== after.player2IsGuest ||
    before.isDivisionMatch !== after.isDivisionMatch ||
    before.winner !== after.winner ||
    JSON.stringify(before.liveScore?.sets ?? []) !==
      JSON.stringify(after.liveScore?.sets ?? [])
  );
}

async function notifyMatchProposed(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
) {
  const opponentSnap = await db.collection('users').doc(match.player2Id).get();
  const opponent = opponentSnap.data();
  if (!opponent?.fcmTokens?.length) return;

  const proposerSnap = await db.collection('users').doc(match.player1Id).get();
  const proposerName = proposerSnap.data()?.displayName ?? 'A player';

  await getMessaging().sendEachForMulticast({
    tokens: opponent.fcmTokens,
    notification: {
      title: 'New Match Proposal',
      body: `${proposerName} proposed a match. Accept or decline.`,
    },
    data: { type: 'match_proposed', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}

async function notifyMatchAccepted(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
) {
  const proposerSnap = await db.collection('users').doc(match.player1Id).get();
  const proposer = proposerSnap.data();
  if (!proposer?.fcmTokens?.length) return;

  const opponentSnap = await db.collection('users').doc(match.player2Id).get();
  const opponentName = opponentSnap.data()?.displayName ?? 'Your opponent';

  await getMessaging().sendEachForMulticast({
    tokens: proposer.fcmTokens,
    notification: {
      title: 'Match Accepted',
      body: `${opponentName} accepted your match proposal.`,
    },
    data: { type: 'match_accepted', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}

async function notifyMatchProposalCancelled(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
) {
  // Notify the proposer. If the proposer themselves withdrew, the message is still informative.
  const proposerSnap = await db.collection('users').doc(match.player1Id).get();
  const proposer = proposerSnap.data();
  if (!proposer?.fcmTokens?.length) return;

  await getMessaging().sendEachForMulticast({
    tokens: proposer.fcmTokens,
    notification: {
      title: 'Match Proposal Cancelled',
      body: 'Your match proposal was cancelled.',
    },
    data: { type: 'match_proposal_cancelled', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}

async function notifyOpponentOfSubmission(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
  submission: ReportSubmission,
) {
  // The opponent is whichever player did NOT submit
  const opponentId =
    submission.submittedBy === match.player1Id
      ? match.player2Id
      : match.player1Id;

  // No notification for guest opponents
  if (!opponentId || opponentId === 'guest') return;

  const opponentSnap = await db.collection('users').doc(opponentId).get();
  const opponent = opponentSnap.data();
  if (!opponent?.fcmTokens?.length) return;

  const submitterSnap = await db
    .collection('users')
    .doc(submission.submittedBy)
    .get();
  const submitterName = submitterSnap.data()?.displayName ?? 'Your opponent';

  await getMessaging().sendEachForMulticast({
    tokens: opponent.fcmTokens,
    notification: {
      title: 'Match Report Submitted',
      body: `${submitterName} has submitted the match report. Review and confirm or dispute.`,
    },
    data: { type: 'report_submitted', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}

async function notifyLeaderOfDispute(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
) {
  const divisionSnap = await db
    .collection('divisions')
    .doc(match.divisionId)
    .get();
  const division = divisionSnap.data();
  const leaderIds = [
    ...new Set([
      ...((division?.leaderIds ?? []) as string[]),
      ...(division?.leaderId ? [division.leaderId as string] : []),
    ]),
  ];
  if (!leaderIds.length) return;

  const leaderSnaps = await Promise.all(
    leaderIds.map((leaderId) => db.collection('users').doc(leaderId).get()),
  );
  const tokens = leaderSnaps.flatMap((leaderSnap) => {
    const leader = leaderSnap.data();
    return Array.isArray(leader?.fcmTokens) ? leader.fcmTokens : [];
  });
  if (!tokens.length) return;

  await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Match Report Disputed',
      body: 'A player has disputed a match report. Your resolution is needed.',
    },
    data: { type: 'report_disputed', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });

  await db.collection('matches').doc(matchId).update({
    'reportSubmission.leaderNotifiedAt': Date.now(),
  });
}


type ScoreMatchPointInput = {
  matchId?: string;
  scorer?: 'player1' | 'player2';
};

export const scoreMatchPoint = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { matchId, scorer } = (request.data ?? {}) as ScoreMatchPointInput;
  const safeMatchId = typeof matchId === 'string' ? matchId.trim() : undefined;
  if (!safeMatchId || (scorer !== 'player1' && scorer !== 'player2')) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'matchId and scorer are required',
    );
  }

  const db = getFirestore();
  const matchRef = db.collection('matches').doc(safeMatchId);
  let response: { nextScore: Match['liveScore']; matchWinner?: 'player1' | 'player2'; tips: string[] } | null = null;

  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Match not found');
    }

    const match = matchSnap.data() as Match;
    const isParticipant =
      request.auth!.uid === match.player1Id || request.auth!.uid === match.player2Id;
    if (!isParticipant) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only match participants can score this match',
      );
    }
    if (match.status !== 'scheduled' && match.status !== 'in_progress') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only scheduled or in-progress matches can be scored',
      );
    }

    const result = applyPoint(match.liveScore, scorer, match.format);
    const updates: Partial<Match> = {
      liveScore: result.nextScore,
      undoSnapshot: {
        liveScore: match.liveScore,
        status: match.status,
        ...(match.winner !== undefined && { winner: match.winner }),
        ...(match.completedAt !== undefined && { completedAt: match.completedAt }),
      },
    };

    if (result.matchWinner) {
      updates.status = 'pending_report';
      updates.winner = result.matchWinner;
      updates.completedAt = Date.now();
    }

    tx.update(matchRef, updates);
    response = {
      nextScore: result.nextScore,
      matchWinner: result.matchWinner,
      tips: result.tips,
    };
  });

  return response;
});

export async function recalculateRankings(
  divisionId: string,
  options: RecalculateRankingsOptions = {},
): Promise<RecalculateRankingsResult> {
  const db = getFirestore();
  const result: RecalculateRankingsResult = {
    divisionId,
    completedMatchesScanned: 0,
    countedMatches: 0,
    skippedMissingWinner: 0,
    skippedMissingScore: 0,
    skippedNonDivisionMatches: 0,
    guestMatchesCounted: 0,
    matchesNormalized: 0,
    rankingsWritten: 0,
    rankingsDeleted: 0,
    headToHeadsWritten: 0,
    headToHeadsDeleted: 0,
  };

  const [divisionSnap, matchesSnap] = await Promise.all([
    db.collection('divisions').doc(divisionId).get(),
    db
      .collection('matches')
      .where('divisionId', '==', divisionId)
      .where('status', '==', 'completed')
      .get(),
  ]);
  const division = divisionSnap.data();
  const divisionPlayerIds: string[] = division?.playerIds ?? [];
  const divisionPlayerIdSet = new Set(divisionPlayerIds);
  const hasDivisionRoster = divisionPlayerIdSet.size > 0;

  const rosterUserSnaps = await Promise.all(
    divisionPlayerIds.map((id) => db.collection('users').doc(id).get()),
  );
  const rosterDisplayNames = new Map(
    rosterUserSnaps.map((s) => [s.id, (s.data()?.displayName ?? s.id).trim()]),
  );

  result.completedMatchesScanned = matchesSnap.size;

  const statsMap = new Map<string, RankingStats>();

  const h2hAccum = new Map<string, HeadToHead>();
  const writer = db.bulkWriter();

  for (const doc of matchesSnap.docs) {
    const match = doc.data() as Match;
    if (options.normalizeMatches && match.isDivisionMatch === undefined) {
      writer.update(doc.ref, { isDivisionMatch: true });
      result.matchesNormalized += 1;
    }

    if (!match.winner) {
      result.skippedMissingWinner += 1;
      continue;
    }
    if (match.isDivisionMatch === false) {
      result.skippedNonDivisionMatches += 1;
      continue;
    }
    if (!match.liveScore?.sets?.length) {
      result.skippedMissingScore += 1;
      continue;
    }

    const { player1Id, player2Id, liveScore, winner } = match;
    const isGuestMatch = match.player2IsGuest === true;

    if (!isGuestMatch && hasDivisionRoster) {
      const canonicalName = rosterDisplayNames.get(player2Id);
      const providedName = (match.player2Name ?? '').trim();
      if (canonicalName && providedName && canonicalName !== providedName) {
        result.skippedNonDivisionMatches += 1;
        continue;
      }
    }
    const player1Included =
      !hasDivisionRoster || divisionPlayerIdSet.has(player1Id);
    const player2Included =
      !isGuestMatch &&
      (!hasDivisionRoster || divisionPlayerIdSet.has(player2Id));

    if (!player1Included && !player2Included) continue;

    result.countedMatches += 1;
    if (isGuestMatch) result.guestMatchesCounted += 1;

    for (const pid of [
      ...(player1Included ? [player1Id] : []),
      ...(player2Included ? [player2Id] : []),
    ]) {
      if (!statsMap.has(pid)) statsMap.set(pid, emptyRankingStats());
    }

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(
      liveScore.sets,
    );
    const p1Won = winner === 'player1';

    if (player1Included) {
      const p1Stats = statsMap.get(player1Id)!;
      if (p1Won) p1Stats.matchesWon++;
      else p1Stats.matchesLost++;
      p1Stats.setsWon += p1Sets;
      p1Stats.setsLost += p2Sets;
      p1Stats.gamesWon += p1Games;
      p1Stats.gamesLost += p2Games;
    }

    if (player2Included) {
      const p2Stats = statsMap.get(player2Id)!;
      if (p1Won) p2Stats.matchesLost++;
      else p2Stats.matchesWon++;
      p2Stats.setsWon += p2Sets;
      p2Stats.setsLost += p1Sets;
      p2Stats.gamesWon += p2Games;
      p2Stats.gamesLost += p1Games;
    }

    if (!player1Included || !player2Included) continue;

    const [h2hPlayer1Id, h2hPlayer2Id] = [player1Id, player2Id].sort();
    const h2hId = `${h2hPlayer1Id}_${h2hPlayer2Id}`;
    if (!h2hAccum.has(h2hId)) {
      h2hAccum.set(h2hId, {
        id: h2hId,
        divisionId,
        player1Id: h2hPlayer1Id,
        player2Id: h2hPlayer2Id,
        player1Wins: 0,
        player2Wins: 0,
      });
    }
    const h2h = h2hAccum.get(h2hId)!;
    if (winner === 'player1') {
      if (player1Id === h2hPlayer1Id) h2h.player1Wins++;
      else h2h.player2Wins++;
    } else {
      if (player2Id === h2hPlayer1Id) h2h.player1Wins++;
      else h2h.player2Wins++;
    }
  }

  const playerIds = divisionPlayerIds.length
    ? divisionPlayerIds
    : [...statsMap.keys()];

  const userSnaps = await Promise.all(
    playerIds.map((id) => db.collection('users').doc(id).get()),
  );
  const displayNames = new Map(
    userSnaps.map((s) => [s.id, s.data()?.displayName ?? s.id]),
  );

  const rankingInputs = playerIds.map((userId) => ({
    userId,
    displayName: displayNames.get(userId) ?? userId,
    divisionId,
    season: division?.season ?? '2024',
    ...(statsMap.get(userId) ?? emptyRankingStats()),
  }));

  const rankings = computeRankings(rankingInputs, [...h2hAccum.values()]);

  const rankingIds = new Set(rankings.map((ranking) => ranking.userId));
  const existingRankingsSnap = await db
    .collection('divisions')
    .doc(divisionId)
    .collection('rankings')
    .get();
  for (const doc of existingRankingsSnap.docs) {
    if (!rankingIds.has(doc.id)) {
      writer.delete(doc.ref);
      result.rankingsDeleted += 1;
    }
  }

  for (const ranking of rankings) {
    const ref = db
      .collection('divisions')
      .doc(divisionId)
      .collection('rankings')
      .doc(ranking.userId);
    writer.set(ref, { ...ranking, updatedAt: FieldValue.serverTimestamp() });
    result.rankingsWritten += 1;

    const userRef = db.collection('users').doc(ranking.userId);
    writer.set(
      userRef,
      {
        rankingSummary: {
          divisionId: ranking.divisionId,
          rank: ranking.rank,
          matchesPlayed: ranking.matchesPlayed,
          matchesWon: ranking.matchesWon,
          matchesLost: ranking.matchesLost,
          setsWon: ranking.setsWon,
          setsLost: ranking.setsLost,
          gamesWon: ranking.gamesWon,
          gamesLost: ranking.gamesLost,
          gameDifferential: ranking.gameDifferential,
          updatedAt: Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  }

  const h2hIds = new Set([...h2hAccum.keys()]);
  const existingH2HSnap = await db
    .collection('headToHead')
    .where('divisionId', '==', divisionId)
    .get();
  for (const doc of existingH2HSnap.docs) {
    if (!h2hIds.has(doc.id)) {
      writer.delete(doc.ref);
      result.headToHeadsDeleted += 1;
    }
  }

  for (const h2h of h2hAccum.values()) {
    const ref = db.collection('headToHead').doc(h2h.id);
    writer.set(ref, { ...h2h, updatedAt: FieldValue.serverTimestamp() });
    result.headToHeadsWritten += 1;
  }
  await writer.close();
  return result;
}

/**
 * HTTPS callable: division leader resolves a disputed report.
 * Forces the match to 'completed' and triggers rankings + PDF.
 */
export const resolveDisputedReport = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be signed in',
    );
  }

  const { matchId } = request.data as { matchId: string };
  const db = getFirestore();

  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data() as Match;

  if (!match)
    throw new functions.https.HttpsError('not-found', 'Match not found');

  const isLeader = await checkIsLeader(request.auth.uid, match.divisionId);
  if (!isLeader) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only the division leader can resolve disputes',
    );
  }

  await matchRef.update({
    status: 'completed',
    'reportSubmission.status': 'confirmed',
    'reportSubmission.confirmedBy': request.auth.uid,
    'reportSubmission.confirmedAt': Date.now(),
  });

  return { success: true };
});

async function checkIsLeader(
  uid: string,
  divisionId: string,
): Promise<boolean> {
  const db = getFirestore();
  const divSnap = await db.collection('divisions').doc(divisionId).get();
  const data = divSnap.data();
  return (data?.leaderIds ?? []).includes(uid) || data?.leaderId === uid;
}

/**
 * HTTPS callable: manually trigger a full rankings recalculation for a division.
 * Restricted to division leaders and admins.
 */
export const recalculateDivisionRankings = functions.https.onCall(
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be signed in',
      );
    }

    const { divisionId } = request.data as { divisionId: string };
    if (!divisionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'divisionId is required',
      );
    }

    const db = getFirestore();
    const [userSnap, divSnap] = await Promise.all([
      db.collection('users').doc(request.auth.uid).get(),
      db.collection('divisions').doc(divisionId).get(),
    ]);

    const isAdmin = userSnap.data()?.role === 'admin';
    const divData = divSnap.data();
    const isLeader =
      (divData?.leaderIds ?? []).includes(request.auth.uid) ||
      divData?.leaderId === request.auth.uid;

    if (!isAdmin && !isLeader) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only division leaders can recalculate rankings',
      );
    }

    const normalizeMatches = request.data?.normalizeMatches === true;
    const result = await recalculateRankings(divisionId, { normalizeMatches });
    return { success: true, result };
  },
);

/**
 * HTTPS callable: admin-only repair for every division.
 * Rebuilds ranking and head-to-head documents from completed matches without
 * deleting match, user, division, or message source data.
 */
export const repairAllDivisionRankings = functions.https.onCall(
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be signed in',
      );
    }

    const db = getFirestore();
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (userSnap.data()?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can repair all division rankings',
      );
    }

    const normalizeMatches = request.data?.normalizeMatches === true;
    const divisionsSnap = await db.collection('divisions').get();
    const results: RecalculateRankingsResult[] = [];

    for (const divisionDoc of divisionsSnap.docs) {
      results.push(
        await recalculateRankings(divisionDoc.id, { normalizeMatches }),
      );
    }

    const totals = results.reduce(
      (acc, result) => ({
        divisionsProcessed: acc.divisionsProcessed + 1,
        completedMatchesScanned:
          acc.completedMatchesScanned + result.completedMatchesScanned,
        countedMatches: acc.countedMatches + result.countedMatches,
        guestMatchesCounted:
          acc.guestMatchesCounted + result.guestMatchesCounted,
        matchesNormalized: acc.matchesNormalized + result.matchesNormalized,
        rankingsWritten: acc.rankingsWritten + result.rankingsWritten,
        rankingsDeleted: acc.rankingsDeleted + result.rankingsDeleted,
        headToHeadsWritten:
          acc.headToHeadsWritten + result.headToHeadsWritten,
        headToHeadsDeleted:
          acc.headToHeadsDeleted + result.headToHeadsDeleted,
      }),
      {
        divisionsProcessed: 0,
        completedMatchesScanned: 0,
        countedMatches: 0,
        guestMatchesCounted: 0,
        matchesNormalized: 0,
        rankingsWritten: 0,
        rankingsDeleted: 0,
        headToHeadsWritten: 0,
        headToHeadsDeleted: 0,
      },
    );

    return { success: true, totals, results };
  },
);
