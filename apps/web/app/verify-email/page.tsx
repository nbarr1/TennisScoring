'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useState } from 'react';
import { IconMailCheck } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  refreshEmailVerification,
  sendVerificationEmail,
  signOutReleasingPushToken,
  useAuthUser,
} from '@tennis/firebase-client';

// Only same-site paths, so the page cannot be used to redirect elsewhere.
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/dashboard';
  }
  return next;
}

export default function VerifyEmailPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const { firebaseUser } = useAuthUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const nextPath = safeNextPath(params.get('next'));

  async function handleContinue() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const verified = await refreshEmailVerification();
      if (verified) {
        router.replace(nextPath);
        return;
      }
      setError('Your email address is not verified yet. Open the link in the email, then try again.');
    } catch (err) {
      console.error('Failed to refresh verification status:', err);
      setError('Could not check your verification status. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendVerificationEmail();
      setNotice('We sent a new verification link. Check your inbox and spam folder.');
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'auth/too-many-requests'
          ? 'Too many attempts. Wait a few minutes before requesting another email.'
          : 'Could not send the email. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutReleasingPushToken();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.logo}><IconMailCheck size={48} aria-hidden="true" stroke={1.5} color="var(--green-mid)" /></div>
        <h1 style={styles.title}>Verify your email address</h1>
        <p style={styles.body}>
          We sent a verification link to <strong>{firebaseUser?.email ?? 'your email address'}</strong>.
          Open it to confirm the address is yours, then continue.
        </p>

        <button type="button" style={styles.button} onClick={handleContinue} disabled={busy}>
          {busy ? 'Please wait…' : "I've verified my email"}
        </button>
        <button type="button" style={styles.secondaryButton} onClick={handleResend} disabled={busy}>
          Send the email again
        </button>

        {error && <p role="alert" style={styles.error}>{error}</p>}
        {notice && <p role="status" style={styles.notice}>{notice}</p>}

        <button type="button" style={styles.linkButton} onClick={handleSignOut} disabled={busy}>
          Sign out
        </button>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 },
  card: { background: 'white', borderRadius: 20, padding: 40, maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' as const, gap: 14 },
  logo: { fontSize: 48, textAlign: 'center' as const },
  title: { fontSize: 24, fontWeight: 700, color: 'var(--green-dark)', textAlign: 'center' as const, margin: 0 },
  body: { fontSize: 15, color: '#444', textAlign: 'center' as const, lineHeight: 1.5, margin: '0 0 8px', overflowWrap: 'anywhere' as const },
  button: { background: 'var(--green-dark)', color: 'white', border: 'none', borderRadius: 12, padding: '15px 24px', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  secondaryButton: { background: 'white', color: 'var(--green-dark)', border: '1px solid var(--green-dark)', borderRadius: 12, padding: '13px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  linkButton: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', marginTop: 4 },
  error: { fontSize: 13, color: '#c0392b', textAlign: 'center' as const, margin: 0 },
  notice: { fontSize: 13, color: 'var(--green-dark)', textAlign: 'center' as const, margin: 0 },
};
