'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrowLeft, IconCopy, IconUsersGroup, IconPlus } from '@tabler/icons-react';
import {
  useAuthUser,
  createDivision,
  joinDivisionByCode,
  getDivision,
  signOutReleasingPushToken,
} from '@tennis/firebase-client';
import {
  Button,
  FieldError,
  InlineAlert,
  authCardStyle,
  authPageStyle,
  color,
  describeError,
  fieldLabelStyle,
  inputInvalidStyle,
  inputStyle,
  radius,
  space,
  target,
  type,
  useAnnounce,
} from '../../shared/ui';

// PLATFORM-SPECIFIC: Web uses the Clipboard API for one-click invite code copying.
type Mode = 'choose' | 'create' | 'join';

const INVITE_CODE_LENGTH = 8;

export default function DivisionOnboardingPage(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('choose');
  const [divisionName, setDivisionName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const announce = useAnnounce();
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's heading so keyboard and screen-reader users
  // land on what changed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [mode, createdInviteCode]);

  function goTo(next: Mode) {
    if (loading) return;
    setError(null);
    setFieldError(null);
    setMode(next);
  }

  async function handleCreate() {
    if (loading) return;
    if (!divisionName.trim()) {
      setFieldError('Enter a name for your division.');
      document.getElementById('division-name')?.focus();
      return;
    }
    if (!firebaseUser) {
      setError(authLoading ? 'Still signing you in. Try again in a moment.' : 'Your session has expired. Sign in again to continue.');
      return;
    }

    setLoading(true);
    setError(null);
    setFieldError(null);
    setCopyStatus(null);
    setCreatedInviteCode(null);

    try {
      const divisionId = await createDivision(divisionName.trim(), firebaseUser.uid, {
        displayName: firebaseUser.displayName ?? undefined,
        email: firebaseUser.email ?? undefined,
      });
      const division = await getDivision(divisionId);

      if (division?.inviteCode) {
        setCreatedInviteCode(division.inviteCode);
        announce('Division created.');
      } else {
        setError('Your division was created, but its invite code couldn\'t be loaded. Continue to the dashboard and reload.');
      }
    } catch (err: unknown) {
      setError(describeError(err, 'Couldn\'t create the division. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (loading) return;
    const code = inviteCode.trim();
    if (!code) {
      setFieldError('Enter the invite code from your division leader.');
      document.getElementById('invite-code')?.focus();
      return;
    }
    if (code.length !== INVITE_CODE_LENGTH) {
      setFieldError(`Invite codes are ${INVITE_CODE_LENGTH} letters and numbers. Check the code and try again.`);
      document.getElementById('invite-code')?.focus();
      return;
    }
    if (!firebaseUser) {
      setError(authLoading ? 'Still signing you in. Try again in a moment.' : 'Your session has expired. Sign in again to continue.');
      return;
    }

    setLoading(true);
    setError(null);
    setFieldError(null);
    try {
      await joinDivisionByCode(code, firebaseUser.uid);
      // Stay pending while the dashboard loads.
      router.replace('/dashboard');
    } catch (err: unknown) {
      const errorCode = String((err as { code?: unknown } | null)?.code ?? '');
      if (errorCode.endsWith('not-found')) {
        setFieldError('That code doesn\'t match a division. Check it with your division leader and try again.');
        document.getElementById('invite-code')?.focus();
      } else {
        setError(describeError(err, 'Couldn\'t join the division. Check the code and try again.'));
      }
      setLoading(false);
    }
  }

  async function copyInviteCode() {
    if (!createdInviteCode) return;

    try {
      await navigator.clipboard.writeText(createdInviteCode);
      setCopyStatus({ ok: true, text: 'Invite code copied.' });
    } catch {
      setCopyStatus({ ok: false, text: 'Couldn\'t copy automatically. Select the code and copy it yourself.' });
    }
  }

  // The only way off this page for someone who signed up with the wrong
  // address, or is here before accepting an emailed invite.
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutReleasingPushToken();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    } finally {
      router.replace('/login');
    }
  }

  const backButton = (
    <Button variant="quiet" size="sm" icon={<IconArrowLeft size={18} aria-hidden="true" />} onClick={() => goTo('choose')} disabled={loading} style={styles.back}>
      Back
    </Button>
  );

  return (
    <main style={styles.root}>
      <div style={styles.card}>
        {createdInviteCode ? (
          <div style={styles.stack}>
            <h1 ref={headingRef} tabIndex={-1} style={styles.title}>Your division is ready</h1>
            <p style={styles.body}>
              You&apos;re the leader of <strong style={styles.strong}>{divisionName.trim()}</strong>. Share this
              invite code so players can join from their own accounts.
            </p>
            <div style={styles.codeRow}>
              <output aria-label="Invite code" style={styles.inviteCodeBox}>{createdInviteCode}</output>
              <Button variant="secondary" icon={<IconCopy size={18} aria-hidden="true" />} onClick={() => void copyInviteCode()}>
                Copy code
              </Button>
            </div>
            {copyStatus ? (
              <InlineAlert tone={copyStatus.ok ? 'success' : 'warning'}>{copyStatus.text}</InlineAlert>
            ) : (
              <p style={styles.hint}>Copy it now: you&apos;ll want it when you invite your players.</p>
            )}
            <Button
              fullWidth
              pending={continuing}
              pendingLabel="Opening dashboard…"
              onClick={() => {
                setContinuing(true);
                router.replace('/dashboard');
              }}
            >
              Continue to dashboard
            </Button>
          </div>
        ) : mode === 'choose' ? (
          <div style={styles.stack}>
            <h1 ref={headingRef} tabIndex={-1} style={styles.title}>Join a division</h1>
            <p style={styles.body}>
              A division is your league&apos;s group of players, with its own seasons, matches, and standings.
            </p>
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
            <button type="button" style={styles.option} className="lift" onClick={() => goTo('join')}>
              <IconUsersGroup size={28} stroke={1.5} aria-hidden="true" color={color.courtGreen} />
              <span style={styles.optionText}>
                <span style={styles.optionTitle}>Join with an invite code</span>
                <span style={styles.optionBody}>Your division leader can give you the code.</span>
              </span>
            </button>
            <button type="button" style={styles.option} className="lift" onClick={() => goTo('create')}>
              <IconPlus size={28} stroke={1.5} aria-hidden="true" color={color.courtGreen} />
              <span style={styles.optionText}>
                <span style={styles.optionTitle}>Create a division</span>
                <span style={styles.optionBody}>For leaders starting a new league. You&apos;ll run its roster and seasons.</span>
              </span>
            </button>
            <div style={styles.footer}>
              <p style={styles.hint}>
                Invited by email? Open the link in that email instead. Signed in with the wrong account?
              </p>
              <Button variant="quiet" size="sm" pending={signingOut} pendingLabel="Signing out…" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </div>
          </div>
        ) : mode === 'create' ? (
          <form
            style={styles.stack}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            {backButton}
            <h1 ref={headingRef} tabIndex={-1} style={styles.title}>Create a division</h1>
            <p style={styles.body}>
              You&apos;ll become its division leader. Next, you&apos;ll get an invite code to share with your players.
            </p>
            <div>
              <label htmlFor="division-name" style={fieldLabelStyle}>Division name</label>
              <input
                id="division-name"
                style={{ ...inputStyle, ...(fieldError ? inputInvalidStyle : {}) }}
                value={divisionName}
                onChange={(e) => {
                  setDivisionName(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                maxLength={80}
                autoComplete="off"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={['division-name-hint', fieldError ? 'division-name-error' : ''].filter(Boolean).join(' ')}
              />
              <div id="division-name-hint" style={styles.hint}>Players see this name, for example &quot;Lunchtime Ladder&quot;.</div>
              <FieldError id="division-name-error">{fieldError}</FieldError>
            </div>
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
            <Button type="submit" fullWidth pending={loading} pendingLabel="Creating division…">
              Create division
            </Button>
          </form>
        ) : (
          <form
            style={styles.stack}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleJoin();
            }}
          >
            {backButton}
            <h1 ref={headingRef} tabIndex={-1} style={styles.title}>Join with an invite code</h1>
            <p style={styles.body}>Enter the code your division leader shared with you.</p>
            <div>
              <label htmlFor="invite-code" style={fieldLabelStyle}>Invite code</label>
              <input
                id="invite-code"
                style={{ ...inputStyle, ...styles.codeInput, ...(fieldError ? inputInvalidStyle : {}) }}
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.replace(/\s+/g, '').toUpperCase());
                  if (fieldError) setFieldError(null);
                }}
                maxLength={INVITE_CODE_LENGTH}
                placeholder="ABCDEF12"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={['invite-code-hint', fieldError ? 'invite-code-error' : ''].filter(Boolean).join(' ')}
              />
              <div id="invite-code-hint" style={styles.hint}>{INVITE_CODE_LENGTH} letters and numbers.</div>
              <FieldError id="invite-code-error">{fieldError}</FieldError>
            </div>
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
            <Button type="submit" fullWidth pending={loading} pendingLabel="Joining division…">
              Join division
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: authPageStyle,
  card: authCardStyle,
  stack: { display: 'flex', flexDirection: 'column', gap: space.lg },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.xs,
    paddingTop: space.lg,
    borderTop: `1px solid ${color.border}`,
  },
  back: { alignSelf: 'flex-start', marginLeft: -space.md, marginBottom: -space.sm },
  title: { ...type.display, color: color.clubhouseGreen, margin: 0 },
  body: { ...type.body, color: color.ink, margin: 0, overflowWrap: 'anywhere' },
  strong: { fontWeight: 600 },
  hint: { ...type.caption, color: color.textMuted, marginTop: space.xs, marginBottom: 0 },
  option: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.md,
    width: '100%',
    minHeight: target.control,
    padding: space.lg,
    textAlign: 'left',
    background: color.surface,
    border: `1px solid ${color.borderStrong}`,
    borderRadius: radius.md,
    color: color.ink,
  },
  optionText: { display: 'flex', flexDirection: 'column', gap: space.xxs },
  optionTitle: { ...type.label, fontSize: 16, color: color.clubhouseGreen },
  optionBody: { ...type.bodySmall, color: color.textMuted },
  codeRow: { display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'stretch' },
  inviteCodeBox: {
    flex: '1 1 180px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: target.control,
    border: `1px dashed ${color.clubhouseGreen}`,
    borderRadius: radius.md,
    padding: `${space.sm}px ${space.md}px`,
    fontFamily: 'var(--font-display)',
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: color.clubhouseGreen,
    background: color.greenSoft,
    userSelect: 'all',
    fontVariantNumeric: 'tabular-nums',
  },
  codeInput: { fontSize: 20, letterSpacing: '0.12em', fontVariantNumeric: 'tabular-nums' },
};
