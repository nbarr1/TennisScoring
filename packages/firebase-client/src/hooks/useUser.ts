import { useState, useEffect } from 'react';
import { signOut, type User as FirebaseUser } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  getDoc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type FirestoreError,
} from 'firebase/firestore';
import { auth, db } from '../config';
import { userDoc, profileDoc } from '../collections';
import type { User, PublicProfile } from '@tennis/shared';

export { useAuthUser } from './useAuthUser';

type PrivateUserState = {
  user: User | null;
  loading: boolean;
  error: FirestoreError | null;
};

type PublicProfileState = {
  profile: PublicProfile | null;
  loading: boolean;
  error: FirestoreError | null;
};

/**
 * Hook for the authenticated user's private data (PII).
 * Only accessible by the owner.
 */
export function usePrivateUser(uid: string | null, reloadKey = 0): PrivateUserState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!uid) {
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(
      userDoc(uid),
      (snap) => {
        setUser(snap.exists() ? { ...(snap.data() as User), id: snap.id } : null);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setUser(null);
        setError(snapshotError);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid, reloadKey]);

  return { user, loading, error };
}

/**
 * Hook for public profile data.
 * Accessible by division members.
 */
export function usePublicProfile(uid: string | null, reloadKey = 0): PublicProfileState {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = onSnapshot(
      profileDoc(uid),
      (snap) => {
        setProfile(snap.exists() ? { ...(snap.data() as PublicProfile), id: snap.id } : null);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setProfile(null);
        setError(snapshotError);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid, reloadKey]);

  return { profile, loading, error };
}

/**
 * Creates the signed-in account's users/{uid} document when the server
 * confirms it has none, using the narrow create the security rules allow.
 *
 * Sign-up on both apps relies on the `onUserCreated` blocking function to
 * write that document, and the function runs only on a project with Identity
 * Platform enabled; the targeted deploy workflow does not ship it. Without
 * it, an account that has not yet joined a division by code or accepted an
 * invite has no users document, and the profile page could not load.
 *
 * Reads from the server, not the cache, so being offline throws instead of
 * reading as a missing document.
 */
export async function ensureOwnUserDocument(firebaseUser: FirebaseUser): Promise<'exists' | 'created'> {
  const ref = userDoc(firebaseUser.uid);
  if ((await getDocFromServer(ref)).exists()) return 'exists';
  const email = firebaseUser.email ?? '';
  const displayName = (firebaseUser.displayName?.trim() || email.split('@')[0] || 'Player').slice(0, 100);
  const now = Date.now();
  // Field for field what the rules' `allow create` on users/{userId} accepts.
  await setDoc(ref, {
    id: firebaseUser.uid,
    displayName,
    email,
    phone: null,
    avatarUrl: null,
    contactPreferences: { allowEmail: true, allowSMS: false, allowInApp: true },
    role: 'player',
    divisionId: null,
    fcmTokens: [],
    tipsEnabled: true,
    createdAt: now,
    updatedAt: now,
  } as unknown as User);
  return 'created';
}

/** @deprecated Use usePrivateUser or usePublicProfile */
export const useUserProfile = usePublicProfile;

export async function updateUserProfile(uid: string, updates: Partial<User>): Promise<void> {
  const batch = writeBatch(db);
  const now = Date.now();

  // Update private user doc
  // Firestore rejects an update carrying an undefined value, and
  // buildUserProfileUpdates() uses undefined for a cleared field (a player with
  // no phone number, for example), so every such save used to throw. A key
  // passed as undefined now deletes that field; deleting an absent field is a
  // no-op that the rules don't count as a change.
  const privateUpdates: Record<string, unknown> = { updatedAt: now };
  for (const [key, value] of Object.entries(updates)) {
    privateUpdates[key] = value === undefined ? deleteField() : value;
  }
  batch.update(userDoc(uid), privateUpdates);

  // If public fields are changed, sync with profiles doc
  // A mirrored key passed as undefined is deleted from the profile too, so
  // clearing a division doesn't leave profiles/{uid} naming the old one.
  const publicUpdates: Record<string, unknown> = {};
  for (const key of ['displayName', 'avatarUrl', 'divisionId', 'role', 'tutorialDone'] as const) {
    if (!(key in updates)) continue;
    const value = updates[key];
    publicUpdates[key] = value === undefined ? deleteField() : value;
  }

  if (Object.keys(publicUpdates).length > 0) {
    // set+merge (not update) so this still succeeds if profiles/{uid} hasn't been created yet.
    batch.set(profileDoc(uid), { id: uid, ...publicUpdates, updatedAt: now }, { merge: true });
  }

  await batch.commit();
}

/** The rules cap `users/{uid}.fcmTokens` at this many entries. */
const MAX_PUSH_TOKENS = 20;

/** The token this device registered, so signing out can release it. */
let registeredPushToken: { uid: string; token: string } | null = null;

/**
 * Deliberately does not bump `updatedAt`, and writes nothing when the token is
 * already registered. Any write here rewrites the doc on every launch, which
 * fires the `usePrivateUser` snapshot listener, which hands AuthGate a fresh
 * `profile` identity, which re-runs its redirect effect for a value that did not
 * change.
 *
 * At the rules' cap the oldest tokens give way. A plain `arrayUnion` past the
 * cap is rejected, which left an account with 20 stale tokens unable to
 * register any new device.
 */
export async function registerFcmToken(uid: string, token: string): Promise<void> {
  registeredPushToken = { uid, token };
  const current = ((await getDoc(userDoc(uid))).data()?.fcmTokens ?? []).filter(
    (existing): existing is string => typeof existing === 'string',
  );
  if (current.includes(token)) return;
  if (current.length < MAX_PUSH_TOKENS) {
    await updateDoc(userDoc(uid), { fcmTokens: arrayUnion(token) });
    return;
  }
  await updateDoc(userDoc(uid), {
    fcmTokens: [...current.slice(-(MAX_PUSH_TOKENS - 1)), token],
  });
}

/**
 * Removes this device's push token from the account it was registered for.
 *
 * Tokens belong to a device, not an account: without this, the next person to
 * sign in on a shared device kept receiving the previous account's
 * notifications, message text included.
 */
export async function releasePushToken(): Promise<void> {
  const registered = registeredPushToken;
  registeredPushToken = null;
  if (!registered) return;
  await updateDoc(userDoc(registered.uid), { fcmTokens: arrayRemove(registered.token) });
}

/** Signs out of Firebase Auth after releasing this device's push token. */
export async function signOutReleasingPushToken(): Promise<void> {
  try {
    await releasePushToken();
  } catch {
    // Best effort: a failed release must never keep someone signed in.
  }
  await signOut(auth);
}
