import * as functions from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  MAX_APPEAL_NOTE_LENGTH,
  MAX_APPEAL_REASON_LENGTH,
  REPORT_CONFIRMATION_WINDOW_MS,
  canRequestMatchAppeal,
  isAdminRole,
  isMatchParticipant,
  sideDisplayName,
  sideOfPlayer,
} from '@tennis/shared';
import type { Match, MatchAppeal, RecordedSetInput } from '@tennis/shared';

import { buildManualCompletedScore, checkIsLeader, sanitizeRecordedSets } from './matchFunctions';
import { sendPushToUsers } from '../notifications/push';
import { assertVerifiedEmail } from '../auth/verifiedEmail';

if (!getApps().length) initializeApp();

type Db = ReturnType<typeof getFirestore>;

/**
 * The report confirmation window.
 *
 * When a report is submitted, the opposing side has 48 hours
 * (`REPORT_CONFIRMATION_WINDOW_MS`) to confirm or dispute it. The deadline is
 * written here, from the server clock, onto `reportSubmission.confirmationDeadline`:
 * `submittedAt` comes from the submitter's device, and trusting it would let a
 * submitter backdate a report so it confirmed itself before the opponent saw it.
 *
 * The Firestore rules read the same field: once it passes, a participant can
 * still confirm the report, but can no longer dispute, edit, undo, or resubmit
 * it. `autoConfirmExpiredReports` then confirms it, and any later change goes
 * through an appeal (`requestMatchAppeal`) that a leader or admin decides
 * (`decideMatchAppeal`).
 */

function hasUnstampedPendingReport(match: Match | undefined): boolean {
  return (
    match?.status === 'pending_report' &&
    match.reportSubmission?.status === 'pending_confirmation' &&
    typeof match.reportSubmission.confirmationDeadline !== 'number'
  );
}

/**
 * Starts the 48-hour window on a newly submitted report. Called by
 * onMatchUpdate on every write; does nothing unless the match holds a pending
 * report with no deadline yet, so the write it makes triggers no second stamp.
 */
export async function stampReportDeadline(db: Db, matchId: string, after: Match): Promise<boolean> {
  if (!hasUnstampedPendingReport(after)) return false;
  const ref = db.collection('matches').doc(matchId);
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as Match | undefined;
    if (!hasUnstampedPendingReport(current)) return false;
    tx.update(ref, {
      'reportSubmission.confirmationDeadline': Date.now() + REPORT_CONFIRMATION_WINDOW_MS,
    });
    return true;
  });
}

type ExpiredReportsResult = { stamped: number; confirmed: string[] };

/**
 * One pass of the scheduled job, split out so tests can pass their own clock.
 *
 * Confirms every pending report whose deadline has passed. A pending report
 * with no deadline (submitted before this shipped, or one whose stamp failed)
 * gets a full window from now rather than one counted from `submittedAt`, so
 * nobody loses a window they were never told about.
 */
