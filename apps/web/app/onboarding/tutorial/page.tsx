'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthUser, updateUserProfile } from '@tennis/firebase-client';

const SLIDES = [
  {
    icon: '🎾',
    title: 'Welcome to Tennis League',
    body: 'Track every match, climb the rankings, and stay connected with your division — all in one place.',
    bg: '#1a472a',
  },
  {
    icon: '🎯',
    title: 'Score Live Matches',
    body: 'Players score live matches in the mobile app — tap to record each point. Web shows the live score in real time.',
    bg: '#2d6a4f',
  },
  {
    icon: '📋',
    title: 'Record Past Matches',
    body: 'Already played? Log the set scores after the fact. Your opponent confirms, and rankings update instantly.',
    bg: '#1b4332',
  },
  {
    icon: '✅',
    title: 'Confirm Match Reports',
    body: 'After a match ends, one player submits the score. The other confirms or disputes — keeping everything fair.',
    bg: '#134a22',
  },
  {
    icon: '💬',
    title: 'Message Teammates',
    body: 'Chat in the division channel or start a direct message. Share your contact info with a single tap.',
    bg: '#0d3b1e',
  },
  {
    icon: '🏆',
    title: "You're All Set!",
    body: 'Win matches, earn ranking points, and claim the top spot. Good luck on the court!',
    bg: '#1a472a',
  },
] as const;

export default function WebTutorialPage(): React.JSX.Element {
  const router = useRouter();
  const { firebaseUser } = useAuthUser();
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  async function finish() {
    if (!firebaseUser) return;

    setFinishing(true);
    setError(null);
    try {
      await updateUserProfile(firebaseUser.uid, { tutorialDone: true });
      router.push('/onboarding/division');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not finish tutorial. Please try again.');
      setFinishing(false);
    }
  }

  function next() {
    if (isLast) {
      void finish();
    } else {
      setIndex(index + 1);
    }
  }

  return (
    <div style={{ ...styles.root, background: slide.bg }}>
      <div style={styles.content}>
        <div style={styles.icon}>{slide.icon}</div>
        <h1 style={styles.title}>{slide.title}</h1>
        <p style={styles.body}>{slide.body}</p>
        {error ? <p style={styles.error}>{error}</p> : null}
      </div>

      <div style={styles.dots}>
        {SLIDES.map((_, i) => (
          <span key={i} style={{ ...styles.dot, ...(i === index ? styles.dotActive : {}) }} />
        ))}
      </div>

      <div style={styles.actions}>
        {!isLast ? (
          <button style={styles.skipBtn} onClick={() => void finish()} disabled={finishing}>
            {finishing ? 'Loading…' : 'Skip'}
          </button>
        ) : (
          <span />
        )}
        <button style={styles.nextBtn} onClick={next} disabled={finishing}>
          {finishing ? 'Loading…' : isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, transition: 'background 0.3s' },
  content: { textAlign: 'center', maxWidth: 480 },
  icon: { fontSize: 80, marginBottom: 24 },
  title: { fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 16, lineHeight: 1.2 },
  body: { fontSize: 17, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 },
  error: { marginTop: 14, color: '#ffe4e1', fontWeight: 600 },
  dots: { display: 'flex', gap: 8, marginTop: 40, marginBottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, background: 'rgba(255,220,96,0.4)', transition: 'all 0.3s' },
  dotActive: { width: 24, background: '#ffdc60' },
  actions: { display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'space-between', width: '100%', maxWidth: 480 },
  skipBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: 500, cursor: 'pointer', padding: 12 },
  nextBtn: { background: '#ffdc60', color: '#1a472a', border: 'none', borderRadius: 28, padding: '14px 36px', fontWeight: 800, fontSize: 16, cursor: 'pointer', marginLeft: 'auto' },
};
