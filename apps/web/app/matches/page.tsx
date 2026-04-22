'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onSnapshot } from 'firebase/firestore';
import { divisionMatchesQuery } from '@tennis/firebase-client';
import { formatScoreDisplay } from '@tennis/shared';
import type { Match } from '@tennis/shared';

const DIVISION_ID = process.env.NEXT_PUBLIC_DIVISION_ID ?? 'default';

const STATUS_COLOR: Record<string, string> = {
  in_progress: '#27ae60',
  completed: '#555',
  disputed: '#e67e22',
  scheduled: '#aaa',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: '● LIVE',
  completed: 'Final',
  disputed: '⚠ Disputed',
  scheduled: 'Scheduled',
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = divisionMatchesQuery(DIVISION_ID);
    return onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match));
      setLoading(false);
    });
  }, []);

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.navBrand}>🎾 Tennis League</span>
        <div style={styles.navLinks}>
          <Link href="/dashboard" style={styles.navLink}>Rankings</Link>
          <Link href="/matches" style={{ ...styles.navLink, ...styles.navLinkActive }}>Matches</Link>
          <Link href="/messages" style={styles.navLink}>Messages</Link>
          <Link href="/admin" style={styles.navLink}>Admin</Link>
        </div>
      </nav>

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Matches</h1>

        {loading ? (
          <div style={styles.placeholder}>Loading matches…</div>
        ) : matches.length === 0 ? (
          <div style={styles.emptyCard}>No matches yet. Create one from the mobile app.</div>
        ) : (
          <div style={styles.grid}>
            {matches.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={{ ...styles.statusDot, color: STATUS_COLOR[m.status] }}>
                    {STATUS_LABEL[m.status]}
                  </span>
                  {m.status === 'completed' && m.winner && (
                    <span style={styles.winner}>
                      {m.winner === 'player1' ? 'P1 wins' : 'P2 wins'}
                    </span>
                  )}
                </div>
                <div style={styles.matchScore}>
                  {m.status !== 'scheduled' ? formatScoreDisplay(m.liveScore) : '—'}
                </div>
                <div style={styles.players}>
                  <span style={m.winner === 'player1' ? styles.winnerName : styles.playerName}>P1</span>
                  <span style={styles.vs}>vs</span>
                  <span style={m.winner === 'player2' ? styles.winnerName : styles.playerName}>P2</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  nav: { background: 'var(--green-dark)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 20 },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontSize: 15 },
  navLinkActive: { color: '#fff', borderBottom: '2px solid #ffdc60', paddingBottom: 2 },
  main: { maxWidth: 960, margin: '0 auto', padding: '40px 24px' },
  pageTitle: { fontSize: 28, fontWeight: 800, color: 'var(--green-dark)', marginBottom: 24 },
  placeholder: { color: 'var(--muted)', padding: 40, textAlign: 'center' as const },
  emptyCard: { background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center' as const, color: 'var(--muted)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  card: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', display: 'block', cursor: 'pointer', transition: 'box-shadow 0.15s' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusDot: { fontWeight: 700, fontSize: 13 },
  winner: { fontSize: 12, fontWeight: 600, color: 'var(--green-dark)', background: '#e8f5e9', padding: '2px 8px', borderRadius: 20 },
  matchScore: { fontSize: 22, fontWeight: 700, color: '#222', marginBottom: 10, letterSpacing: 1 },
  players: { display: 'flex', alignItems: 'center', gap: 10 },
  playerName: { fontSize: 15, fontWeight: 500, color: '#555' },
  winnerName: { fontSize: 15, fontWeight: 700, color: 'var(--green-dark)' },
  vs: { fontSize: 12, color: '#bbb' },
};
