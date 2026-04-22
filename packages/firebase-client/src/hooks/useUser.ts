import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { auth } from '../config';
import { userDoc } from '../collections';
import type { User } from '@tennis/shared';

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

export function useUserProfile(uid: string | null) {
  const [profile, setProfile] = useState<User | null>(null);
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
        setProfile(snap.exists() ? (snap.data() as User) : null);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  return { profile, loading };
}

export async function updateUserProfile(uid: string, updates: Partial<User>): Promise<void> {
  await updateDoc(userDoc(uid), { ...updates, updatedAt: Date.now() });
}

export async function registerFcmToken(uid: string, token: string): Promise<void> {
  const snap = await getDoc(userDoc(uid));
  const existing: string[] = snap.data()?.fcmTokens ?? [];
  if (!existing.includes(token)) {
    await updateDoc(userDoc(uid), { fcmTokens: [...existing, token] });
  }
}