export async function processExpiredReports(db: Db, now: number): Promise<ExpiredReportsResult> {
  const result: ExpiredReportsResult = { stamped: 0, confirmed: [] };
  // Only matches waiting on a report are read, which is a small set; the
  // single-field index on status serves the query.
  const snap = await db.collection('matches').where('status', '==', 'pending_report').get();

  for (const doc of snap.docs) {
    const match = doc.data() as Match;
    const submission = match.reportSubmission;
    if (submission?.status !== 'pending_confirmation') continue;

    try {
      if (typeof submission.confirmationDeadline !== 'number') {
        const stamped = await db.runTransaction(async (tx) => {
          const current = (await tx.get(doc.ref)).data() as Match | undefined;
          if (!hasUnstampedPendingReport(current)) return false;
          tx.update(doc.ref, {
            'reportSubmission.confirmationDeadline': now + REPORT_CONFIRMATION_WINDOW_MS,
          });
          return true;
        });
        if (stamped) result.stamped += 1;
        continue;
      }
      if (now < submission.confirmationDeadline) continue;

      // Re-read inside a transaction: the opponent may have answered, or the
      // submitter edited the score, since the query ran.
      const confirmed = await db.runTransaction(async (tx) => {
        const current = (await tx.get(doc.ref)).data() as Match | undefined;
        const currentSubmission = current?.reportSubmission;
        if (
          current?.status !== 'pending_report' ||
          currentSubmission?.status !== 'pending_confirmation' ||
          currentSubmission.submittedAt !== submission.submittedAt ||
          currentSubmission.submittedBy !== submission.submittedBy ||
          typeof currentSubmission.confirmationDeadline !== 'number' ||
          now < currentSubmission.confirmationDeadline
        ) {
          return false;
        }
        tx.update(doc.ref, {
          status: 'completed',
          'reportSubmission.status': 'confirmed',
          'reportSubmission.confirmedAt': now,
          'reportSubmission.autoConfirmed': true,
        });
        return true;
      });
      if (!confirmed) continue;
      result.confirmed.push(doc.id);
      await notifySafely('auto-confirm', doc.id, () => notifyAutoConfirmed(db, match, doc.id));
    } catch (error) {
      // One bad document must not stop the rest of the pass.
      functions.logger.error('Failed to process an expired match report', {
        matchId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

/**
 * Confirms reports nobody answered within 48 hours. Runs every 15 minutes, so
 * a report is confirmed between 48 hours and 48 hours 15 minutes after it was
 * submitted. Writing `completed` fires onMatchUpdate, which recalculates the
 * standings, and generateMatchReport, which builds the PDF, exactly as a
 * player's confirmation does.
 */
export const autoConfirmExpiredReports = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Etc/UTC' },
  async () => {
    const result = await processExpiredReports(getFirestore(), Date.now());
    functions.logger.info('autoConfirmExpiredReports finished', {
      stamped: result.stamped,
      confirmed: result.confirmed.length,
    });
  },
);

function readReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Say what is wrong with the result.');
  }
  if (reason.length > MAX_APPEAL_REASON_LENGTH) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Keep the reason under ${MAX_APPEAL_REASON_LENGTH} characters.`,
    );
  }
  return reason;
}

function readNote(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'note must be text');
  }
  const note = value.trim();
  if (note.length > MAX_APPEAL_NOTE_LENGTH) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Keep the note under ${MAX_APPEAL_NOTE_LENGTH} characters.`,
    );
  }
  return note || undefined;
}

/** Validated sets, or `undefined` when none were sent. Throws on a bad score. */
function readSets(value: unknown): RecordedSetInput[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'sets must be a list of set scores');
  }
  const sets = sanitizeRecordedSets(value);
  buildManualCompletedScore(sets);
  return sets;
}

function readMatchId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'matchId is required');
  }
  return value.trim();
}

/**
 * HTTPS callable: a player asks a division leader or admin to review a
 * confirmed result, optionally with the score they believe is right.
 *
 * Only a participant can appeal, only a confirmed result that counts in the
 * standings, and only once per match: a second appeal, by either side, is
 * refused whatever happened to the first. The match itself is unchanged until
 * a reviewer approves.
 */
export const requestMatchAppeal = functions.https.onCall(async (request) => {
  assertVerifiedEmail(request.auth);
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = request.auth.uid;
  const data = (request.data ?? {}) as { matchId?: unknown; reason?: unknown; sets?: unknown };
  const matchId = readMatchId(data.matchId);
  const reason = readReason(data.reason);
  const proposedSets = readSets(data.sets);

  const db = getFirestore();
  const ref = db.collection('matches').doc(matchId);
  const match = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as Match | undefined;
    if (!current) throw new functions.https.HttpsError('not-found', 'Match not found');
    if (!isMatchParticipant(current, uid)) {
      throw new functions.https.HttpsError('permission-denied', 'Only the players in this match can appeal it.');
    }
    if (current.appeal) {
      throw new functions.https.HttpsError('already-exists', 'This result has already been appealed.');
    }
    if (!canRequestMatchAppeal(current, uid)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only a confirmed result that counts in the standings can be appealed.',
      );
    }
    const appeal: MatchAppeal = {
      requestedBy: uid,
      requestedAt: Date.now(),
      reason,
      ...(proposedSets && { proposedSets }),
      status: 'pending',
    };
    tx.update(ref, { appeal });
    return current;
  });

  await notifySafely('appeal requested', matchId, () => notifyReviewersOfAppeal(db, match, matchId, uid));
  return { success: true };
});

/**
 * HTTPS callable: a division leader or admin approves or rejects a pending
 * appeal.
 *
 * - Approving saves a corrected score: the `sets` passed in, or the score the
 *   player proposed. The result stays confirmed, and the standings and the PDF
 *   are rebuilt for the new score.
 * - Rejecting leaves the result exactly as it was. The appeal is closed, and
 *   the match cannot be appealed again.
 *
 * A leader or admin who played in the match cannot decide its appeal; another
 * leader of the division or an admin has to.
 */
