import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';

/** FCM accepts at most this many tokens in one multicast send. */
const MAX_TOKENS_PER_SEND = 500;

/** Send errors that mean the token will never work again. */
const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export type PushPayload = Omit<MulticastMessage, 'tokens'>;

/**
 * Sends one notification to every push token the given users hold.
 *
 * Sends in batches FCM accepts, and removes tokens FCM reports as permanently
 * invalid from their owners' user docs. Nothing pruned them before, so dead
 * tokens piled up until an account hit the 20-token cap in the rules and new
 * devices could no longer register.
 *
 * `skipUser` drops a recipient based on their user doc (for example, a user
 * who blocked the sender). Guest ids and missing users are ignored.
 */
export async function sendPushToUsers(
  db: Firestore,
  userIds: readonly string[],
  payload: PushPayload,
  skipUser?: (userData: FirebaseFirestore.DocumentData) => boolean,
): Promise<void> {
  const realIds = [...new Set(userIds)].filter(
    (id) => typeof id === 'string' && id.length > 0 && id !== 'guest',
  );
  if (realIds.length === 0) return;

  const snaps = await Promise.all(realIds.map((id) => db.collection('users').doc(id).get()));
  // One device can hold a token for more than one account (a shared phone), so
  // a token is sent once and pruned from every owner.
  const ownersByToken = new Map<string, string[]>();
  for (const snap of snaps) {
    const data = snap.data();
    if (!data || skipUser?.(data)) continue;
    const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
    for (const token of tokens) {
      if (typeof token !== 'string' || token.length === 0) continue;
      ownersByToken.set(token, [...(ownersByToken.get(token) ?? []), snap.id]);
    }
  }

  const tokens = [...ownersByToken.keys()];
  const staleTokens: string[] = [];
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_SEND) {
    const batch = tokens.slice(i, i + MAX_TOKENS_PER_SEND);
    const response = await getMessaging().sendEachForMulticast({ ...payload, tokens: batch });
    response.responses.forEach((result, index) => {
      if (!result.success && result.error && STALE_TOKEN_CODES.has(result.error.code)) {
        staleTokens.push(batch[index]);
      }
    });
  }
  if (staleTokens.length === 0) return;

  const removals = new Map<string, string[]>();
  for (const token of staleTokens) {
    for (const owner of ownersByToken.get(token) ?? []) {
      removals.set(owner, [...(removals.get(owner) ?? []), token]);
    }
  }
  await Promise.all(
    [...removals].map(([userId, dead]) =>
      db
        .collection('users')
        .doc(userId)
        .update({ fcmTokens: FieldValue.arrayRemove(...dead) })
        .catch((error: unknown) =>
          logger.warn('Could not prune stale push tokens', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
    ),
  );
}
