'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthUser, updateUserProfile } from '@tennis/firebase-client';
import {
  IconArrowLeft, IconBallTennis, IconCircleCheck, IconClipboardList, IconMessageCircle, IconTarget, IconTrophy,
} from '@tabler/icons-react';
import { Button, InlineAlert, color, describeError, radius, space, target, type } from '../../shared/ui';

const SLIDES = [
  {
    Icon: IconBallTennis,
    title: 'Welcome to Tennis League',
    body: "Schedule matches, keep score, and follow your division's standings, all in one place.",
  },
  {
    Icon: IconTarget,
    title: 'Score matches live',
    body: 'In the mobile app, tap to record each point as you play. Anyone following on the web sees the score update in real time.',
  },
  {
    Icon: IconClipboardList,
    title: 'Record past matches',
    body: 'Already played? Enter the set scores afterward. Your opponent confirms the result, then the standings update.',
  },
  {
    Icon: IconCircleCheck,
    title: 'Confirm every result',
    body: 'After a match, one player reports the score and the other side confirms or disputes it, so every result is agreed.',
  },
  {
    Icon: IconMessageCircle,
    title: 'Message other players',
    body: "Chat in your division's channel or start a direct message to set up your next match.",
  },
  {
    Icon: IconTrophy,
    title: "You're all set",
    body: 'Propose your first match and start climbing the standings. Good luck on the court.',
  },
] as const;

export default function WebTutorialPage(): React.JSX.Element {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;

  // Keyboard and screen-reader users land on the new step's heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [index]);

  const finish = useCallback(async () => {
    if (finishing) return;
    if (!firebaseUser) {
      setError(authLoading ? 'Still signing you in. Try again in a moment.' : 'Your session has expired. Sign in again to continue.');
      return;
    }

    setFinishing(true);
    setError(null);
    try {
      await updateUserProfile(firebaseUser.uid, { tutorialDone: true });
      // The dashboard only sends players here once they have a division, and offers
      // division onboarding itself to anyone who reaches it without one.
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(describeError(err, "Couldn't finish the tutorial. Try again."));
      setFinishing(false);
    }
  }, [authLoading, finishing, firebaseUser, router]);

  const next = useCallback(() => {
    if (isLast) {
      void finish();
    } else {
      setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    }
  }, [finish, isLast]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Arrow keys step through the slides, unless focus is in a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (finishing || event.altKey || event.ctrlKey || event.metaKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowRight' && !isLast) {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        back();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, finishing, isLast, next]);

  return (
    <main style={styles.root}>
      <div style={styles.topBar}>
        <span style={styles.counter}>Step {index + 1} of {SLIDES.length}</span>
        {!isLast ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => void finish()}
            pending={finishing}
            pendingLabel="Skipping…"
            className="tl-btn--on-dark"
            style={styles.skipBtn}
          >
            Skip tutorial
          </Button>
        ) : null}
      </div>

      <div style={styles.content}>
        <div style={styles.icon}>
          <slide.Icon size={80} stroke={1.5} color={color.ballYellow} aria-hidden="true" />
        </div>
        <h1 ref={headingRef} tabIndex={-1} style={styles.title}>{slide.title}</h1>
        <p style={styles.body}>{slide.body}</p>
        {error ? <InlineAlert tone="error" style={styles.error}>{error}</InlineAlert> : null}
      </div>

      <div style={styles.dots} aria-hidden="true">
        {SLIDES.map((_, i) => (
          <span key={i} style={{ ...styles.dot, ...(i === index ? styles.dotActive : {}) }} />
        ))}
      </div>

      <div style={styles.actions}>
        {!isFirst ? (
          <Button
            variant="quiet"
            onClick={back}
            disabled={finishing}
            icon={<IconArrowLeft size={18} aria-hidden="true" />}
            className="tl-btn--on-dark"
            style={styles.backBtn}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={next}
          pending={finishing && isLast}
          pendingLabel="Starting…"
          disabled={finishing && !isLast}
          className="tl-btn--on-dark"
          style={styles.nextBtn}
        >
          {isLast ? 'Get started' : 'Next'}
        </Button>
      </div>
    </main>
  );
}

// The tutorial sits on Clubhouse Green: white text, Ball Yellow for the icon,
// the current-step dot, and the main action (yellow carries text only on green).
const ON_GREEN_MUTED = 'rgba(255, 255, 255, 0.85)';

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${space.xl}px ${space.lg}px`,
    background: color.brandFill,
    color: color.onBrand,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: `${space.sm}px ${space.lg}px`,
  },
  counter: { ...type.label, color: ON_GREEN_MUTED, fontVariantNumeric: 'tabular-nums' },
  skipBtn: { color: color.onBrand, textDecoration: 'underline', textUnderlineOffset: 3 },
  content: { textAlign: 'center', maxWidth: 480, width: '100%', marginTop: space.xxxl },
  icon: { marginBottom: space.xl, display: 'flex', justifyContent: 'center' },
  title: { ...type.display, color: color.onBrand, margin: `0 0 ${space.lg}px` },
  body: { ...type.body, fontSize: 17, color: ON_GREEN_MUTED, margin: 0 },
  error: { marginTop: space.lg, textAlign: 'left' },
  dots: { display: 'flex', gap: space.sm, marginTop: space.xxl, marginBottom: space.xxl },
  dot: { width: 8, height: 8, borderRadius: radius.pill, background: 'rgba(255, 220, 96, 0.4)', transition: 'width var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out)' },
  dotActive: { width: 24, background: color.ballYellow },
  actions: { display: 'flex', alignItems: 'center', gap: space.lg, justifyContent: 'space-between', width: '100%', maxWidth: 480 },
  backBtn: { color: color.onBrand },
  nextBtn: {
    background: color.ballYellow,
    color: color.onAccent,
    borderRadius: radius.pill,
    minWidth: 160,
    minHeight: target.control,
    padding: `${space.md}px ${space.xxl}px`,
    fontSize: 16,
    fontWeight: 700,
  },
};
