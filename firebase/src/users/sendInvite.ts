import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { publicProfileUpdate } from '../divisions/divisionFunctions';

if (!getApps().length) initializeApp();

type SendInviteInput = {
  email?: string;
  name?: string;
  divisionId?: string;
};

type InvitePreviewInput = { token?: string };
type AcceptInviteInput = { token?: string };



type UserCoreFields = {
  role: string;
  createdAt: unknown;
  contactPreferences: { allowEmail: boolean; allowSMS: boolean; allowInApp: boolean };
  fcmTokens: unknown[];
  tipsEnabled: boolean;
};

function validateUserCompleteness(value: unknown): UserCoreFields | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const user = value as Partial<UserCoreFields>;
  const contact = user.contactPreferences as Partial<UserCoreFields['contactPreferences']> | undefined;
  const contactValid = !!contact
    && typeof contact.allowEmail === 'boolean'
    && typeof contact.allowSMS === 'boolean'
    && typeof contact.allowInApp === 'boolean';

  if (
    user.role !== 'player' && user.role !== 'division_leader' && user.role !== 'admin' && user.role !== 'app_developer'
  ) return undefined;
  if (!user.createdAt) return undefined;
  if (!contactValid) return undefined;
  if (!Array.isArray(user.fcmTokens)) return undefined;
  if (typeof user.tipsEnabled !== 'boolean') return undefined;
  return {
    role: user.role,
    createdAt: user.createdAt,
    contactPreferences: contact as UserCoreFields['contactPreferences'],
    fcmTokens: user.fcmTokens,
    tipsEnabled: user.tipsEnabled,
  };
}

function hashedRateLimitKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function requestClientKey(request: { auth?: { uid?: string } | null; rawRequest?: { ip?: string; headers?: { [key: string]: unknown } } }): string {
  const uid = request.auth?.uid;
  if (uid) return `uid:${uid}`;
  const forwardedFor = request.rawRequest?.headers?.['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = typeof forwardedIp === 'string'
    ? forwardedIp.split(',')[0].trim()
    : request.rawRequest?.ip;
  return `ip:${ip || 'unknown'}`;
}

async function assertRateLimit(
  db: FirebaseFirestore.Firestore,
  keyParts: string[],
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now();
  const key = hashedRateLimitKey(...keyParts);
  const ref = db.collection('rateLimits').doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { count?: number; resetAt?: number } | undefined;
    const resetAt = typeof data?.resetAt === 'number' ? data.resetAt : 0;
    if (!snap.exists || resetAt <= now) {
      tx.set(ref, {
        count: 1,
        resetAt: now + windowMs,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    const count = typeof data?.count === 'number' ? data.count : 0;
    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.');
    }
    tx.update(ref, {
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
    throw new HttpsError('failed-precondition', 'APP_BASE_URL must be configured in production.');
  }
  if (process.env.NODE_ENV === 'production' && !configuredUrl.startsWith('https://')) {
    throw new HttpsError('failed-precondition', 'APP_BASE_URL must use HTTPS in production.');
  }
  return configuredUrl;
}

function inviteLinkForToken(token: string): string {
  return `${appBaseUrl().replace(/\/$/, '')}/invite/accept?token=${encodeURIComponent(token)}`;
}

export const sendInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to invite users.',
    );
  }

  const { email, name, divisionId } = (request.data ?? {}) as SendInviteInput;
  const safeEmail = email ? normalizeEmail(email) : '';
  const safeName = name?.trim() ?? '';

  if (!safeEmail || !safeName) {
    throw new HttpsError('invalid-argument', 'Name and email are required.');
  }

  const db = getFirestore();
  const inviterId = request.auth.uid;
  await assertRateLimit(db, ['sendInvite', requestClientKey(request)], 20, 60 * 60 * 1000);

  const inviterSnap = await db.collection('users').doc(inviterId).get();
  const inviterRole = inviterSnap.data()?.role;
  const isAdmin = inviterRole === 'admin';

  let isLeader = false;
  if (divisionId) {
    const divisionSnap = await db.collection('divisions').doc(divisionId).get();
    const leaders: string[] = divisionSnap.data()?.leaderIds ?? [];
    isLeader = leaders.includes(inviterId);
  }

  if (!isAdmin && !isLeader) {
    throw new HttpsError(
      'permission-denied',
      'Only admins or division leaders can invite users.',
    );
  }

  const token = crypto.randomUUID();
  const inviteLink = inviteLinkForToken(token);
  const htmlName = escapeHtml(safeName);
  const htmlLink = escapeHtml(inviteLink);

  const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  await db
    .collection('invites')
    .doc(token)
    .set({
      token,
      email: safeEmail,
      name: safeName,
      invitedBy: inviterId,
      invitedAt: FieldValue.serverTimestamp(),
      expiresAt: Date.now() + INVITE_TTL_MS,
      accepted: false,
      ...(divisionId ? { divisionId } : {}),
    });

  // Compatible with Firebase Trigger Email extension if installed.
  await db.collection('mail').add({
    to: [safeEmail],
    message: {
      subject: 'You are invited to Tennis League',
      text: `${safeName}, you were invited to join Tennis League. Open this link to create your account and finish your profile: ${inviteLink}`,
      html: `<p>Hi ${htmlName},</p><p>You were invited to join Tennis League.</p><p><a href="${htmlLink}">Accept invite</a> to create your account and finish your profile.</p>`,
    },
    metadata: {
      type: 'user_invite',
      token,
      inviterId,
      divisionId: divisionId ?? null,
    },
  });

  return { success: true, token };
});

