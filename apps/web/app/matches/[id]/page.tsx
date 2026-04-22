'use client';

import { use } from 'react';
import { useMatch } from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore } from '@tennis/shared';
import Link from 'next/link';

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { match, loading } = useMatch(id);

  if (loading) {
    return <div style={styles.center}>Loading match…</div>;
  }

  if (!match) {
    return <div style={styles.center}>Match not found. <Link href="/matches">Back to matches</Link></div>;
  }

  const scoreDisplay = formatScoreDisplay(match.liveScore);
  const gameDisplay = formatGameScore(match.liveScore);
  const setsDisplay = `${match.liveScore.player1SetsWon} – ${match.liveScore.player2SetsWon}`;
  const statusLabel = match.status === 'in_progress' ? '● LIVE'
    : match.status === 'completed' ? 'Final'
    : match.status === 'disputed' ? '⚠ Disputed'
    : 'Scheduled';

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link href="/matches" style={styles.back}>← Back to Matches</Link>
        <span style={styles.navBrand}>🎾 Tennis League</span>
      </nav>

      <main style={styles.main}>
        <div style={styles.scoreboard}>
          <span style={{ ...styles.statusBadge, color: match.status === 'in_progress' ? '#ff6b6b' : '#999' }}>
            {statusLabel}
          </span>
          <div style={styles.setsRow}>
            <span style={styles.setsLabel}>Sets</span>
            <span style={styles.setsScore}>{setsDisplay}</span>
          </div>
          <div style={styles.score}>{scoreDisplay}</div>
          <div style={styles.gameScore}>{gameDisplay}</div>
          <div style={styles.server}>
            {match.liveScore.server === 'player1' ? '● Player 1' : '● Player 2'} serves · {match.liveScore.serviceSide} side
          </div>
        </div>

        {/* Set breakdown */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Set Breakdown</h2>
          {match.liveScore.sets.filter(s => s.winner || match.liveScore.currentSet === s.setNumber).map((s, i) => (
            <div key={i} style={styles.setRow}>
              <span style={styles.setLabel}>Set {i + 1}</span>
              <span style={{ ...styles.setScore, fontWeight: s.winner === 'player1' ? 700 : 400 }}>{s.player1Games}</span>
              <span style={styles.setDash}>–</span>
              <span style={{ ...styles.setScore, fontWeight: s.winner === 'player2' ? 700 : 400 }}>{s.player2Games}</span>
              {s.tiebreak && (
                <span style={styles.tbScore}>
                  ({s.winner === 'player1' ? s.tiebreak.player2Points : s.tiebreak.player1Points})
                </span>
              )}
              {s.winner && <span style={styles.setWinner}>{s.winner === 'player1' ? 'P1 ✓' : 'P2 ✓'}</span>}
            </div>
          ))}
        </div>

        {/* Stats */}
        {match.status === 'completed' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Match Statistics</h2>
            <div style={styles.statsTable}>
              <StatRow label="" v1="Player 1" v2="Player 2" header />
              <StatRow label="Aces" v1={String(match.stats.player1.aces)} v2={String(match.stats.player2.aces)} />
              <StatRow label="Double Faults" v1={String(match.stats.player1.doubleFaults)} v2={String(match.stats.player2.doubleFaults)} />
              <StatRow label="Winners" v1={String(match.stats.player1.winners)} v2={String(match.stats.player2.winners)} />
              <StatRow label="Unforced Errors" v1={String(match.stats.player1.unforcedErrors)} v2={String(match.stats.player2.unforcedErrors)} />
              <StatRow label="Break Points Won" v1={String(match.stats.player1.breakPointsWon)} v2={String(match.stats.player2.breakPointsWon)} />
            </div>

            {match.reportUrl && (
              <a href={match.reportUrl} target="_blank" rel="noreferrer" style={styles.reportBtn}>
                📊 Download Match Report (PDF)
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatRow({ label, v1, v2, header }: { label: string; v1: string; v2: string; header?: boolean }) {
  return (
    <div style={{ ...styles.statRow, ...(header ? styles.statRowHeader : {}) }}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statVal}>{v1}</span>
      <span style={styles.statVal}>{v2}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#1a472a' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 8 },
  nav: { padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 18 },
  main: { maxWidth: 700, margin: '0 auto', padding: '24px' },
  scoreboard: { textAlign: 'center', padding: '32px 0 40px' },
  statusBadge: { fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 16 },
  setsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 },
  setsLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
  setsScore: { color: '#fff', fontSize: 28, fontWeight: 700 },
  score: { color: '#fff', fontSize: 48, fontWeight: 800, letterSpacing: 4, marginBottom: 8 },
  gameScore: { color: '#a8d5a2', fontSize: 28, fontWeight: 600, marginBottom: 16 },
  server: { color: '#ffdc60', fontSize: 13, fontWeight: 600 },
  section: { background: '#fff', borderRadius: 14, padding: 24, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#1a472a', marginBottom: 16 },
  setRow: { display: 'flex', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottom: '1px solid #f0f0f0' },
  setLabel: { color: '#666', fontSize: 14, width: 48 },
  setScore: { fontSize: 18, color: '#333', width: 32, textAlign: 'center' as const },
  setDash: { color: '#999' },
  tbScore: { color: '#888', fontSize: 12 },
  setWinner: { color: '#2d6a4f', fontWeight: 700, fontSize: 13, marginLeft: 8 },
  statsTable: { borderRadius: 8, overflow: 'hidden', border: '1px solid #eee' },
  statRow: { display: 'grid', gridTemplateColumns: '1fr 100px 100px', padding: '10px 16px', borderBottom: '1px solid #f5f5f5' },
  statRowHeader: { background: '#f5f5f0', fontWeight: 700, fontSize: 13, color: '#1a472a' },
  statLabel: { color: '#666', fontSize: 14 },
  statVal: { textAlign: 'center' as const, fontSize: 14, fontWeight: 500 },
  reportBtn: { display: 'inline-block', marginTop: 16, background: '#1a472a', color: '#fff', borderRadius: 10, padding: '12px 20px', fontWeight: 600, fontSize: 14 },
};
