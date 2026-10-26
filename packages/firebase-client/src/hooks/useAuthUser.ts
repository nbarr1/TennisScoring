import { useState, useEffect } from 'react';
import { onIdTokenChanged, type User as FirebaseUser } from 'firebase/auth';
// firebaseApp, not config: this hook is part of the `/auth` entry, which must
// not pull in Firestore, Storage, Functions, or Messaging.
import { auth } from '../firebaseApp';

type AuthUserState = {
  firebaseUser: FirebaseUser | null;
  /**
   * Whether the signed-in account's email address is verified. Tracked
   * separately because verifying mutates the same `firebaseUser` object, which
   * would not re-render anything; `refreshEmailVerification()` updates it.
   */
  emailVerified: boolean;
  loading: boolean;
  error: Error | null;
};

export function useAuthUser(): AuthUserState {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // onIdTokenChanged rather than onAuthStateChanged: it also fires when
    // refreshEmailVerification() forces a new token after the user verifies.
    const unsub = onIdTokenChanged(
      auth,
      (user) => {
        setFirebaseUser(user);
        setEmailVerified(!!user?.emailVerified);
        setError(null);
        setLoading(false);
      },
      (authError) => {
        setFirebaseUser(null);
        setEmailVerified(false);
        setError(authError instanceof Error ? authError : new Error(String(authError)));
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { firebaseUser, emailVerified, loading, error };
}
