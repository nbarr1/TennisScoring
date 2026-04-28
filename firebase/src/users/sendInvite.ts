import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();

type SendInviteInput = {
  email?: string;
  name?: string;
  divisionId?: string;
};

type InvitePreviewInput = { token?: string };
type AcceptInviteInput = { token?: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function inviteLinkForToken(token: string): string {
  const appUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return `${appUrl.replace(/\/$/, '')}/invite/accept?token=${encodeURIComponent(token)}`;
}

export const sendInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to invite users.');
  }

  const { email, name, divisionId } = (request.data ?? {}) as SendInviteInput;
  const safeEmail = email ? normalizeEmail(email) : '';
  const safeName = name?.trim() ?? '';

  if (!safeEmail || !safeName) {
    throw new HttpsError('invalid-argument', 'Name and email are required.');
  }

  const db = getFirestore();
  const inviterId = request.auth.uid;

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
    throw new HttpsError('permission-denied', 'Only admins or division leaders can invite users.');
  }

  const token = crypto.randomUUID();
  const inviteLink = inviteLinkForToken(token);

  await db.collection('invites').doc(token).set({
    token,
    email: safeEmail,
    name: safeName,
    invitedBy: inviterId,
    invitedAt: FieldValue.serverTimestamp(),
    accepted: false,
    ...(divisionId ? { divisionId } : {}),
  });

  // Compatible with Firebase Trigger Email extension if installed.
  await db.collection('mail').add({
    to: [safeEmail],
    message: {
      subject: 'You are invited to Tennis League',
      text: `${safeName}, you were invited to join Tennis League. Open this link to create your account and finish your profile: ${inviteLink}`,
      html: `<p>Hi ${safeName},</p><p>You were invited to join Tennis League.</p><p><a href="${inviteLink}">Accept invite</a> to create your account and finish your profile.</p>`,
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
  const inviteSnap = await db.collection('invites').doc(safeToken).get();
  if (!inviteSnap.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }

  const invite = inviteSnap.data();
  if (!invite || invite.accepted) {
    throw new HttpsError('failed-precondition', 'Invite has already been used.');
  }

  return {
    email: invite.email,
    name: invite.name,
    divisionId: invite.divisionId ?? null,
  };
});

export const acceptInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first to accept this invite.');
  }

  const { token } = (request.data ?? {}) as AcceptInviteInput;
  const safeToken = token?.trim();
  if (!safeToken) {
    throw new HttpsError('invalid-argument', 'Invite token is required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  const authEmail = normalizeEmail(request.auth.token.email ?? '');

  if (!authEmail) {
    throw new HttpsError('failed-precondition', 'Your account must include an email address.');
  }

  const inviteRef = db.collection('invites').doc(safeToken);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const [inviteSnap, userSnap] = await Promise.all([tx.get(inviteRef), tx.get(userRef)]);

    if (!inviteSnap.exists) {
      throw new HttpsError('not-found', 'Invite not found.');
    }

    const invite = inviteSnap.data();
    if (!invite) {
      throw new HttpsError('not-found', 'Invite not found.');
    }

    if (invite.accepted) {
      throw new HttpsError('already-exists', 'Invite already accepted.');
    }

    if (normalizeEmail(invite.email ?? '') !== authEmail) {
      throw new HttpsError('permission-denied', 'This invite is for a different email address.');
    }

    tx.update(inviteRef, {
      accepted: true,
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedBy: uid,
    });

    if (userSnap.exists) {
      tx.set(userRef, {
        displayName: userSnap.data()?.displayName || invite.name,
        updatedAt: FieldValue.serverTimestamp(),
        ...(invite.divisionId ? { divisionId: invite.divisionId } : {}),
      }, { merge: true });
    }

    if (invite.divisionId) {
      const divisionRef = db.collection('divisions').doc(invite.divisionId);
      tx.update(divisionRef, {
        playerIds: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { success: true };
});
