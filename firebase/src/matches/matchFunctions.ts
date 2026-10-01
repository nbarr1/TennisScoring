import * as functions from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  DEFAULT_FORMAT,
  EMPTY_STATS,
  applyPoint,
  computeRankings,
  computeDoublesRankings,
  currentSeasonForDate,
  extractMatchTotals,
  isPrivilegedRole,
  doublesTeamId,
  doublesHeadToHeadId,
  formatDoublesTeamName,
  sidePlayerIds,
  sideDisplayName,
  sideOfPlayer,
  isDoublesMatch,
  isAdminRole,
  opposingSide as opposingMatchSide,
  singlesHeadToHeadId,
} from '@tennis/shared';
import type {
  Match,
  HeadToHead,
  Player,
  PlayerMatchStats,
  PlayerRanking,
  ReportSubmission,
  DoublesTeamRankingInput,
} from '@tennis/shared';

import { buildDoublesMatchFields, requestsDoubles, validateDoublesCompetition } from './doublesSides';
import { sendPushToUsers } from '../notifications/push';

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
  doublesRankingsWritten: number;
  doublesRankingsDeleted: number;
  headToHeadsWritten: number;
  headToHeadsDeleted: number;
};


function validateMatchCompleteness(match: Match): Match | undefined {
  if (match.status !== 'completed') return undefined;
  if (match.winner !== 'player1' && match.winner !== 'player2') return undefined;
  if (typeof match.player1Id !== 'string' || match.player1Id.trim().length === 0) {
    return undefined;
  }
  if (typeof match.player2Id !== 'string' || match.player2Id.trim().length === 0) {
    return undefined;
  }
  if (!Array.isArray(match.playerIds)) return undefined;
  if (!Array.isArray(match.liveScore?.sets) || match.liveScore.sets.length === 0) {
    return undefined;
  }
  return match;
}

/**
 * One partnership's totals within one season and division level.
 *
 * Standings are bucketed per (team, season, level) rather than per team: a
 * partnership that returns for a second season would otherwise show all-time
 * totals stamped with whichever single season happened to win the tie-break,
 * inflating the current season and vanishing from the previous one.
 */
type DoublesTeamTotals = RankingStats & {
  teamId: string;
  seasonId: string;
  divisionLevelId?: string;
  playerIds: string[];
  displayName: string;
};

function encodedKey(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('');
}

function doublesRankingDocId(seasonId: string, teamId: string, divisionLevelId?: string): string {
  return encodedKey([seasonId, divisionLevelId ?? '', teamId]);
}

/** One player's singles totals within one season and division level. */
type SinglesTotals = RankingStats & {
  userId: string;
  seasonId: string;
  divisionLevelId?: string;
};

/**
 * Singles standings doc id, one per player per season and level. Opaque, like
 * the doubles ids: readers must use the seasonId/divisionLevelId/userId fields.
 */
function singlesRankingDocId(seasonId: string, userId: string, divisionLevelId?: string): string {
  return encodedKey([seasonId, divisionLevelId ?? '', userId]);
}

function cloneStats(stats: Match['stats']): Match['stats'] {
  return {
    player1: { ...EMPTY_STATS, ...stats.player1 },
    player2: { ...EMPTY_STATS, ...stats.player2 },
  };
}

function oppositePlayer(player: Player): Player {
  return player === 'player1' ? 'player2' : 'player1';
}

function canWinGameOnNextPoint(match: Match, player: Player): boolean {
  const score = match.liveScore;
  if (score.isTiebreak) return false;
  const game = score.currentGame;
  const mine = game[player];
  const theirs = game[oppositePlayer(player)];
  return mine === 'Ad' || (mine === '40' && theirs !== '40' && theirs !== 'Ad');
}

type PointAttribution = 'ace' | 'winner' | 'opponent_error';

function applyBasicPointStats(match: Match, scorer: Player, pointAttribution?: PointAttribution): Match['stats'] {
  const stats = cloneStats(match.stats);
  const server = match.liveScore.server;
  const receiver = oppositePlayer(server);
  const serverStats = stats[server] as PlayerMatchStats;
  const receiverStats = stats[receiver] as PlayerMatchStats;
  const isBreakPoint = canWinGameOnNextPoint(match, receiver);

  serverStats.servicePointsTotal += 1;
  receiverStats.receivingPointsTotal += 1;

  if (scorer === server) {
    serverStats.servicePointsWon += 1;
  } else {
    receiverStats.receivingPointsWon += 1;
  }

  if (isBreakPoint) {
    serverStats.breakPointsFaced += 1;
    if (scorer === receiver) {
      receiverStats.breakPointsWon += 1;
    }
  }

  if (match.advancedStatsEnabled) {
    const scorerStats = stats[scorer] as PlayerMatchStats;
    const opponentStats = stats[oppositePlayer(scorer)] as PlayerMatchStats;
    // Only the server can hit an ace. The point still counts if a client
    // attributes one to the receiver; the impossible stat is just not recorded.
    if (pointAttribution === 'ace' && scorer === server) {
      scorerStats.aces += 1;
    } else if (pointAttribution === 'winner') {
      scorerStats.winners += 1;
    } else if (pointAttribution === 'opponent_error') {
      opponentStats.unforcedErrors += 1;
    }
  }

  return stats;
}

function stampSetTiming(match: Match, nextScore: Match['liveScore'], now: number): Match['liveScore'] {
  const timedScore = JSON.parse(JSON.stringify(nextScore)) as Match['liveScore'];
  const startedAt = match.currentSetStartedAt ?? match.startedAt ?? now;
  const currentSet = timedScore.sets[match.liveScore.currentSet];
  if (currentSet?.winner && currentSet.completedAt === undefined) {
    currentSet.startedAt = currentSet.startedAt ?? match.liveScore.sets[match.liveScore.currentSet]?.startedAt ?? startedAt;
    currentSet.completedAt = now;
    currentSet.durationMs = Math.max(0, now - currentSet.startedAt);
  }
  const nextSet = timedScore.sets[timedScore.currentSet];
  if (!nextSet?.winner && nextSet?.startedAt === undefined) {
    nextSet.startedAt = now;
  }
  return timedScore;
}

const emptyRankingStats = (): RankingStats => ({
  matchesWon: 0,
  matchesLost: 0,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
});