export const getInvitePreview = onCall(async (request) => {
  const { token } = (request.data ?? {}) as InvitePreviewInput;
  const safeToken = token?.trim();
  if (!safeToken) {
    throw new HttpsError('invalid-argument', 'Invite token is required.');
  }

  const db = getFirestore();
  await assertRateLimit(
    db,
    ['getInvitePreview', requestClientKey(request), safeToken],
    10,
    60 * 1000,
  );
  const inviteSnap = await db.collection('invites').doc(safeToken).get();
  if (!inviteSnap.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }

  const invite = inviteSnap.data();
  if (!invite || invite.accepted) {
    throw new HttpsError('failed-precondition', 'Invite has already been used.');
  }
  if (invite.expiresAt && Date.now() > invite.expiresAt) {
    throw new HttpsError('failed-precondition', 'This invite link has expired.');
  }

  // Only return the email when the caller is authenticated as the invited address.
  // Unauthenticated callers (new users landing on the accept page) receive name only;
  // email is pre-filled by the invite email they received, not from this response.
  const callerEmail = request.auth?.token.email
    ? normalizeEmail(request.auth.token.email)
    : null;
  const inviteEmail = normalizeEmail(invite.email ?? '');
  const showEmail = callerEmail !== null && callerEmail === inviteEmail;

  return {
    ...(showEmail ? { email: invite.email } : {}),
    name: invite.name,
    divisionId: invite.divisionId ?? null,
  };
});

export const acceptInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Sign in first to accept this invite.',
    );
  }

  const { token } = (request.data ?? {}) as AcceptInviteInput;
  const safeToken = token?.trim();
  if (!safeToken) {
    throw new HttpsError('invalid-argument', 'Invite token is required.');
  }

  const db = getFirestore();
  await assertRateLimit(
    db,
    ['acceptInvite', requestClientKey(request), safeToken],
    5,
    60 * 1000,
  );
  const uid = request.auth.uid;
  const authEmail = normalizeEmail(request.auth.token.email ?? '');

  if (!authEmail) {
    throw new HttpsError(
      'failed-precondition',
      'Your account must include an email address.',
    );
  }

  const inviteRef = db.collection('invites').doc(safeToken);
  const userRef = db.collection('users').doc(uid);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }
  const inviteData = inviteSnap.data();
  if (!inviteData) {
    throw new HttpsError('not-found', 'Invite not found.');
  }
  if (inviteData.accepted) {
    throw new HttpsError('already-exists', 'Invite already accepted.');
  }
  if (inviteData.expiresAt && Date.now() > inviteData.expiresAt) {
    throw new HttpsError('failed-precondition', 'This invite link has expired.');
  }
  if (normalizeEmail(inviteData.email ?? '') !== authEmail) {
    throw new HttpsError(
      'permission-denied',
      'This invite is for a different email address.',
    );
  }
  const inviteDivisionId = inviteData.divisionId as string | undefined;

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const wasIncomplete = validateUserCompleteness(userSnap.data()) === undefined;
    const displayName = userSnap.data()?.displayName || inviteData.name;

    tx.update(inviteRef, {
      accepted: true,
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedBy: uid,
    });

    tx.set(
      userRef,
      {
        id: uid,
        displayName,
        email: authEmail,
        isRegistered: true,
        inviteStatus: 'registered',
        updatedAt: Date.now(),
        ...(wasIncomplete ? {
          role: 'player',
          createdAt: Date.now(),
          contactPreferences: { allowEmail: true, allowSMS: false, allowInApp: true },
          fcmTokens: [],
          tipsEnabled: true,
        } : {}),
        ...(inviteDivisionId ? { divisionId: inviteDivisionId } : {}),
      },
      { merge: true },
    );

    tx.set(
      db.collection('profiles').doc(uid),
      publicProfileUpdate({
        id: uid,
        displayName,
        avatarUrl: userSnap.data()?.avatarUrl,
        divisionId: inviteDivisionId,
        role: wasIncomplete ? 'player' : userSnap.data()?.role,
      }),
      { merge: true },
    );

    if (inviteDivisionId) {
      const divisionRef = db.collection('divisions').doc(inviteDivisionId);
      tx.update(divisionRef, {
        playerIds: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  if (inviteDivisionId) {
    const placeholderSnap = await db
      .collection('users')
      .where('divisionId', '==', inviteDivisionId)
      .where('email', '==', authEmail)
      .where('isRegistered', '==', false)
      .limit(1)
      .get();
    if (!placeholderSnap.empty) {
      const placeholderRef = placeholderSnap.docs[0].ref;
      if (placeholderRef.id !== uid) {
        await db.runTransaction(async (tx) => {
          tx.update(db.collection('divisions').doc(inviteDivisionId), {
            playerIds: FieldValue.arrayRemove(placeholderRef.id),
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(
            placeholderRef,
            {
              divisionId: null,
              inviteStatus: 'registered',
              isRegistered: true,
              mergedIntoUserId: uid,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });
      }
    }
  }

  return { success: true };
});
