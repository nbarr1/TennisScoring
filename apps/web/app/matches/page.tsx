'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onSnapshot } from 'firebase/firestore';
import { divisionMatchesQuery } from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore } from '@tennis/shared';
import type { Match } from '@tennis/shared';

const DIVISION_ID = process.env.NEXT_PUBLIC_DIVISION_ID ?? 'default';

const STATUS_COLOR: Record<string, string> = {
  in_progress: '#27ae60',
  pending_report: '#e67e22',
  completed: '#555',
  disputed: '#c0392b',
  scheduled: '#aaa',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: '● LIVE',
  pending_report: 'Pending Report',
  completed: 'Final',
  disputed: '⚠ Disputed',
  scheduled: 'Scheduled',
};

function MatchCard({ m }: { m: Match }) {
  const isLive = m.status === 'in_progress';
  return (
    <Link key={m.id} href={`/matches/${m.id}`} style={{ ...styles.card, ...(isLive ? styles.cardLive : {}) }}>
      <div style={styles.cardTop}>
        <span style={{ ...styles.statusDot, color: STATUS_COLOR[m.status] }}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
        {m.status === 'completed' && m.winner && (
          <span style={styles.winnerBadge}>
            {m.winner === 'player1' ? 'P1 wins' : 'P2 wins'}
          </span>
        )}
      </div>

      {m.status !== 'scheduled' && (
        <div style={styles.scoreBlock}>
          <span style={styles.setScore}>{formatScoreDisplay(m.liveScore)}</span>
          {isLive && (
            <span style={styles.gameScore}>{formatGameScore(m.liveScore)}</span>
          )}
        </div>
      )}

      <div style={styles.players}>
        <span style={m.winner === 'player1' ? styles.winnerName : styles.playerName}>P1</span>
        <span style={styles.vs}>vs</span>
        <span style={m.winner === 'player2' ? styles.winnerName : styles.playerName}>P2</span>
      </div>

      {isLive && (
        <div style={styles.serverLine}>
          {m.liveScore.server === 'player1' ? 'P1' : 'P2'} serves · {m.liveScore.serviceSide} side
        </div>
      )}
    </Link>
  );
}

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

  const liveMatches = matches.filter((m) => m.status === 'in_progress');
  const otherMatches = matches.filter((m) => m.status !== 'in_progress');

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
          <>
            {liveMatches.length > 0 && (
              <section style={styles.liveSection}>
                <div style={styles.liveSectionHeader}>
                  <span style={styles.livePulse} />
                  <h2 style={styles.liveSectionTitle}>Now Live</h2>
                </div>
                <div style={styles.grid}>
                  {liveMatches.map((m) => <MatchCard key={m.id} m={m} />)}
                </div>
              </section>
            )}

            {otherMatches.length > 0 && (
              <section>
                {liveMatches.length > 0 && <h2 style={styles.sectionTitle}>All Matches</h2>}
                <div style={styles.grid}>
                  {otherMatches.map((m) => <MatchCard key={m.id} m={m} />)}
                </div>
              </section>
            )}
          </>
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

  liveSection: { marginBottom: 32 },
  liveSectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  livePulse: {
    width: 10, height: 10, borderRadius: '50%', background: '#27ae60',
    boxShadow: '0 0 0 3px rgba(39,174,96,0.3)',
    animation: 'pulse 1.5s infinite',
  },
  liveSectionTitle: { fontSize: 18, fontWeight: 700, color: '#1a472a', margin: 0 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#666', marginBottom: 14 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  card: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', display: 'block', cursor: 'pointer' },
  cardLive: { borderLeft: '4px solid #27ae60', boxShadow: '0 4px 16px rgba(39,174,96,0.15)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusDot: { fontWeight: 700, fontSize: 13 },
  winnerBadge: { fontSize: 12, fontWeight: 600, color: 'var(--green-dark)', background: '#e8f5e9', padding: '2px 8px', borderRadius: 20 },
  scoreBlock: { marginBottom: 8 },
  setScore: { fontSize: 22, fontWeight: 700, color: '#222', letterSpacing: 1 },
  gameScore: { fontSize: 15, fontWeight: 600, color: '#27ae60', marginLeft: 10 },
  players: { display: 'flex', alignItems: 'center', gap: 10 },
  playerName: { fontSize: 15, fontWeight: 500, color: '#555' },
  winnerName: { fontSize: 15, fontWeight: 700, color: 'var(--green-dark)' },
  vs: { fontSize: 12, color: '#bbb' },
  serverLine: { fontSize: 12, color: '#888', marginTop: 8 },
};
