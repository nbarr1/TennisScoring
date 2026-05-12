'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, functions, useAuthUser } from '@tennis/firebase-client';

type InvitePreview = {
  email?: string; // only present when caller is authenticated as the invited address
  name: string;
  divisionId: string | null;
};

export default function AcceptInvitePage(): React.JSX.Element {
  return (
    <Suspense fallback={<InviteLoadingState />}>
      <AcceptInviteContent />
    </Suspense>
  );
}

function InviteLoadingState() {
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.title}>Join Tennis League</h1>
        <p style={styles.muted}>Loading invite…</p>
      </div>
    </main>
  );
}

function AcceptInviteContent(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const { firebaseUser } = useAuthUser();

  const token = useMemo(() => params.get('token')?.trim() ?? '', [params]);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Invite link is missing a token.');
      return;
    }

    const callable = httpsCallable(functions, 'getInvitePreview');
    setLoading(true);
    callable({ token })
      .then((res) => {
        setPreview(res.data as InvitePreview);
      })
      .catch((e) => {
        const message = (e as { message?: string }).message;
        setError(message || 'This invite is invalid or has expired.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function acceptAsCurrentUser() {
    if (!token) return;
    setAccepting(true);
    setError('');
    try {
      const acceptCallable = httpsCallable(functions, 'acceptInvite');
      await acceptCallable({ token });
      setSuccess('Invite accepted. Redirecting you to your profile…');
      setTimeout(() => router.replace('/profile'), 600);
    } catch (e) {
      const message = (e as { message?: string }).message;
      setError(message || 'Could not accept invite.');
    } finally {
      setAccepting(false);
    }
  }

  async function createAccountAndAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || !token) return;

    const targetEmail = preview.email ?? email.trim();
    if (!targetEmail) {
      setError('Please enter your email address.');
      return;
    }

    setAccepting(true);
    setError('');
    try {
      const credential = await createUserWithEmailAndPassword(auth, targetEmail, password);
      await updateProfile(credential.user, { displayName: preview.name });

      const acceptCallable = httpsCallable(functions, 'acceptInvite');
      await acceptCallable({ token });

      const idToken = await credential.user.getIdToken();
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      setSuccess('Welcome! Redirecting you to complete your profile…');
      setTimeout(() => router.replace('/profile'), 600);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        setError('An account already exists for this email. Sign in, then reopen this invite link.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 8 characters.');
      } else {
        const message = (e as { message?: string }).message;
        setError(message || 'Unable to complete invite acceptance.');
      }
    } finally {
      setAccepting(false);
    }
  }

  const signedInMatchesInvite = !!firebaseUser?.email && !!preview?.email &&
    firebaseUser.email.toLowerCase() === preview.email.toLowerCase();

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.title}>Join Tennis League</h1>

        {loading ? (
          <p style={styles.muted}>Loading invite…</p>
        ) : error && !preview ? (
          <>
            <p role="alert" style={styles.error}>{error}</p>
            <Link href="/login" style={styles.link}>Go to login</Link>
          </>
        ) : preview ? (
          <>
            <p style={styles.muted}>
              You were invited as <strong>{preview.name}</strong>
              {preview.email ? ` (${preview.email})` : ''}.
            </p>

            {signedInMatchesInvite ? (
              <button style={styles.button} onClick={acceptAsCurrentUser} disabled={accepting}>
                {accepting ? 'Accepting…' : 'Accept invite'}
              </button>
            ) : (
              <form onSubmit={createAccountAndAccept} style={styles.form}>
                <label style={styles.label}>Name</label>
                <input value={preview.name} readOnly style={{ ...styles.input, background: '#f7f7f7' }} />

                <label style={styles.label}>Email</label>
                {preview.email ? (
                  <input value={preview.email} readOnly style={{ ...styles.input, background: '#f7f7f7' }} />
                ) : (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={styles.input}
                    required
                    placeholder="your@email.com"
                    autoComplete="email"
                  />
                )}

                <label style={styles.label}>Create password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />

                <button style={styles.button} type="submit" disabled={accepting || password.length < 8}>
                  {accepting ? 'Creating account…' : 'Create account & accept invite'}
                </button>
              </form>
            )}

            <p style={styles.small}>
              Already have an account? <Link style={styles.link} href="/login">Log in</Link> and reopen this invite link.
            </p>
          </>
        ) : null}

        {error && preview && <p role="alert" style={styles.error}>{error}</p>}
        {success && <p role="status" aria-live="polite" style={styles.success}>{success}</p>}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 },
  card: { width: '100%', maxWidth: 500, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  title: { margin: 0, marginBottom: 12, color: 'var(--green-dark)', fontSize: 28, fontWeight: 800 },
  muted: { color: '#666', marginBottom: 18 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#444' },
  input: { border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14 },
  button: { marginTop: 8, border: 'none', borderRadius: 10, padding: '12px 14px', background: 'var(--green-dark)', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  error: { marginTop: 12, color: '#c0392b', fontSize: 13 },
  success: { marginTop: 12, color: '#1a7f37', fontSize: 13 },
  small: { marginTop: 14, fontSize: 13, color: '#666' },
  link: { color: 'var(--green-dark)', fontWeight: 600 },
};