/**
 * Triggered on every match document write. Two independent jobs:
 *
 * - Notifications: proposals, acceptances, cancellations, report submissions
 *   (the other side reviews them), and disputes (the division leaders resolve
 *   them). At most one per write.
 * - Standings: recalculated whenever a completed result appears, stops being
 *   completed, or changes a field that affects rankings. The PDF report is
 *   handled by the generateMatchReport trigger.
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

    // Notifications and standings are independent: one write can need both
    // (linking a completed guest result reopens it for confirmation, which both
    // notifies the opponent and takes the result out of the standings), so a
    // notification must never short-circuit the recalculation below. A failed
    // send is logged rather than thrown for the same reason.
    try {
      if (!before && after.status === 'proposed' && !after.player2IsGuest) {
        // 1. Match proposed (new doc) — notify the opponent
        await notifyMatchProposed(db, after, matchId);
      } else if (before?.status === 'proposed' && after.status === 'scheduled') {
        // 2. Proposal accepted — notify the proposer
        await notifyMatchAccepted(db, after, matchId);
      } else if (before?.status === 'proposed' && after.status === 'cancelled') {
        // 3. Proposal cancelled (declined or withdrawn) — notify the proposer
        await notifyMatchProposalCancelled(db, after, matchId);
      } else if (
        curSubmission?.status === 'pending_confirmation' &&
        prevSubmission?.status !== 'pending_confirmation'
      ) {
        // 4. Report submitted — notify the other side
        await notifyOpponentOfSubmission(db, after, matchId, curSubmission);
      } else if (after.status === 'disputed' && before?.status !== 'disputed') {
        // 5. Report disputed — notify the division leaders
        await notifyLeaderOfDispute(db, after, matchId);
      }
    } catch (error) {
      functions.logger.error('onMatchUpdate notification failed', {
        matchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 6. Standings — recomputed whenever a completed result appears, leaves, or changes.
    if (after.status === 'completed' && before?.status !== 'completed') {
      // CLEANUP: Remove any open/incomplete sets and persist to Firestore
      if (after.liveScore && Array.isArray(after.liveScore.sets)) {
        const cleanedSets = after.liveScore.sets.filter((set) => !!set.winner);
        if (cleanedSets.length !== after.liveScore.sets.length) {
          await db.collection('matches').doc(matchId).update({
            'liveScore.sets': cleanedSets,
          });
          after.liveScore.sets = cleanedSets;
        }
      }

      await recalculateRankings(after.divisionId);
    } else if (before?.status === 'completed' && after.status !== 'completed') {
      await recalculateRankings(before.divisionId);
    } else if (
      before?.status === 'completed' &&
      after.status === 'completed' &&
      rankingsRelevantFieldsChanged(before, after)
    ) {
      if (before.divisionId !== after.divisionId) {
        await recalculateRankings(before.divisionId);
      }
      await recalculateRankings(after.divisionId);
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
    before.matchType !== after.matchType ||
    JSON.stringify(before.side1 ?? null) !== JSON.stringify(after.side1 ?? null) ||
    JSON.stringify(before.side2 ?? null) !== JSON.stringify(after.side2 ?? null) ||
    before.winner !== after.winner ||
    JSON.stringify(before.liveScore?.sets ?? []) !==
      JSON.stringify(after.liveScore?.sets ?? [])
  );
}

/** The display name to use for a side in notification copy. */
async function notificationNameForSide(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  side: Player,
  fallback: string,
): Promise<string> {
  const sideName = sideDisplayName(match, side).trim();
  if (sideName) return sideName;
  const ids = sidePlayerIds(match, side);
  if (ids.length === 0) return fallback;
  const snaps = await Promise.all(ids.map((id) => db.collection('users').doc(id).get()));
  const names = snaps
    .map((snap) => (snap.data()?.displayName as string | undefined)?.trim())
    .filter((name): name is string => !!name);
  return names.length > 0 ? formatDoublesTeamName(names) : fallback;
}

