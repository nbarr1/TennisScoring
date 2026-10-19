'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { IconBallTennis, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { auth, functions, useAuthUser } from '@tennis/firebase-client';
import {
  Button,
  FieldError,
  InlineAlert,
  LoadingBlock,
  buttonClassName,
  buttonStyle,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  shadow,
  space,
  target,
  type,
} from '../../shared/ui';

type InvitePreview = {
  email?: string; // only present when caller is authenticated as the invited address
  name: string;
  divisionId: string | null;
};

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AcceptInvitePage(): React.JSX.Element {
  return (
    <Suspense fallback={<InviteShell><LoadingBlock label="Loading your invite…" rows={3} /></InviteShell>}>
      <AcceptInviteContent />
    </Suspense>
  );
}

function InviteShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <IconBallTennis size={22} aria-hidden="true" color={color.courtGreen} />
          <span>Tennis League</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function AcceptInviteContent(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const { firebaseUser, emailVerified } = useAuthUser();

  const token = useMemo(() => params.get('token')?.trim() ?? '', [params]);
  // Accepting needs a verified address, so an unverified account verifies
  // first and comes back to this invite afterwards.
  const verifyThenReturnHref = `/verify-email?next=${encodeURIComponent(`/invite/accept?token=${encodeURIComponent(token)}`)}`;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);
  const [success, setSuccess] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setLoadError('This invite link is incomplete. Open it again from your invite email, or copy the whole link into your browser.');
      return;
    }

    const callable = httpsCallable(functions, 'getInvitePreview');
    setLoading(true);
    setLoadError('');
    callable({ token })
      .then((res) => {
        setPreview(res.data as InvitePreview);
      })
      .catch((e) => {
        setLoadError(describeError(e, 'This invite is invalid or has expired.'));
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function acceptAsCurrentUser() {
    if (!token || accepting) return;
    if (!emailVerified) {
      router.push(verifyThenReturnHref);
      return;
    }
    setAccepting(true);
    setError('');
    try {
      const acceptCallable = httpsCallable(functions, 'acceptInvite');
      await acceptCallable({ token });
      // Stay pending until the redirect, so the invite cannot be accepted twice.
      setSuccess('Invite accepted. Taking you to your profile…');
      setTimeout(() => router.replace('/profile'), 600);
    } catch (e) {
      setError(describeError(e, 'Couldn\'t accept the invite. Try again.'));
      setAccepting(false);
    }
  }

  async function createAccountAndAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || !token || accepting) return;

    setError('');
    setExistingAccount(false);
    const targetEmail = preview.email ?? email.trim();
    const errors: { email?: string; password?: string } = {};
    if (!preview.email) {
      if (!targetEmail) errors.email = 'Enter the email address this invite was sent to.';
      else if (!EMAIL_PATTERN.test(targetEmail)) errors.email = 'Enter an email address like name@example.com.';
    }
    if (!password) errors.password = 'Create a password.';
    else if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setAccepting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, targetEmail, password);
      await updateProfile(credential.user, { displayName: preview.name });
      // The verify-email page offers a resend, so a failed send is not fatal here.
      await sendEmailVerification(credential.user).catch((sendError: unknown) => {
        console.error('Failed to send verification email:', sendError);
      });

      const idToken = await credential.user.getIdToken();
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      // acceptInvite requires a verified address, so the invite is accepted
      // when the player returns here from the verification page.
      setSuccess('Account created. Next, verify your email address to join the division…');
      setTimeout(() => router.replace(verifyThenReturnHref), 600);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        setExistingAccount(true);
        setError('An account already uses this email address. Sign in to it, then open this invite link again.');
      } else if (code === 'auth/weak-password') {
        setFieldErrors({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters, mixing letters and numbers.` });
        passwordRef.current?.focus();
      } else if (code === 'auth/invalid-email') {
        setFieldErrors({ email: 'Enter an email address like name@example.com.' });
        emailRef.current?.focus();
      } else {
        setError(describeError(e, 'Couldn\'t create your account. Try again.'));
      }
      setAccepting(false);
    }
  }

  const signedInMatchesInvite = !!firebaseUser?.email && !!preview?.email &&
    firebaseUser.email.toLowerCase() === preview.email.toLowerCase();
  // The preview only includes the invited address when the caller is signed
  // in as it, so a signed-in account without one is someone else's.
  const signedInAsSomeoneElse = !!firebaseUser?.email && !!preview && !preview.email;

  if (loading) {
    return (
      <InviteShell>
        <h1 style={styles.title}>Join Tennis League</h1>
        <LoadingBlock label="Loading your invite…" rows={3} />
      </InviteShell>
    );
  }

  if (!preview) {
    return (
      <InviteShell>
        <h1 style={styles.title}>This invite can&apos;t be used</h1>
        <InlineAlert tone="error">{loadError || 'This invite is invalid or has expired.'}</InlineAlert>
        <p style={styles.body}>
          Ask your division leader to send you a new invite. If you already have an account, sign in instead.
        </p>
        <Link href="/login" className={buttonClassName('secondary')} style={buttonStyle('secondary', { fullWidth: true })}>
          Go to sign in
        </Link>
      </InviteShell>
    );
  }

  const fieldStyle = (invalid: boolean): React.CSSProperties => ({
    ...inputStyle,
    ...(invalid ? styles.inputInvalid : {}),
  });

  return (
    <InviteShell>
      <h1 style={styles.title}>You&apos;re invited</h1>
      <p style={styles.body}>
        You&apos;ve been invited to play in Tennis League as{' '}
        <strong style={styles.strong}>{preview.name}</strong>
        {preview.email ? <> ({preview.email})</> : null}.
      </p>

      {signedInMatchesInvite ? (
        <>
          <p style={styles.body}>
            {emailVerified
              ? `Accept the invite${preview.divisionId ? ' to join your division' : ''}. Your profile opens next.`
              : 'Verify your email address first, then come back here to accept.'}
          </p>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          {success && <InlineAlert tone="success">{success}</InlineAlert>}
          <Button fullWidth pending={accepting} pendingLabel="Accepting…" onClick={() => void acceptAsCurrentUser()}>
            {emailVerified ? 'Accept invite' : 'Verify email to accept'}
          </Button>
        </>
      ) : (
        <>
          <p style={styles.body}>
            Create a password to set up your account. We&apos;ll email you a link to verify your address, then
            bring you back here to finish{preview.divisionId ? ' joining your division' : ''}.
          </p>

          {signedInAsSomeoneElse && (
            <InlineAlert tone="warning" title="You're signed in with a different address">
              You&apos;re signed in as {firebaseUser?.email}, but this invite was sent to another address. Create the
              account below with the invited address, or sign in with that address and open this link again.
            </InlineAlert>
          )}

          <form onSubmit={createAccountAndAccept} style={styles.form} noValidate>
            <div>
              <label htmlFor="invite-name" style={fieldLabelStyle}>Name</label>
              <input id="invite-name" value={preview.name} readOnly aria-describedby="invite-name-hint" style={{ ...inputStyle, ...styles.readOnly }} />
              <div id="invite-name-hint" style={styles.hint}>From your invite. You can change it later on your profile.</div>
            </div>

            <div>
              <label htmlFor="invite-email" style={fieldLabelStyle}>Email</label>
              {preview.email ? (
                <input id="invite-email" value={preview.email} readOnly style={{ ...inputStyle, ...styles.readOnly }} />
              ) : (
                <>
                  <input
                    ref={emailRef}
                    id="invite-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((c) => ({ ...c, email: undefined }));
                    }}
                    style={fieldStyle(!!fieldErrors.email)}
                    required
                    placeholder="name@example.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={fieldErrors.email ? true : undefined}
                    aria-describedby={['invite-email-hint', fieldErrors.email ? 'invite-email-error' : ''].filter(Boolean).join(' ')}
                  />
                  <div id="invite-email-hint" style={styles.hint}>Use the address your invite email was sent to.</div>
                  <FieldError id="invite-email-error">{fieldErrors.email}</FieldError>
                </>
              )}
            </div>

            <div>
              <label htmlFor="invite-password" style={fieldLabelStyle}>Create a password</label>
              <div style={styles.passwordWrap}>
                <input
                  ref={passwordRef}
                  id="invite-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((c) => ({ ...c, password: undefined }));
                  }}
                  style={{ ...fieldStyle(!!fieldErrors.password), paddingRight: target.min + space.sm }}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={['invite-password-hint', fieldErrors.password ? 'invite-password-error' : ''].filter(Boolean).join(' ')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                  aria-controls="invite-password"
                  aria-label="Show password"
                  style={styles.revealBtn}
                >
                  {showPassword ? <IconEyeOff size={20} aria-hidden="true" /> : <IconEye size={20} aria-hidden="true" />}
                </button>
              </div>
              <div id="invite-password-hint" style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</div>
              <FieldError id="invite-password-error">{fieldErrors.password}</FieldError>
            </div>

            {error && (
              <InlineAlert
                tone="error"
                action={existingAccount ? (
                  <Link href="/login" className={buttonClassName('secondary')} style={buttonStyle('secondary', { size: 'sm' })}>
                    Go to sign in
                  </Link>
                ) : undefined}
              >
                {error}
              </InlineAlert>
            )}
            {success && <InlineAlert tone="success">{success}</InlineAlert>}

            <Button type="submit" fullWidth pending={accepting} pendingLabel="Creating account…">
              Create account and accept invite
            </Button>
          </form>

          <p style={styles.small}>
            Already have an account?{' '}
            <Link style={styles.link} href="/login">Sign in</Link>, then open this invite link again.
          </p>
        </>
      )}
    </InviteShell>
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
    width: '100%',
    maxWidth: 500,
    background: color.surface,
    borderRadius: radius.lg,
    padding: 'clamp(24px, 6vw, 36px)',
    boxShadow: shadow.raised,
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 18,
    color: color.clubhouseGreen,
  },
  title: { ...type.display, color: color.clubhouseGreen, margin: 0 },
  body: { ...type.body, color: color.ink, margin: 0, overflowWrap: 'anywhere' },
  strong: { fontWeight: 600 },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg },
  readOnly: { background: color.surfaceMuted, border: `1px solid ${color.border}`, color: color.ink },
  inputInvalid: { border: `1px solid ${color.destructive}`, boxShadow: `inset 0 0 0 1px ${color.destructive}` },
  hint: { ...type.caption, color: color.textMuted, marginTop: space.xs },
  passwordWrap: { position: 'relative' },
  revealBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: target.min,
    height: target.min,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    color: color.textMuted,
  },
  small: { ...type.bodySmall, color: color.textMuted, margin: 0 },
  link: {
    color: color.clubhouseGreen,
    fontWeight: 600,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    display: 'inline-block',
    padding: `${space.sm}px 0`,
  },
};
