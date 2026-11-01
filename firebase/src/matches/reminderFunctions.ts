import * as functions from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  MATCH_REMINDER_LEAD_MS,
  formatMatchReminder,
  matchNeedsReminder,
  sidePlayerIds,
} from '@tennis/shared';
import type { Match } from '@tennis/shared';

import { sendPushToUsers } from '../notifications/push';

if (!getApps().length) initializeApp();

type Db = ReturnType<typeof getFirestore>;

export interface MatchRemindersResult {
  reminded: string[];
}

/**
 * Sends one reminder per player for every scheduled match that starts within
 * `MATCH_REMINDER_LEAD_MS`, and records the start time it was sent for on
 * `reminderSentFor`. Exported so the functions test can drive it with a fixed
 * clock.
 *
 * The query is a range on `scheduledAt` alone, which the automatic
 * single-field index serves; the status check happens here. The claim is a
 * transaction, so two overlapping runs cannot both send.
 */
export async function processMatchReminders(db: Db, now: number): Promise<MatchRemindersResult> {
  const result: MatchRemindersResult = { reminded: [] };
  const snap = await db
    .collection('matches')
    .where('scheduledAt', '>', now)
    .where('scheduledAt', '<=', now + MATCH_REMINDER_LEAD_MS)
    .get();

  for (const doc of snap.docs) {
    const match = doc.data() as Match;
    if (!matchNeedsReminder(match, now)) continue;

    try {
      const claimed = await db.runTransaction(async (tx) => {
        const current = (await tx.get(doc.ref)).data() as Match | undefined;
        if (!current || !matchNeedsReminder(current, now)) return false;
        tx.update(doc.ref, { reminderSentFor: current.scheduledAt });
        return true;
      });
      if (!claimed) continue;
      result.reminded.push(doc.id);

      // Each player gets their own text, since it names their opponent.
      const playerIds = [...sidePlayerIds(match, 'player1'), ...sidePlayerIds(match, 'player2')];
      await Promise.all(
        playerIds.map(async (playerId) => {
          try {
            const { title, body } = formatMatchReminder(match, playerId, now);
            await sendPushToUsers(db, [playerId], {
              notification: { title, body },
              data: { type: 'match_reminder', matchId: doc.id },
              android: { priority: 'high' },
              apns: { payload: { aps: { sound: 'default' } } },
            });
          } catch (error) {
            // A failed send is not retried: the claim is already written, and
            // a second reminder an hour later is worse than none.
            functions.logger.error('Failed to send a match reminder', {
              matchId: doc.id,
              playerId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    } catch (error) {
      functions.logger.error('Failed to process a match reminder', {
        matchId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

/**
 * Reminds both players of a scheduled match about a day before it starts.
 * Runs at the top of every hour, so the reminder arrives between 23 and 24
 * hours ahead; a match scheduled less than a day out is reminded on the next
 * run. Postponing a match moves `scheduledAt`, which makes it due again.
 */
export const sendMatchReminders = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'Etc/UTC' },
  async () => {
    const result = await processMatchReminders(getFirestore(), Date.now());
    functions.logger.info('sendMatchReminders finished', { reminded: result.reminded.length });
  },
);