async function notifyMatchProposed(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
) {
  const proposerName = await notificationNameForSide(db, match, 'player1', 'A player');

  await sendPushToUsers(db, sidePlayerIds(match, 'player2'), {
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
  const opponentName = await notificationNameForSide(db, match, 'player2', 'Your opponent');

  await sendPushToUsers(db, sidePlayerIds(match, 'player1'), {
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
  // Notify the proposing side. If they withdrew themselves, the message is still informative.
  await sendPushToUsers(db, sidePlayerIds(match, 'player1'), {
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
  // The opposing side reviews the report — never the submitter or their partner.
  const submitterSide = sideOfPlayer(match, submission.submittedBy) ?? 'player1';
  const opponentSide = opposingMatchSide(submitterSide);

  const submitterSnap = await db
    .collection('users')
    .doc(submission.submittedBy)
    .get();
  const submitterName = submitterSnap.data()?.displayName ?? 'Your opponent';

  await sendPushToUsers(db, sidePlayerIds(match, opponentSide), {
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

  await sendPushToUsers(db, leaderIds, {
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
  pointAttribution?: PointAttribution;
};

export const scoreMatchPoint = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { matchId, scorer, pointAttribution } = (request.data ?? {}) as ScoreMatchPointInput;
  const safeMatchId = typeof matchId === 'string' ? matchId.trim() : undefined;
  const hasValidAttribution =
    pointAttribution === undefined ||
    pointAttribution === 'ace' ||
    pointAttribution === 'winner' ||
    pointAttribution === 'opponent_error';
  if (!safeMatchId || (scorer !== 'player1' && scorer !== 'player2') || !hasValidAttribution) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'matchId, scorer, and valid point attribution are required',
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
    // Any player on either side may score. Checking only player1Id/player2Id
    // shut out the second partner on each doubles side. sideOfPlayer reads the
    // side rosters, which only the Admin SDK writes (clients cannot set
    // side1/side2), and falls back to player1Id/player2Id for singles, so a
    // singles match admits exactly the same two players as before.
    const isParticipant = sideOfPlayer(match, request.auth!.uid) !== undefined;
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
    const now = Date.now();
    const nextStats = applyBasicPointStats(match, scorer, pointAttribution);
    const nextScore = result.setCompleted
      ? stampSetTiming(match, result.nextScore, now)
      : result.nextScore;
    const updates: Partial<Match> = {
      liveScore: nextScore,
      stats: nextStats,
      undoSnapshot: {
        liveScore: match.liveScore,
        status: match.status,
        stats: match.stats,
        ...(match.winner !== undefined && { winner: match.winner }),
        ...(match.completedAt !== undefined && { completedAt: match.completedAt }),
        ...(match.currentSetStartedAt !== undefined && { currentSetStartedAt: match.currentSetStartedAt }),
        ...(match.matchDurationMs !== undefined && { matchDurationMs: match.matchDurationMs }),
      },
    };

    if (result.setCompleted) {
      updates.currentSetStartedAt = result.matchWinner ? FieldValue.delete() as never : now;
    }

    if (result.matchWinner) {
      updates.status = 'pending_report';
      updates.winner = result.matchWinner;
      updates.completedAt = now;
      updates.currentSetStartedAt = FieldValue.delete() as never;
      updates.matchDurationMs = Math.max(0, now - (match.startedAt ?? now));
    }

    tx.update(matchRef, updates);
    response = {
      nextScore,
      matchWinner: result.matchWinner,
      tips: result.tips,
    };
  });

  return response;
});

/**
 * Folds one completed doubles match into the per-team totals and the shared
 * head-to-head map.
 *
 * Both partners' results land on a single row keyed by `doublesTeamId`, so the
 * same pairing accumulates across a season without any team registration step.
 * Returns false when the match should not count (a member outside the roster,
 * or a side that does not resolve to a distinct team).
 */
function accumulateDoublesMatch(
  match: Match,
  ctx: {
    divisionId: string;
    hasDivisionRoster: boolean;
    divisionPlayerIdSet: Set<string>;
    rosterDisplayNames: Map<string, string>;
    activeSeasonId: string;
    teamTotals: Map<string, DoublesTeamTotals>;
    h2hAccum: Map<string, HeadToHead>;
  },
): boolean {
  // Matches predating season tagging fall into the division's active season.
  const seasonId = match.seasonId?.trim() || ctx.activeSeasonId;
  const side1Ids = sidePlayerIds(match, 'player1');
  const side2Ids = sidePlayerIds(match, 'player2');

  // Both partnerships must be fully inside the division: a team is ranked as a
  // unit, so crediting a pair with one outside member would distort the table.
  if (ctx.hasDivisionRoster) {
    const everyoneInDivision = [...side1Ids, ...side2Ids].every((id) =>
      ctx.divisionPlayerIdSet.has(id),
    );
    if (!everyoneInDivision) return false;
  }

  const team1Id = doublesTeamId(side1Ids);
  const team2Id = doublesTeamId(side2Ids);
  if (!team1Id || !team2Id || team1Id === team2Id) return false;

  const nameFor = (ids: string[], side: Player) => {
    const rosterNames = ids.map((id) => ctx.rosterDisplayNames.get(id)).filter(Boolean) as string[];
    if (rosterNames.length === ids.length) return formatDoublesTeamName(rosterNames);
    return sideDisplayName(match, side) || formatDoublesTeamName(ids);
  };

  const ensureTeam = (teamId: string, ids: string[], side: Player) => {
    const key = doublesRankingDocId(seasonId, teamId, match.divisionLevelId);
    const existing = ctx.teamTotals.get(key);
    if (existing) return existing;
    const created: DoublesTeamTotals = {
      ...emptyRankingStats(),
      teamId,
      seasonId,
      ...(match.divisionLevelId ? { divisionLevelId: match.divisionLevelId } : {}),
      playerIds: ids,
      displayName: nameFor(ids, side),
    };
    ctx.teamTotals.set(key, created);
    return created;
  };

  const team1 = ensureTeam(team1Id, side1Ids, 'player1');
  const team2 = ensureTeam(team2Id, side2Ids, 'player2');

  const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(match.liveScore.sets);
  const team1Won = match.winner === 'player1';

  if (team1Won) team1.matchesWon++;
  else team1.matchesLost++;
  team1.setsWon += p1Sets;
  team1.setsLost += p2Sets;
  team1.gamesWon += p1Games;
  team1.gamesLost += p2Games;

  if (team1Won) team2.matchesLost++;
  else team2.matchesWon++;
  team2.setsWon += p2Sets;
  team2.setsLost += p1Sets;
  team2.gamesWon += p2Games;
  team2.gamesLost += p1Games;

  const h2hId = doublesHeadToHeadId(
    team1Id, team2Id, seasonId, match.divisionLevelId, ctx.divisionId,
  );
  const [h2hFirstId, h2hSecondId] = [team1Id, team2Id].sort();
  if (!ctx.h2hAccum.has(h2hId)) {
    ctx.h2hAccum.set(h2hId, {
      id: h2hId,
      divisionId: ctx.divisionId,
      player1Id: h2hFirstId,
      player2Id: h2hSecondId,
      player1Wins: 0,
      player2Wins: 0,
      matchType: 'doubles',
      seasonId,
      ...(match.divisionLevelId ? { divisionLevelId: match.divisionLevelId } : {}),
    });
  }
  const h2h = ctx.h2hAccum.get(h2hId)!;
  const winningTeamId = team1Won ? team1Id : team2Id;
  if (winningTeamId === h2hFirstId) h2h.player1Wins++;
  else h2h.player2Wins++;

  return true;
}

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
    doublesRankingsWritten: 0,
    doublesRankingsDeleted: 0,
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
  const baseDivisionPlayerIds: string[] = Array.isArray(division?.playerIds)
    ? division.playerIds.filter(
        (id: unknown): id is string =>
          typeof id === 'string' && id.trim().length > 0,
      )
    : [];
  const divisionLeaderIds: string[] = Array.isArray(division?.leaderIds)
    ? division.leaderIds.filter(
        (id: unknown): id is string =>
          typeof id === 'string' && id.trim().length > 0,
      )
    : [];
  const divisionProfileSnap = await db
    .collection('users')
    .where('divisionId', '==', divisionId)
    .get();
  const linkedDivisionMatchPlayerIds = new Set<string>();
  matchesSnap.docs.forEach((doc) => {
    const match = validateMatchCompleteness(doc.data() as Match);
    if (match === undefined || match.isDivisionMatch === false) return;
    const ids = Array.isArray(match.playerIds) ? match.playerIds : [];
    ids.forEach((id) => {
      if (typeof id === 'string' && id.trim().length > 0 && id !== 'guest') {
        linkedDivisionMatchPlayerIds.add(id);
      }
    });
  });
  const divisionPlayerIds = Array.from(
    new Set([
      ...baseDivisionPlayerIds,
      ...divisionLeaderIds,
      ...divisionProfileSnap.docs.map((doc) => doc.id),
      ...linkedDivisionMatchPlayerIds,
    ]),
  );
  const divisionPlayerIdSet = new Set(divisionPlayerIds);
  const hasDivisionRoster = divisionPlayerIdSet.size > 0;

  const rosterUserSnaps = await Promise.all(
    divisionPlayerIds.map((id) => db.collection('users').doc(id).get()),
  );
  const rosterDisplayNames = new Map(
    rosterUserSnaps.map((s) => [s.id, (s.data()?.displayName ?? s.id).trim()]),
  );

  result.completedMatchesScanned = matchesSnap.size;

  const activeSeasonId = typeof division?.activeSeasonId === 'string' && division.activeSeasonId.trim()
    ? division.activeSeasonId
    : currentSeasonForDate().id;

  // Singles totals accumulate per player within one season and division level,
  // the same buckets as doubles: pooling every season into one row inflated the
  // current table with past results and left the dashboards, which always ask
  // for one season, with nothing to read.
  const singlesTotals = new Map<string, SinglesTotals>();
  // Doubles totals accumulate per fixed partnership, keyed by doublesTeamId.
  const doublesTeamTotals = new Map<string, DoublesTeamTotals>();

  // Singles and doubles head-to-head records share one map (and one collection)
  // so the stale-record prune below stays correct for both.
  const h2hAccum = new Map<string, HeadToHead>();
  const writer = db.bulkWriter();

  for (const doc of matchesSnap.docs) {
    const rawMatch = doc.data() as Match;
    if (options.normalizeMatches && rawMatch.isDivisionMatch === undefined) {
      writer.update(doc.ref, { isDivisionMatch: true });
      result.matchesNormalized += 1;
    }

    if (rawMatch.isDivisionMatch === false) {
      result.skippedNonDivisionMatches += 1;
      continue;
    }

    const match = validateMatchCompleteness(rawMatch);
    if (match === undefined) {
      if (!rawMatch.winner) {
        result.skippedMissingWinner += 1;
      } else {
        result.skippedMissingScore += 1;
      }
      continue;
    }

    if (isDoublesMatch(match)) {
      const counted = accumulateDoublesMatch(match, {
        divisionId,
        hasDivisionRoster,
        divisionPlayerIdSet,
        rosterDisplayNames,
        activeSeasonId,
        teamTotals: doublesTeamTotals,
        h2hAccum,
      });
      if (counted) result.countedMatches += 1;
      else result.skippedNonDivisionMatches += 1;
      continue;
    }

    // Player ids are authoritative. Results used to be dropped whenever the
    // name stamped on the match differed from the player's current display
    // name, so renaming an account (or deleting it, which renames it to
    // "Deleted User") silently erased their matches from both players' rows.
    const { player1Id, player2Id, liveScore, winner } = match;
    const isGuestMatch = match.player2IsGuest === true;
    const seasonId = match.seasonId?.trim() || activeSeasonId;
    const divisionLevelId = match.divisionLevelId?.trim() || undefined;

    const player1Included =
      !hasDivisionRoster || divisionPlayerIdSet.has(player1Id);
    const player2Included =
      !isGuestMatch &&
      (!hasDivisionRoster || divisionPlayerIdSet.has(player2Id));

    if (!player1Included && !player2Included) continue;

    result.countedMatches += 1;
    if (isGuestMatch) result.guestMatchesCounted += 1;

    const totalsFor = (userId: string): SinglesTotals => {
      const key = singlesRankingDocId(seasonId, userId, divisionLevelId);
      const existing = singlesTotals.get(key);
      if (existing) return existing;
      const created: SinglesTotals = {
        ...emptyRankingStats(),
        userId,
        seasonId,
        ...(divisionLevelId ? { divisionLevelId } : {}),
      };
      singlesTotals.set(key, created);
      return created;
    };

    const { p1Sets, p2Sets, p1Games, p2Games } = extractMatchTotals(
      liveScore.sets,
    );
    const p1Won = winner === 'player1';

    if (player1Included) {
      const p1Stats = totalsFor(player1Id);
      if (p1Won) p1Stats.matchesWon++;
      else p1Stats.matchesLost++;
      p1Stats.setsWon += p1Sets;
      p1Stats.setsLost += p2Sets;
      p1Stats.gamesWon += p1Games;
      p1Stats.gamesLost += p2Games;
    }

    if (player2Included) {
      const p2Stats = totalsFor(player2Id);
      if (p1Won) p2Stats.matchesLost++;
      else p2Stats.matchesWon++;
      p2Stats.setsWon += p2Sets;
      p2Stats.setsLost += p1Sets;
      p2Stats.gamesWon += p2Games;
      p2Stats.gamesLost += p1Games;
    }

    if (!player1Included || !player2Included) continue;

    const h2hId = singlesHeadToHeadId(player1Id, player2Id, seasonId, divisionLevelId, divisionId);
    const [h2hPlayer1Id, h2hPlayer2Id] = [player1Id, player2Id].sort();
    if (!h2hAccum.has(h2hId)) {
      h2hAccum.set(h2hId, {
        id: h2hId,
        divisionId,
        player1Id: h2hPlayer1Id,
        player2Id: h2hPlayer2Id,
        player1Wins: 0,
        player2Wins: 0,
        matchType: 'singles',
        seasonId,
        ...(divisionLevelId ? { divisionLevelId } : {}),
      });
    }
    const h2h = h2hAccum.get(h2hId)!;
    const winnerId = p1Won ? player1Id : player2Id;
    if (winnerId === h2hPlayer1Id) h2h.player1Wins++;
    else h2h.player2Wins++;
  }

  // Optimization: Use a cache to avoid redundant Firestore reads for user documents
  const userCache = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  rosterUserSnaps.forEach((s) => userCache.set(s.id, s));
  const rankedUserIds = [...new Set([...singlesTotals.values()].map((totals) => totals.userId))];
  await Promise.all(
    rankedUserIds
      .filter((id) => !userCache.has(id))
      .map(async (id) => userCache.set(id, await db.collection('users').doc(id).get())),
  );
  const displayNameFor = (userId: string) =>
    (userCache.get(userId)?.data()?.displayName ?? userId).trim();

  const singlesByBucket = new Map<string, SinglesTotals[]>();
  for (const totals of singlesTotals.values()) {
    const key = encodedKey([totals.seasonId, totals.divisionLevelId ?? '']);
    const bucket = singlesByBucket.get(key);
    if (bucket) bucket.push(totals);
    else singlesByBucket.set(key, [totals]);
  }

  const singlesH2Hs = [...h2hAccum.values()].filter((h2h) => h2h.matchType === 'singles');
  const singlesRankingDocIds = new Set<string>();
  // The row each player's rankingSummary is taken from: their busiest level in
  // the division's active season.
  const summaryRows = new Map<string, PlayerRanking>();

  for (const bucketTotals of singlesByBucket.values()) {
    const { seasonId, divisionLevelId } = bucketTotals[0];
    const inputs = bucketTotals.map((totals) => ({
      userId: totals.userId,
      displayName: displayNameFor(totals.userId),
      divisionId,
      season: seasonId,
      matchesWon: totals.matchesWon,
      matchesLost: totals.matchesLost,
      setsWon: totals.setsWon,
      setsLost: totals.setsLost,
      gamesWon: totals.gamesWon,
      gamesLost: totals.gamesLost,
    }));
    const bucketH2Hs = singlesH2Hs.filter((h2h) =>
      h2h.seasonId === seasonId && h2h.divisionLevelId === divisionLevelId);

    for (const ranking of computeRankings(inputs, bucketH2Hs)) {
      const row: PlayerRanking = {
        ...ranking,
        seasonId,
        ...(divisionLevelId ? { divisionLevelId } : {}),
        matchType: 'singles',
      };
      const docId = singlesRankingDocId(seasonId, ranking.userId, divisionLevelId);
      singlesRankingDocIds.add(docId);
      writer.set(
        db.collection('divisions').doc(divisionId).collection('rankings').doc(docId),
        { ...row, updatedAt: FieldValue.serverTimestamp() },
      );
      result.rankingsWritten += 1;

      if (seasonId === activeSeasonId) {
        const current = summaryRows.get(ranking.userId);
        if (!current || row.matchesPlayed > current.matchesPlayed) {
          summaryRows.set(ranking.userId, row);
        }
      }
    }
  }

  const existingRankingsSnap = await db
    .collection('divisions')
    .doc(divisionId)
    .collection('rankings')
    .get();
  for (const doc of existingRankingsSnap.docs) {
    if (!singlesRankingDocIds.has(doc.id)) {
      writer.delete(doc.ref);
      result.rankingsDeleted += 1;
    }
  }

  // Only the denormalized summary is written back to users/{uid}. This pass
  // used to also write divisionId and delete mergedIntoUserId on every ranked
  // player, which re-attached removed players, flipped multi-division players'
  // active division to whichever division last confirmed a match, and revived
  // placeholders already merged into real accounts. A player active in another
  // division keeps that division's summary.
  for (const userId of new Set([...summaryRows.keys(), ...rankedUserIds, ...divisionPlayerIds])) {
    const userData = userCache.get(userId)?.data();
    if (!userData) continue;
    const activeDivision = userData.divisionId;
    if (activeDivision && activeDivision !== divisionId) continue;
    const row = summaryRows.get(userId);
    const userRef = db.collection('users').doc(userId);
    if (row) {
      writer.set(
        userRef,
        {
          rankingSummary: {
            divisionId,
            seasonId: row.seasonId,
            ...(row.divisionLevelId ? { divisionLevelId: row.divisionLevelId } : {}),
            rank: row.rank,
            matchesPlayed: row.matchesPlayed,
            matchesWon: row.matchesWon,
            matchesLost: row.matchesLost,
            setsWon: row.setsWon,
            setsLost: row.setsLost,
            gamesWon: row.gamesWon,
            gamesLost: row.gamesLost,
            gameDifferential: row.gameDifferential,
            updatedAt: Date.now(),
          },
        },
        { merge: true },
      );
    } else if (userData.rankingSummary?.divisionId === divisionId) {
      // No results this season: drop last season's numbers rather than show them.
      writer.update(userRef, { rankingSummary: FieldValue.delete() });
    }
  }

  // Doubles standings: one row per fixed partnership, in a sibling collection
  // so the singles prune above can never delete a team row and vice versa.
  const totalsByBucket = new Map<string, DoublesTeamTotals[]>();
  for (const totals of doublesTeamTotals.values()) {
    const key = encodedKey([totals.seasonId, totals.divisionLevelId ?? '']);
    const bucket = totalsByBucket.get(key);
    if (bucket) bucket.push(totals);
    else totalsByBucket.set(key, [totals]);
  }

  const doublesH2Hs = [...h2hAccum.values()];
  const doublesRankingDocIds = new Set<string>();

  for (const bucketTotals of totalsByBucket.values()) {
    const { seasonId, divisionLevelId } = bucketTotals[0];
    const doublesInputs: DoublesTeamRankingInput[] = bucketTotals.map((totals) => {
      return {
        teamId: totals.teamId,
        playerIds: totals.playerIds,
        displayName: totals.displayName,
        divisionId,
        season: seasonId,
        seasonId,
        ...(divisionLevelId ? { divisionLevelId } : {}),
        matchesWon: totals.matchesWon,
        matchesLost: totals.matchesLost,
        setsWon: totals.setsWon,
        setsLost: totals.setsLost,
        gamesWon: totals.gamesWon,
        gamesLost: totals.gamesLost,
      };
    });

    const bucketH2Hs = doublesH2Hs.filter((h2h) =>
      h2h.matchType === 'doubles' && h2h.seasonId === seasonId &&
      h2h.divisionLevelId === divisionLevelId);
    for (const ranking of computeDoublesRankings(doublesInputs, bucketH2Hs)) {
      const docId = doublesRankingDocId(seasonId, ranking.teamId, divisionLevelId);
      doublesRankingDocIds.add(docId);
      const ref = db
        .collection('divisions')
        .doc(divisionId)
        .collection('doublesRankings')
        .doc(docId);
      writer.set(ref, { ...ranking, updatedAt: FieldValue.serverTimestamp() });
      result.doublesRankingsWritten += 1;
    }
  }

  const existingDoublesSnap = await db
    .collection('divisions')
    .doc(divisionId)
    .collection('doublesRankings')
    .get();
  for (const doc of existingDoublesSnap.docs) {
    if (!doublesRankingDocIds.has(doc.id)) {
      writer.delete(doc.ref);
      result.doublesRankingsDeleted += 1;
    }
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


type RecordHistoricMatchInput = {
  player1Id?: string;
  player2Id?: string;
  player1Name?: string;
  player2Name?: string;
  player2IsGuest?: boolean;
  divisionId?: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  side1PlayerIds?: unknown;
  side2PlayerIds?: unknown;
  sets?: { p1?: number; p2?: number }[];
  isDivisionMatch?: boolean;
};

type RecordMatchOnBehalfInput = {
  divisionId?: string;
  seasonId?: string;
  divisionLevelId?: string;
  matchType?: Match['matchType'];
  player1Id?: string;
  player2Id?: string;
  side1PlayerIds?: unknown;
  side2PlayerIds?: unknown;
  sets?: { p1?: number; p2?: number }[];
  isDivisionMatch?: boolean;
  notifyPlayers?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appBaseUrl(): string {
  const configuredUrl = process.env.APP_BASE_URL?.trim();
  if (!configuredUrl) {
    if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV !== 'production') {
      return 'http://localhost:3000';
    }
    throw new functions.https.HttpsError('failed-precondition', 'APP_BASE_URL must be configured in production.');
  }
  if (process.env.NODE_ENV === 'production' && !configuredUrl.startsWith('https://')) {
    throw new functions.https.HttpsError('failed-precondition', 'APP_BASE_URL must use HTTPS in production.');
  }
  return configuredUrl;
}

function matchLinkForId(matchId: string): string {
  return `${appBaseUrl().replace(/\/$/, '')}/matches/${encodeURIComponent(matchId)}`;
}

function buildManualCompletedScore(sets: { p1: number; p2: number }[]): {
  score: Match['liveScore'];
  winner: Player;
} {
  if (!sets.length) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'At least one set is required',
    );
  }

  let p1Sets = 0;
  let p2Sets = 0;
  const builtSets: Match['liveScore']['sets'] = sets.map((set, index) => {
    if (
      !Number.isInteger(set.p1) ||
      !Number.isInteger(set.p2) ||
      set.p1 < 0 ||
      set.p2 < 0 ||
      set.p1 === set.p2
    ) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Each set must have non-negative game counts and a clear winner',
      );
    }
    const winner: Player = set.p1 > set.p2 ? 'player1' : 'player2';
    if (winner === 'player1') p1Sets += 1;
    else p2Sets += 1;
    return {
      setNumber: index,
      player1Games: set.p1,
      player2Games: set.p2,
      winner,
    };
  });

  if (p1Sets === p2Sets) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The match must have a clear winner',
    );
  }

  return {
    winner: p1Sets > p2Sets ? 'player1' : 'player2',
    score: {
      sets: builtSets,
      currentSet: sets.length - 1,
      currentGame: { player1: '0', player2: '0' },
      isTiebreak: false,
      server: 'player1',
      serviceSide: 'deuce',
      player1SetsWon: p1Sets,
      player2SetsWon: p2Sets,
    },
  };
}

async function notifyPlayersMatchRecorded(
  db: ReturnType<typeof getFirestore>,
  match: Match,
  matchId: string,
  recorderName: string,
): Promise<void> {
  // Every player on both sides — in doubles the two partners are neither
  // player1Id nor player2Id and would otherwise never be told.
  const recipientIds = [
    ...sidePlayerIds(match, 'player1'),
    ...sidePlayerIds(match, 'player2'),
  ].filter((id) => id && id !== 'guest');
  const userSnaps = await Promise.all(
    recipientIds.map((id) => db.collection('users').doc(id).get()),
  );
  const playerNames = `${match.player1Name ?? 'Player 1'} vs ${match.player2Name ?? 'Player 2'}`;

  await sendPushToUsers(db, recipientIds, {
    notification: {
      title: 'Match Recorded',
      body: `${recorderName} recorded ${playerNames} on your behalf.`,
    },
    data: { type: 'match_recorded_on_behalf', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });

  const link = matchLinkForId(matchId);
  const htmlLink = escapeHtml(link);
  const htmlRecorder = escapeHtml(recorderName);
  const htmlPlayers = escapeHtml(playerNames);

  await Promise.all(
    userSnaps.map(async (snap) => {
      const user = snap.data();
      if (!user) return;

      const email = typeof user.email === 'string' ? user.email.trim() : '';
      const allowEmail = user.contactPreferences?.allowEmail !== false;
      if (email && allowEmail) {
        await db.collection('mail').add({
          to: [email],
          message: {
            subject: 'A tennis match was recorded for you',
            text: `${recorderName} recorded ${playerNames} on your behalf. View the match: ${link}`,
            html: `<p>${htmlRecorder} recorded <strong>${htmlPlayers}</strong> on your behalf.</p><p><a href="${htmlLink}">View the match</a></p>`,
          },
          metadata: {
            type: 'match_recorded_on_behalf',
            matchId,
            userId: snap.id,
          },
        });
      }
    }),
  );
}

/**
 * HTTPS callable: regular players can record their own historic matches.
 * Guest matches are auto-confirmed; registered-opponent matches require the
 * opponent to confirm before standings update.
 */
export const recordHistoricMatch = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { divisionId, seasonId, divisionLevelId, matchType, player1Id, player2Id, player1Name, player2Name, player2IsGuest, side1PlayerIds, side2PlayerIds, sets, isDivisionMatch } =
    (request.data ?? {}) as RecordHistoricMatchInput;
  const safeDivisionId = typeof divisionId === 'string' ? divisionId.trim() : '';
  const safePlayer1Id = typeof player1Id === 'string' ? player1Id.trim() : '';
  const safePlayer2Id = typeof player2Id === 'string' ? player2Id.trim() : '';
  const safeSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const safeDivisionLevelId = typeof divisionLevelId === 'string' ? divisionLevelId.trim() : '';
  const safeMatchType = matchType === 'singles' || matchType === 'doubles' ? matchType : undefined;
  const safeSets = Array.isArray(sets)
    ? sets.map((set) => ({ p1: Number(set.p1), p2: Number(set.p2) }))
    : [];
  const isGuest = player2IsGuest === true;

  // Doubles: the two side rosters fully determine every flat field, so this
  // path validates them and writes directly. Guests are not supported, since a
  // team standing needs four resolvable accounts.
  if (requestsDoubles({ matchType: safeMatchType, side1PlayerIds, side2PlayerIds })) {
    if (!safeDivisionId) {
      throw new functions.https.HttpsError('invalid-argument', 'divisionId is required');
    }
    const db = getFirestore();
    const doublesFields = await buildDoublesMatchFields({
      db,
      divisionId: safeDivisionId,
      side1PlayerIds,
      side2PlayerIds,
    });
    await validateDoublesCompetition({
      db, divisionId: safeDivisionId, seasonId: safeSeasonId || undefined,
      divisionLevelId: safeDivisionLevelId || undefined, playerIds: doublesFields.playerIds,
    });
    if (!doublesFields.playerIds.includes(request.auth.uid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Players can only record doubles matches they played in',
      );
    }

    const { score, winner } = buildManualCompletedScore(safeSets);
    const now = Date.now();
    const matchData: Omit<Match, 'id'> = {
      divisionId: safeDivisionId,
      ...(safeSeasonId ? { seasonId: safeSeasonId } : {}),
      ...(safeDivisionLevelId ? { divisionLevelId: safeDivisionLevelId } : {}),
      ...doublesFields,
      format: DEFAULT_FORMAT,
      status: 'pending_report',
      liveScore: score,
      stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
      advancedStatsEnabled: false,
      winner,
      tipsEnabled: false,
      source: 'manual',
      isDivisionMatch: isDivisionMatch ?? true,
      createdBy: request.auth.uid,
      completedAt: now,
      createdAt: now,
      reportSubmission: {
        submittedBy: request.auth.uid,
        submittedAt: now,
        status: 'pending_confirmation',
      },
    };
    const matchRef = await db.collection('matches').add(matchData);
    return { success: true, matchId: matchRef.id, status: matchData.status };
  }

  if (!safeDivisionId || !safePlayer1Id || !safePlayer2Id) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'divisionId, player1Id, and player2Id are required',
    );
  }
  if (safePlayer1Id !== request.auth.uid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Players can only record historic matches for themselves',
    );
  }
  if (!isGuest && safePlayer1Id === safePlayer2Id) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Choose two different players',
    );
  }

  const db = getFirestore();
  const [divisionSnap, player1Snap, player2Snap] = await Promise.all([
    db.collection('divisions').doc(safeDivisionId).get(),
    db.collection('users').doc(safePlayer1Id).get(),
    isGuest ? Promise.resolve(null) : db.collection('users').doc(safePlayer2Id).get(),
  ]);

  if (!divisionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Division not found');
  }
  if (!player1Snap.exists || (!isGuest && !player2Snap?.exists)) {
    throw new functions.https.HttpsError('not-found', 'Player profile not found');
  }

  const division = divisionSnap.data();
  const playerIds: string[] = Array.isArray(division?.playerIds) ? division.playerIds : [];
  const leaderIds: string[] = Array.isArray(division?.leaderIds) ? division.leaderIds : [];
  const isInDivision = (id: string, data: Record<string, unknown> | undefined) =>
    data?.divisionId === safeDivisionId || playerIds.includes(id) || leaderIds.includes(id);

  if (!isInDivision(safePlayer1Id, player1Snap.data())) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'You must belong to the selected division',
    );
  }
  if (!isGuest && !isInDivision(safePlayer2Id, player2Snap?.data())) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Opponent must belong to the selected division',
    );
  }

  const { score, winner } = buildManualCompletedScore(safeSets);
  const now = Date.now();
  const player1 = player1Snap.data();
  const player2 = player2Snap?.data();
  const matchData: Omit<Match, 'id'> = {
    divisionId: safeDivisionId,
    ...(safeSeasonId ? { seasonId: safeSeasonId } : {}),
    ...(safeDivisionLevelId ? { divisionLevelId: safeDivisionLevelId } : {}),
    ...(safeMatchType ? { matchType: safeMatchType } : {}),
    player1Id: safePlayer1Id,
    player2Id: isGuest ? 'guest' : safePlayer2Id,
    player1Name: typeof player1Name === 'string' && player1Name.trim()
      ? player1Name.trim()
      : player1?.displayName ?? safePlayer1Id,
    player2Name: typeof player2Name === 'string' && player2Name.trim()
      ? player2Name.trim()
      : player2?.displayName ?? (isGuest ? 'Guest' : safePlayer2Id),
    player2IsGuest: isGuest,
    playerIds: isGuest ? [safePlayer1Id] : [safePlayer1Id, safePlayer2Id],
    format: DEFAULT_FORMAT,
    status: isGuest ? 'completed' : 'pending_report',
    liveScore: score,
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    advancedStatsEnabled: false,
    winner,
    tipsEnabled: false,
    source: 'manual',
    isDivisionMatch: isDivisionMatch ?? true,
    createdBy: request.auth.uid,
    completedAt: now,
    createdAt: now,
    reportSubmission: isGuest
      ? {
          submittedBy: request.auth.uid,
          submittedAt: now,
          status: 'confirmed',
          confirmedBy: request.auth.uid,
          confirmedAt: now,
        }
      : {
          submittedBy: request.auth.uid,
          submittedAt: now,
          status: 'pending_confirmation',
        },
  };

  const matchRef = await db.collection('matches').add(matchData);
  return { success: true, matchId: matchRef.id, status: matchData.status };
});

