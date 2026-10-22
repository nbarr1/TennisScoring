'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { IconMailCheck } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  refreshEmailVerification,
  sendVerificationEmail,
  signOutReleasingPushToken,
  useAuthUser,
} from '@tennis/firebase-client';
import { Button, InlineAlert, LoadingBlock, color, describeError, radius, shadow, space, type } from '../shared/ui';
import { safeNextPath } from '../../lib/safeNextPath';

// How long the resend button waits after a send, so players don't trip
// Firebase's rate limit by pressing it repeatedly.
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage(): React.JSX.Element {
  return (
    // A landmark and a heading while the search params resolve, instead of a blank page.
    <Suspense
      fallback={
        <main style={styles.main}>
          <div style={styles.card}>
            <h1 style={styles.title}>Check your email</h1>
            <LoadingBlock label="Loading…" rows={3} />
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

type Pending = 'check' | 'resend' | 'signout' | null;
type Message = { tone: 'error' | 'warning' | 'success'; title?: string; text: string } | null;

function VerifyEmailContent(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<Message>(null);
  const [cooldown, setCooldown] = useState(0);
  // Only same-site paths, so the page cannot be used to redirect elsewhere.
  const nextPath = safeNextPath(params.get('next'));
  const busy = pending !== null;

  // Signed out (or the session expired): nothing here can work, so sign in
  // first and come back to the same place.
  useEffect(() => {
    if (authLoading || firebaseUser || pending === 'signout') return;
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [authLoading, firebaseUser, nextPath, pending, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleContinue() {
    if (busy) return;
    setPending('check');
    setMessage(null);
    try {
      const verified = await refreshEmailVerification();
      if (verified) {
        // Stay pending while the next page loads.
        router.replace(nextPath);
        return;
      }
      setMessage({
        tone: 'warning',
        title: 'Not verified yet',
        text: 'Open the link in the email we sent, then select "I\'ve verified my email" again.',
      });
    } catch (err) {
      console.error('Failed to refresh verification status:', err);
      setMessage({
        tone: 'error',
        text: 'Couldn\'t check your verification status. Check your connection and try again.',
      });
    }
    setPending(null);
  }

  async function handleResend() {
    if (busy || cooldown > 0) return;
    setPending('resend');
    setMessage(null);
    try {
      await sendVerificationEmail();
      setMessage({
        tone: 'success',
        title: 'Email sent',
        text: 'We sent a new verification link. Check your inbox and spam folder.',
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/too-many-requests') {
        setMessage({ tone: 'error', text: 'Too many emails requested. Wait a few minutes before asking for another one.' });
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setMessage({
          tone: 'error',
          text: describeError(err, 'Couldn\'t send the email. Check your connection and try again.'),
        });
      }
    }
    setPending(null);
  }

  async function handleSignOut() {
    if (busy) return;
    setPending('signout');
    try {
      await signOutReleasingPushToken();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  }

  const address = firebaseUser?.email;

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.icon}>
          <IconMailCheck size={48} aria-hidden="true" stroke={1.5} color={color.courtGreen} />
        </div>
        <h1 style={styles.title}>Check your email</h1>
        <p style={styles.body}>
          We sent a verification link to{' '}
          {address ? <strong style={styles.address}>{address}</strong> : 'your email address'}.
          Verifying it keeps your league account secure.
        </p>

        <ol style={styles.steps}>
          <li>Open the email from Tennis League. If it isn&apos;t in your inbox, check spam.</li>
          <li>Select the verification link in it.</li>
          <li>Come back here and select <strong>I&apos;ve verified my email</strong>.</li>
        </ol>

        {message && (
          <InlineAlert tone={message.tone} title={message.title}>
            {message.text}
          </InlineAlert>
        )}

        <div style={styles.actions}>
          <Button
            fullWidth
            pending={pending === 'check'}
            pendingLabel="Checking…"
            disabled={busy && pending !== 'check'}
            onClick={() => void handleContinue()}
          >
            I&apos;ve verified my email
          </Button>
          <Button
            fullWidth
            variant="secondary"
            pending={pending === 'resend'}
            pendingLabel="Sending…"
            disabled={(busy && pending !== 'resend') || cooldown > 0}
            onClick={() => void handleResend()}
          >
            {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the email again'}
          </Button>
        </div>

        <div style={styles.footer}>
          <p style={styles.footerText}>Wrong address? Sign out, then create your account again with the right one.</p>
          <Button
            variant="quiet"
            size="sm"
            pending={pending === 'signout'}
            pendingLabel="Signing out…"
            disabled={busy && pending !== 'signout'}
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: color.canvas,
    padding: `${space.xl}px ${space.lg}px`,
  },
  card: {
    background: color.surface,
    borderRadius: radius.lg,
    padding: 'clamp(24px, 6vw, 40px)',
    maxWidth: 460,
    width: '100%',
    boxShadow: shadow.raised,
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  icon: { display: 'flex', justifyContent: 'center' },
  title: { ...type.display, color: color.clubhouseGreen, textAlign: 'center', margin: 0 },
  body: { ...type.body, color: color.ink, textAlign: 'center', margin: 0, overflowWrap: 'anywhere' },
  address: { fontWeight: 600 },
  steps: {
    ...type.bodySmall,
    color: color.ink,
    margin: 0,
    padding: `${space.md}px ${space.lg}px ${space.md}px ${space.xxl}px`,
    background: color.surfaceMuted,
    borderRadius: radius.md,
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  actions: { display: 'flex', flexDirection: 'column', gap: space.md },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.lg,
    borderTop: `1px solid ${color.border}`,
    textAlign: 'center',
  },
  footerText: { ...type.bodySmall, color: color.textMuted, margin: 0 },
};
