import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { arrayUnion, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config';
import { userDoc, profileDoc } from '../collections';
import type { User, PublicProfile } from '@tennis/shared';

export function useAuthUser() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { firebaseUser, loading };
}

/**
 * Hook for the authenticated user's private data (PII).
 * Only accessible by the owner.
 */
export function usePrivateUser(uid: string | null) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      userDoc(uid),
      (snap) => {
        setUser(snap.exists() ? { ...(snap.data() as User), id: snap.id } : null);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { user, loading };
}

/**
 * Hook for public profile data.
 * Accessible by division members.
 */
export function usePublicProfile(uid: string | null) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      profileDoc(uid),
      (snap) => {
        setProfile(snap.exists() ? { ...(snap.data() as PublicProfile), id: snap.id } : null);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { profile, loading };
}

/** @deprecated Use usePrivateUser or usePublicProfile */
export const useUserProfile = usePublicProfile;

export async function updateUserProfile(uid: string, updates: Partial<User>): Promise<void> {
  const batch = writeBatch(db);
  const now = Date.now();

  // Update private user doc
  batch.update(userDoc(uid), { ...updates, updatedAt: now });

  // If public fields are changed, sync with profiles doc
  const publicUpdates: Partial<PublicProfile> = {};
  if (updates.displayName !== undefined) publicUpdates.displayName = updates.displayName;
  if (updates.avatarUrl !== undefined) publicUpdates.avatarUrl = updates.avatarUrl;
  if (updates.divisionId !== undefined) publicUpdates.divisionId = updates.divisionId;
  if (updates.role !== undefined) publicUpdates.role = updates.role;
  if (updates.tutorialDone !== undefined) publicUpdates.tutorialDone = updates.tutorialDone;

  if (Object.keys(publicUpdates).length > 0) {
    batch.update(profileDoc(uid), { ...publicUpdates, updatedAt: now });
  }

  await batch.commit();
}

export async function registerFcmToken(uid: string, token: string): Promise<void> {
  await updateDoc(userDoc(uid), { fcmTokens: arrayUnion(token), updatedAt: Date.now() });
}
