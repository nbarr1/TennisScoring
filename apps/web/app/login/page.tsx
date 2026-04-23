'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@tennis/firebase-client';

type Mode = 'signin' | 'signup';

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: displayName.trim() });
        user = credential.user;
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        user = credential.user;
      }

      // Exchange the Firebase ID token for a server-side session cookie via the middleware's loginPath
      const idToken = await user.getIdToken();
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      router.replace('/dashboard');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Incorrect email or password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.logo}>🎾</div>
        <h1 style={styles.title}>Tennis League</h1>
        <p style={styles.subtitle}>Work Tennis Scoring & Rankings</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'signup' && (
            <div style={styles.field}>
              <label htmlFor="displayName" style={styles.label}>Display Name</label>
              <input
                id="displayName"
                name="displayName"
                style={styles.input}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                autoComplete="name"
              />
            </div>
          )}

          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>Email</label>
            <input
              id="email"
              name="email"
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>Password</label>
            <input
              id="password"
              name="password"
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }} type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button style={styles.toggleBtn} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
          {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' },
  card: { background: 'white', borderRadius: 20, padding: 48, maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { fontSize: 56, textAlign: 'center' as const, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: 700, color: 'var(--green-dark)', textAlign: 'center' as const, marginBottom: 6 },
  subtitle: { fontSize: 15, color: 'var(--muted)', textAlign: 'center' as const, marginBottom: 32 },
  form: { display: 'flex', flexDirection: 'column' as const, gap: 16 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#444' },
  input: { border: '1px solid #ddd', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#111', outline: 'none' },
  error: { fontSize: 13, color: '#c0392b', textAlign: 'center' as const },
  button: { background: 'var(--green-dark)', color: 'white', border: 'none', borderRadius: 12, padding: '15px 24px', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  toggleBtn: { marginTop: 20, background: 'none', border: 'none', color: 'var(--green-dark)', fontSize: 14, fontWeight: 500, cursor: 'pointer', width: '100%' },
};
