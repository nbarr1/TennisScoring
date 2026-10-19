'use client';

export const dynamic = 'force-dynamic';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { IconBallTennis, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@tennis/firebase-client';
import {
  Button,
  FieldError,
  InlineAlert,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  shadow,
  space,
  target,
  type,
} from '../shared/ui';

type Mode = 'signin' | 'signup';
type FieldName = 'displayName' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

const MIN_PASSWORD_LENGTH = 8;
// A light check only: Firebase is the authority on what counts as an address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorCode(error: unknown): string {
  return String((error as { code?: string } | null)?.code ?? '');
}

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const busy = submitting || sendingReset;

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const isSignup = mode === 'signup';

  function clearMessages() {
    setError('');
    setNotice('');
    setExistingAccount(false);
  }

  function switchMode(next: Mode) {
    if (next === mode || busy) return;
    setMode(next);
    setFieldErrors({});
    clearMessages();
  }

  function focusField(name: FieldName) {
    const ref = name === 'displayName' ? nameRef : name === 'email' ? emailRef : passwordRef;
    ref.current?.focus();
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (isSignup && !displayName.trim()) {
      errors.displayName = 'Enter your name.';
    }
    if (!trimmedEmail) {
      errors.email = 'Enter your email address.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Enter an email address like name@example.com.';
    }
    if (!password) {
      errors.password = isSignup ? 'Create a password.' : 'Enter your password.';
    } else if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return errors;
  }

  async function handleForgotPassword() {
    if (busy) return;
    clearMessages();
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldErrors({ email: 'Enter your email address, then select "Forgot password?" again.' });
      focusField('email');
      return;
    }
    setFieldErrors({});
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
    } catch (err: unknown) {
      const code = authErrorCode(err);
      if (code === 'auth/invalid-email') {
        setFieldErrors({ email: 'Enter an email address like name@example.com.' });
        focusField('email');
        return;
      }
      if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Wait a few minutes and try again.');
        return;
      }
      if (code === 'auth/network-request-failed') {
        setError(describeError(err));
        return;
      }
      // Any other failure, including an unknown address, gets the same neutral
      // message, so the form never reveals which addresses have accounts.
    } finally {
      setSendingReset(false);
    }
    setNotice(`If an account exists for ${trimmed}, we sent it a password reset link. Check your inbox and spam folder.`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    clearMessages();

    const errors = validate();
    setFieldErrors(errors);
    const firstInvalid = (['displayName', 'email', 'password'] as const).find((name) => errors[name]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    const trimmedEmail = email.trim();
    try {
      let user;
      if (isSignup) {
        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await updateProfile(credential.user, { displayName: displayName.trim() });
        user = credential.user;
        // The verify-email page offers a resend, so a failed send is not fatal here.
        await sendEmailVerification(user).catch((sendError: unknown) => {
          console.error('Failed to send verification email:', sendError);
        });
      } else {
        const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        user = credential.user;
      }

      // Exchange the Firebase ID token for a server-side session cookie via the middleware's loginPath
      const idToken = await user.getIdToken();
      const sessionResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!sessionResponse.ok) {
        throw new Error('session');
      }

      // Stay pending until the next page takes over, so the form cannot be sent twice.
      router.replace(user.emailVerified ? '/dashboard' : '/verify-email');
    } catch (err: unknown) {
      const code = authErrorCode(err);
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('That email and password don\'t match an account. Check them and try again, or reset your password.');
      } else if (code === 'auth/email-already-in-use') {
        setExistingAccount(true);
        setError('An account already uses this email address. Sign in to it instead, or use a different address.');
      } else if (code === 'auth/weak-password') {
        setFieldErrors({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters, mixing letters and numbers.` });
        focusField('password');
      } else if (code === 'auth/invalid-email') {
        setFieldErrors({ email: 'Enter an email address like name@example.com.' });
        focusField('email');
      } else if (code === 'auth/user-disabled') {
        setError('This account has been turned off. Ask your division leader or an app administrator for help.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Wait a few minutes, or reset your password.');
      } else if (err instanceof Error && err.message === 'session') {
        setError('You\'re signed in, but the web session couldn\'t start. Try again.');
      } else {
        setError(describeError(err));
      }
      setSubmitting(false);
    }
  }

  function fieldProps(name: FieldName) {
    const message = fieldErrors[name];
    const hintId = name === 'password' && isSignup ? 'password-hint' : undefined;
    const errorId = message ? `${name}-error` : undefined;
    return {
      'aria-invalid': message ? true : undefined,
      'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      style: { ...inputStyle, ...(message ? styles.inputInvalid : {}) },
    };
  }

  function updateField(name: FieldName, value: string) {
    if (name === 'displayName') setDisplayName(value);
    if (name === 'email') setEmail(value);
    if (name === 'password') setPassword(value);
    if (fieldErrors[name]) setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  const passwordProps = fieldProps('password');

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <IconBallTennis size={48} aria-hidden="true" stroke={1.5} color={color.courtGreen} />
          <p style={styles.brandName}>Tennis League</p>
          <p style={styles.tagline}>Schedule matches, keep score, and follow your division&apos;s standings.</p>
        </div>

        <div role="group" aria-label="Choose how to continue" style={styles.switcher}>
          {(['signin', 'signup'] as const).map((option) => {
            const selected = mode === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => switchMode(option)}
                disabled={busy && !selected}
                style={{ ...styles.switchOption, ...(selected ? styles.switchOptionSelected : {}) }}
              >
                {option === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            );
          })}
        </div>

        <h1 style={styles.title}>{isSignup ? 'Create your account' : 'Sign in to your account'}</h1>
        {isSignup && (
          <p style={styles.lead}>
            We&apos;ll email you a link to verify your address. After that, you can join your division.
          </p>
        )}

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          {isSignup && (
            <div>
              <label htmlFor="displayName" style={fieldLabelStyle}>Name</label>
              <input
                ref={nameRef}
                id="displayName"
                name="displayName"
                type="text"
                value={displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                required
                maxLength={80}
                autoComplete="name"
                autoCapitalize="words"
                {...fieldProps('displayName')}
              />
              <FieldError id="displayName-error">{fieldErrors.displayName}</FieldError>
            </div>
          )}

          <div>
            <label htmlFor="email" style={fieldLabelStyle}>Email</label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="name@example.com"
              required
              autoComplete={isSignup ? 'email' : 'username'}
              autoCapitalize="none"
              spellCheck={false}
              {...fieldProps('email')}
            />
            <FieldError id="email-error">{fieldErrors.email}</FieldError>
          </div>

          <div>
            <div style={styles.labelRow}>
              <label htmlFor="password" style={{ ...fieldLabelStyle, marginBottom: 0 }}>Password</label>
              {!isSignup && (
                <button
                  type="button"
                  style={styles.forgotBtn}
                  onClick={() => void handleForgotPassword()}
                  aria-disabled={busy || undefined}
                  aria-busy={sendingReset || undefined}
                >
                  {sendingReset ? 'Sending link…' : 'Forgot password?'}
                </button>
              )}
            </div>
            <div style={styles.passwordWrap}>
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => updateField('password', e.target.value)}
                required
                minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                autoCapitalize="none"
                spellCheck={false}
                {...passwordProps}
                style={{ ...passwordProps.style, paddingRight: target.min + space.sm }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-controls="password"
                aria-label="Show password"
                style={styles.revealBtn}
              >
                {showPassword ? <IconEyeOff size={20} aria-hidden="true" /> : <IconEye size={20} aria-hidden="true" />}
              </button>
            </div>
            {isSignup && (
              <div id="password-hint" style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</div>
            )}
            <FieldError id="password-error">{fieldErrors.password}</FieldError>
          </div>

          {error && (
            <InlineAlert
              tone="error"
              action={existingAccount ? (
                <Button size="sm" variant="secondary" onClick={() => switchMode('signin')}>Sign in instead</Button>
              ) : undefined}
            >
              {error}
            </InlineAlert>
          )}
          {notice && <InlineAlert tone="success" title="Check your email">{notice}</InlineAlert>}

          <Button
            type="submit"
            fullWidth
            pending={submitting}
            pendingLabel={isSignup ? 'Creating account…' : 'Signing in…'}
            disabled={sendingReset}
            style={{ marginTop: space.xs }}
          >
            {isSignup ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <Link href="/privacy" style={styles.privacyLink}>
          Privacy policy
        </Link>
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
    maxWidth: 440,
    width: '100%',
    boxShadow: shadow.raised,
  },
  brand: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: space.xs, marginBottom: space.xl },
  brandName: { ...type.display, color: color.clubhouseGreen, margin: 0 },
  tagline: { ...type.bodySmall, color: color.textMuted, margin: 0, maxWidth: 300 },
  switcher: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: space.xs,
    padding: space.xs,
    background: color.surfaceMuted,
    borderRadius: radius.md + space.xs,
    marginBottom: space.xl,
  },
  switchOption: {
    ...type.label,
    minHeight: target.min,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radius.md,
    background: 'transparent',
    color: color.textMuted,
    padding: `0 ${space.sm}px`,
  },
  switchOptionSelected: {
    background: color.surface,
    color: color.clubhouseGreen,
    borderColor: color.border,
    boxShadow: shadow.card,
  },
  title: { ...type.headline, color: color.ink, margin: `0 0 ${space.sm}px` },
  lead: { ...type.bodySmall, color: color.textMuted, margin: `0 0 ${space.sm}px` },
  form: { display: 'flex', flexDirection: 'column', gap: space.lg, marginTop: space.lg },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: space.xs },
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
  forgotBtn: {
    ...type.label,
    minHeight: target.min,
    margin: `-${space.md}px 0`,
    padding: `0 ${space.xs}px`,
    background: 'none',
    border: 'none',
    color: color.clubhouseGreen,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  privacyLink: {
    ...type.bodySmall,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: target.min,
    width: 'fit-content',
    margin: `${space.lg}px auto 0`,
    padding: `0 ${space.sm}px`,
    color: color.textMuted,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
};