export const decideMatchAppeal = functions.https.onCall(async (request) => {
  assertVerifiedEmail(request.auth);
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = request.auth.uid;
  const data = (request.data ?? {}) as {
    matchId?: unknown;
    decision?: unknown;
    sets?: unknown;
    note?: unknown;
  };
  const matchId = readMatchId(data.matchId);
  if (data.decision !== 'approve' && data.decision !== 'reject') {
    throw new functions.https.HttpsError('invalid-argument', "decision must be 'approve' or 'reject'");
  }
  const decision = data.decision;
  const note = readNote(data.note);
  const requestedSets = decision === 'approve' ? readSets(data.sets) : undefined;

  const db = getFirestore();
  const ref = db.collection('matches').doc(matchId);
  const preview = (await ref.get()).data() as Match | undefined;
  if (!preview) throw new functions.https.HttpsError('not-found', 'Match not found');

  const [isLeader, actorSnap] = await Promise.all([
    checkIsLeader(uid, preview.divisionId),
    db.collection('users').doc(uid).get(),
  ]);
  if (!isLeader && !isAdminRole(actorSnap.data()?.role)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only a division leader or an admin can decide an appeal.',
    );
  }

  const match = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as Match | undefined;
    if (!current) throw new functions.https.HttpsError('not-found', 'Match not found');
    // The leader check above read the division the match was in then.
    if (current.divisionId !== preview.divisionId) {
      throw new functions.https.HttpsError('aborted', 'The match changed. Try again.');
    }
    if (isMatchParticipant(current, uid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You played in this match, so another division leader or an admin has to decide its appeal.',
      );
    }
    if (current.appeal?.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'This match has no appeal waiting for a decision.');
    }
    if (current.status !== 'completed') {
      throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed result can be changed by an appeal.');
    }

    const now = Date.now();
    const decided = {
      'appeal.status': decision === 'approve' ? 'approved' : 'rejected',
      'appeal.decidedBy': uid,
      'appeal.decidedAt': now,
      ...(note && { 'appeal.decisionNote': note }),
    };
    if (decision === 'reject') {
      tx.update(ref, decided);
      return current;
    }

    const sets = requestedSets ?? current.appeal.proposedSets;
    if (!sets) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Enter the corrected score to approve this appeal.',
      );
    }
    const corrected = buildManualCompletedScore(sets);
    tx.update(ref, {
      ...decided,
      'appeal.appliedSets': sets,
      liveScore: corrected.score,
      winner: corrected.winner,
      undoSnapshot: FieldValue.delete(),
      // Built from the old score; generateMatchReport rebuilds it.
      reportUrl: FieldValue.delete(),
    });
    return current;
  });

  await notifySafely('appeal decided', matchId, () => notifyPlayersOfDecision(db, match, matchId, decision));
  return { success: true, decision };
});

// The write these follow has already landed, so a failed send is logged and
// never reported to the caller as a failed request.
async function notifySafely(what: string, matchId: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    functions.logger.error(`Failed to send the ${what} notification`, {
      matchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function notifyAutoConfirmed(db: Db, match: Match, matchId: string): Promise<void> {
  await sendPushToUsers(db, match.playerIds ?? [], {
    notification: {
      title: 'Score confirmed automatically',
      body: 'Nobody answered the match report within 48 hours, so it now counts in the standings. To challenge it, request a review from the match page.',
    },
    data: { type: 'report_auto_confirmed', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}

async function notifyReviewersOfAppeal(db: Db, match: Match, matchId: string, requestedBy: string): Promise<void> {
  const division = (await db.collection('divisions').doc(match.divisionId).get()).data();
  const leaderIds = [
    ...new Set([
      ...((division?.leaderIds ?? []) as string[]),
      ...(division?.leaderId ? [division.leaderId as string] : []),
    ]),
  ].filter((id) => !isMatchParticipant(match, id));
  if (!leaderIds.length) return;

  const side = sideOfPlayer(match, requestedBy);
  const name = side ? sideDisplayName(match, side).trim() : '';
  await sendPushToUsers(db, leaderIds, {
    notification: {
      title: 'Result appeal',
      body: `${name || 'A player'} asked for a review of a confirmed result. Your decision is needed.`,
    },
    data: { type: 'appeal_requested', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}

async function notifyPlayersOfDecision(
  db: Db,
  match: Match,
  matchId: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  await sendPushToUsers(db, match.playerIds ?? [], {
    notification:
      decision === 'approve'
        ? { title: 'Appeal approved', body: 'The result of your match was corrected.' }
        : { title: 'Appeal not approved', body: 'The result of your match stands.' },
    data: { type: 'appeal_decided', matchId },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}