/**
 * HTTPS callable: admins, app developers, and division leaders can record a
 * completed match between any two players in a division.
 */
export const recordMatchOnBehalf = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { divisionId, seasonId, divisionLevelId, matchType, player1Id, player2Id, side1PlayerIds, side2PlayerIds, sets, isDivisionMatch, notifyPlayers } =
    (request.data ?? {}) as RecordMatchOnBehalfInput;
  const safeDivisionId = typeof divisionId === 'string' ? divisionId.trim() : '';
  const safePlayer1Id = typeof player1Id === 'string' ? player1Id.trim() : '';
  const safePlayer2Id = typeof player2Id === 'string' ? player2Id.trim() : '';
  const safeSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const safeDivisionLevelId = typeof divisionLevelId === 'string' ? divisionLevelId.trim() : '';
  const safeMatchType = matchType === 'singles' || matchType === 'doubles' ? matchType : undefined;
  const safeSets = Array.isArray(sets)
    ? sets.map((set) => ({ p1: Number(set.p1), p2: Number(set.p2) }))
    : [];

  // Doubles payloads carry side rosters instead of the two flat player ids.
  const isDoubles = requestsDoubles({ matchType: safeMatchType, side1PlayerIds, side2PlayerIds });

  if (!safeDivisionId) {
    throw new functions.https.HttpsError('invalid-argument', 'divisionId is required');
  }
  if (!isDoubles) {
    if (!safePlayer1Id || !safePlayer2Id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'divisionId, player1Id, and player2Id are required',
      );
    }
    if (safePlayer1Id === safePlayer2Id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Choose two different players',
      );
    }
  }

  const db = getFirestore();
  const [actorSnap, divisionSnap, player1Snap, player2Snap] = await Promise.all([
    db.collection('users').doc(request.auth.uid).get(),
    db.collection('divisions').doc(safeDivisionId).get(),
    isDoubles ? Promise.resolve(null) : db.collection('users').doc(safePlayer1Id).get(),
    isDoubles ? Promise.resolve(null) : db.collection('users').doc(safePlayer2Id).get(),
  ]);

  const actor = actorSnap.data();
  const division = divisionSnap.data();
  const leaderIds: string[] = Array.isArray(division?.leaderIds) ? division.leaderIds : [];
  const isAdminOrDeveloper = actor?.role === 'admin' || actor?.role === 'app_developer';
  const isLeader = leaderIds.includes(request.auth.uid) || division?.leaderId === request.auth.uid;

  if (!isPrivilegedRole(actor?.role) || (!isAdminOrDeveloper && !isLeader)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins, app developers, and division leaders can record matches for other players',
    );
  }
  if (!divisionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Division not found');
  }

  // Doubles: side rosters replace the two-player fields entirely. The leader is
  // recording on the players' behalf, so they need not be in the match.
  if (isDoubles) {
    const doublesFields = await buildDoublesMatchFields({
      db,
      divisionId: safeDivisionId,
      side1PlayerIds,
      side2PlayerIds,
    });
    await validateDoublesCompetition({
      db, divisionId: safeDivisionId, seasonId: safeSeasonId || undefined,
      divisionLevelId: safeDivisionLevelId || undefined, playerIds: doublesFields.playerIds,
    });
    const { score: doublesScore, winner: doublesWinner } = buildManualCompletedScore(safeSets);
    const recordedAt = Date.now();
    const doublesMatchData: Omit<Match, 'id'> = {
      divisionId: safeDivisionId,
      ...(safeSeasonId ? { seasonId: safeSeasonId } : {}),
      ...(safeDivisionLevelId ? { divisionLevelId: safeDivisionLevelId } : {}),
      ...doublesFields,
      format: DEFAULT_FORMAT,
      status: 'completed',
      liveScore: doublesScore,
      stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
      advancedStatsEnabled: false,
      winner: doublesWinner,
      tipsEnabled: false,
      source: 'manual',
      isDivisionMatch: isDivisionMatch ?? true,
      createdBy: request.auth.uid,
      completedAt: recordedAt,
      createdAt: recordedAt,
      reportSubmission: {
        submittedBy: request.auth.uid,
        submittedAt: recordedAt,
        status: 'confirmed',
        confirmedBy: request.auth.uid,
        confirmedAt: recordedAt,
      },
    };
    const doublesRef = await db.collection('matches').add(doublesMatchData);
    if (notifyPlayers !== false) {
      await notifyPlayersMatchRecorded(
        db,
        { id: doublesRef.id, ...doublesMatchData },
        doublesRef.id,
        actor?.displayName ?? actor?.email ?? 'A league administrator',
      );
    }
    return { success: true, matchId: doublesRef.id };
  }

  if (!player1Snap?.exists || !player2Snap?.exists) {
    throw new functions.https.HttpsError('not-found', 'Both players must exist');
  }

  const playerIds: string[] = Array.isArray(division?.playerIds) ? division.playerIds : [];
  const isInDivision = (id: string, data: Record<string, unknown> | undefined) =>
    data?.divisionId === safeDivisionId || playerIds.includes(id) || leaderIds.includes(id);
  if (!isInDivision(safePlayer1Id, player1Snap.data()) || !isInDivision(safePlayer2Id, player2Snap.data())) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Both players must belong to the selected division',
    );
  }

  const { score, winner } = buildManualCompletedScore(safeSets);
  const now = Date.now();
  const actorName = actor?.displayName ?? actor?.email ?? 'A league administrator';
  const player1 = player1Snap.data();
  const player2 = player2Snap.data();
  const matchData: Omit<Match, 'id'> = {
    divisionId: safeDivisionId,
    ...(safeSeasonId ? { seasonId: safeSeasonId } : {}),
    ...(safeDivisionLevelId ? { divisionLevelId: safeDivisionLevelId } : {}),
    ...(safeMatchType ? { matchType: safeMatchType } : {}),
    player1Id: safePlayer1Id,
    player2Id: safePlayer2Id,
    player1Name: player1?.displayName ?? safePlayer1Id,
    player2Name: player2?.displayName ?? safePlayer2Id,
    player2IsGuest: false,
    playerIds: [safePlayer1Id, safePlayer2Id],
    format: DEFAULT_FORMAT,
    status: 'completed',
    liveScore: score,
    stats: { player1: { ...EMPTY_STATS }, player2: { ...EMPTY_STATS } },
    advancedStatsEnabled: false,
    winner,
    tipsEnabled: false,
    source: 'manual',
    isDivisionMatch: isDivisionMatch ?? true,
    createdBy: request.auth.uid,
    completedAt: now,
    createdAt: now,
    reportSubmission: {
      submittedBy: request.auth.uid,
      submittedAt: now,
      status: 'confirmed',
      confirmedBy: request.auth.uid,
      confirmedAt: now,
    },
  };

  const matchRef = await db.collection('matches').add(matchData);
  if (notifyPlayers !== false) {
    await notifyPlayersMatchRecorded(db, { id: matchRef.id, ...matchData }, matchRef.id, actorName);
  }

  return { success: true, matchId: matchRef.id };
});

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

  const { matchId } = (request.data ?? {}) as { matchId?: unknown };
  if (typeof matchId !== 'string' || !matchId.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
  }
  const db = getFirestore();

  const matchRef = db.collection('matches').doc(matchId.trim());
  const matchSnap = await matchRef.get();
  const match = matchSnap.data() as Match | undefined;

  if (!match)
    throw new functions.https.HttpsError('not-found', 'Match not found');

  const [isLeader, actorSnap] = await Promise.all([
    checkIsLeader(request.auth.uid, match.divisionId),
    db.collection('users').doc(request.auth.uid).get(),
  ]);
  if (!isLeader && !isAdminRole(actorSnap.data()?.role)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only the division leader can resolve disputes',
    );
  }
  // Resolving confirms the reported score. Anything not under dispute has no
  // report to confirm, and forcing it to completed would skip the players.
  if (match.status !== 'disputed') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Only disputed matches can be resolved',
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

    const isAdmin = isAdminRole(userSnap.data()?.role);
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
    if (!isAdminRole(userSnap.data()?.role)) {
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
        doublesRankingsWritten:
          acc.doublesRankingsWritten + result.doublesRankingsWritten,
        doublesRankingsDeleted:
          acc.doublesRankingsDeleted + result.doublesRankingsDeleted,
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
        doublesRankingsWritten: 0,
        doublesRankingsDeleted: 0,
        headToHeadsWritten: 0,
        headToHeadsDeleted: 0,
      },
    );

    return { success: true, totals, results };
  },
);
