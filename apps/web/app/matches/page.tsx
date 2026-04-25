'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onSnapshot } from 'firebase/firestore';
import {
  divisionMatchesQuery, recordHistoricMatch, searchDivisionPlayers,
  useAuthUser, useUserProfile,
} from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore } from '@tennis/shared';
import type { Match, User } from '@tennis/shared';

const FALLBACK_DIVISION_ID = process.env.NEXT_PUBLIC_DIVISION_ID ?? 'default';

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
  const isHistoric = m.source === 'manual';
  const p1 = m.player1Name ?? 'Player 1';
  const p2 = m.player2Name ?? 'Player 2';
  return (
    <Link key={m.id} href={`/matches/${m.id}`} style={{ ...styles.card, ...(isLive ? styles.cardLive : {}) }}>
      <div style={styles.cardTop}>
        <span style={{ ...styles.statusDot, color: STATUS_COLOR[m.status] }}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isHistoric && <span style={styles.historicBadge}>📋 Historic</span>}
          {m.status === 'completed' && m.winner && (
            <span style={styles.winnerBadge}>
              {m.winner === 'player1' ? p1 : p2} wins
            </span>
          )}
        </div>
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
        <span style={m.winner === 'player1' ? styles.winnerName : styles.playerName}>{p1}</span>
        <span style={styles.vs}>vs</span>
        <span style={m.winner === 'player2' ? styles.winnerName : styles.playerName}>
          {p2}{m.player2IsGuest ? ' (Guest)' : ''}
        </span>
      </div>

      {isLive && (
        <div style={styles.serverLine}>
          {m.liveScore.server === 'player1' ? p1 : p2} serves · {m.liveScore.serviceSide} side
        </div>
      )}
    </Link>
  );
}

export default function MatchesPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  const divisionId = profile?.divisionId ?? FALLBACK_DIVISION_ID;
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecord, setShowRecord] = useState(false);

  useEffect(() => {
    if (!divisionId) return;
    const q = divisionMatchesQuery(divisionId);
    return onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Match, 'id'>) })));
      setLoading(false);
    });
  }, [divisionId]);

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
          <Link href="/profile" style={styles.navLink}>Profile</Link>
          <Link href="/admin" style={styles.navLink}>Admin</Link>
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.titleRow}>
          <h1 style={styles.pageTitle}>Matches</h1>
          {profile?.divisionId && firebaseUser && (
            <button style={styles.recordBtn} onClick={() => setShowRecord(true)}>
              📋 Record Past Match
            </button>
          )}
        </div>

        {loading ? (
          <div style={styles.placeholder}>Loading matches…</div>
        ) : matches.length === 0 ? (
          <div style={styles.emptyCard}>No matches yet. Create one from the mobile app, or record a past match above.</div>
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

        {showRecord && firebaseUser && profile?.divisionId && (
          <RecordPastMatchModal
            currentUser={profile}
            divisionId={profile.divisionId}
            onClose={() => setShowRecord(false)}
          />
        )}
      </main>
    </div>
  );
}

function RecordPastMatchModal({
  currentUser,
  divisionId,
  onClose,
}: {
  currentUser: User;
  divisionId: string;
  onClose: () => void;
}) {
  const [opponentMode, setOpponentMode] = useState<'search' | 'guest'>('search');
  const [guestName, setGuestName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [sets, setSets] = useState([{ p1: '', p2: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!searchText.trim() || selectedOpponent) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchDivisionPlayers(divisionId, searchText);
        setSearchResults(results.filter((u) => u.id !== currentUser.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText, divisionId, selectedOpponent, currentUser.id]);

  const opponentReady = opponentMode === 'guest' ? guestName.trim().length > 0 : !!selectedOpponent;

  async function handleSubmit() {
    setError('');
    const parsed = sets.map((s) => ({ p1: parseInt(s.p1, 10), p2: parseInt(s.p2, 10) }));
    const invalid = parsed.some((s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0);
    if (invalid || parsed.length === 0) {
      setError('Please enter a valid number of games for each set.');
      return;
    }
    const p1Sets = parsed.filter((s) => s.p1 > s.p2).length;
    const p2Sets = parsed.filter((s) => s.p2 > s.p1).length;
    if (p1Sets === p2Sets) {
      setError('The match must have a clear winner. Check the set scores.');
      return;
    }
    setSubmitting(true);
    try {
      const isGuest = opponentMode === 'guest';
      await recordHistoricMatch(
        isGuest
          ? {
              player1Id: currentUser.id,
              player2Id: 'guest',
              player1Name: currentUser.displayName,
              player2Name: guestName.trim(),
              player2IsGuest: true,
              divisionId,
              createdBy: currentUser.id,
              sets: parsed,
            }
          : {
              player1Id: currentUser.id,
              player2Id: selectedOpponent!.id,
              player1Name: currentUser.displayName,
              player2Name: selectedOpponent!.displayName,
              divisionId,
              createdBy: currentUser.id,
              sets: parsed,
            }
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record match. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalStyles.title}>Record Past Match</h2>

        <div style={modalStyles.modeToggle}>
          <button
            style={{ ...modalStyles.modeBtn, ...(opponentMode === 'search' ? modalStyles.modeBtnActive : {}) }}
            onClick={() => { setOpponentMode('search'); setGuestName(''); }}
          >Search Player</button>
          <button
            style={{ ...modalStyles.modeBtn, ...(opponentMode === 'guest' ? modalStyles.modeBtnActive : {}) }}
            onClick={() => { setOpponentMode('guest'); setSelectedOpponent(null); setSearchText(''); setSearchResults([]); }}
          >Guest / No Account</button>
        </div>

        {opponentMode === 'guest' ? (
          <input
            style={modalStyles.input}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Guest name…"
          />
        ) : selectedOpponent ? (
          <div style={modalStyles.selectedRow}>
            <div>
              <div style={modalStyles.selectedName}>{selectedOpponent.displayName}</div>
              <div style={modalStyles.selectedEmail}>{selectedOpponent.email}</div>
            </div>
            <button style={modalStyles.changeBtn} onClick={() => { setSelectedOpponent(null); setSearchText(''); }}>Change</button>
          </div>
        ) : (
          <>
            <input
              style={modalStyles.input}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search opponent by name or email…"
            />
            {searching && <div style={modalStyles.muted}>Searching…</div>}
            {searchResults.length > 0 && (
              <div style={modalStyles.results}>
                {searchResults.map((u) => (
                  <button key={u.id} style={modalStyles.resultRow} onClick={() => { setSelectedOpponent(u); setSearchResults([]); }}>
                    <div style={modalStyles.resultName}>{u.displayName}</div>
                    <div style={modalStyles.resultEmail}>{u.email}</div>
                  </button>
                ))}
              </div>
            )}
            {searchText.trim().length > 0 && !searching && searchResults.length === 0 && (
              <div style={modalStyles.muted}>No players found.</div>
            )}
          </>
        )}

        {opponentReady && (
          <div style={modalStyles.setsBlock}>
            <div style={modalStyles.label}>Set scores (your games first)</div>
            {sets.map((s, i) => (
              <div key={i} style={modalStyles.setRow}>
                <span style={modalStyles.setLabel}>Set {i + 1}</span>
                <input
                  style={modalStyles.setInput}
                  value={s.p1}
                  onChange={(e) => {
                    const next = [...sets];
                    next[i] = { ...next[i], p1: e.target.value.replace(/[^0-9]/g, '') };
                    setSets(next);
                  }}
                  placeholder="You"
                  inputMode="numeric"
                  maxLength={2}
                />
                <span style={modalStyles.setDash}>–</span>
                <input
                  style={modalStyles.setInput}
                  value={s.p2}
                  onChange={(e) => {
                    const next = [...sets];
                    next[i] = { ...next[i], p2: e.target.value.replace(/[^0-9]/g, '') };
                    setSets(next);
                  }}
                  placeholder="Opp"
                  inputMode="numeric"
                  maxLength={2}
                />
                {sets.length > 1 && (
                  <button style={modalStyles.removeSet} onClick={() => setSets(sets.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
            ))}
            {sets.length < 5 && (
              <button style={modalStyles.addSet} onClick={() => setSets([...sets, { p1: '', p2: '' }])}>+ Add Set</button>
            )}
          </div>
        )}

        {error && <div style={modalStyles.error}>{error}</div>}

        <div style={modalStyles.actions}>
          <button style={modalStyles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            style={{ ...modalStyles.submitBtn, ...(!opponentReady || submitting ? modalStyles.btnDisabled : {}) }}
            onClick={handleSubmit}
            disabled={!opponentReady || submitting}
          >
            {submitting ? 'Recording…' : 'Record Match'}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  card: { background: '#fff', borderRadius: 16, padding: 28, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' as const },
  title: { fontSize: 20, fontWeight: 700, color: '#1a472a', marginBottom: 16 },
  modeToggle: { display: 'flex', borderRadius: 10, border: '1px solid #ddd', overflow: 'hidden', marginBottom: 14 },
  modeBtn: { flex: 1, padding: '10px 0', background: '#f9f9f9', border: 'none', fontSize: 13, fontWeight: 600, color: '#888', cursor: 'pointer' },
  modeBtnActive: { background: '#1a472a', color: '#fff' },
  input: { width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none' },
  results: { maxHeight: 200, overflowY: 'auto' as const, border: '1px solid #eee', borderRadius: 10, marginBottom: 12 },
  resultRow: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '10px 14px', background: '#fff', border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' },
  resultName: { fontSize: 14, fontWeight: 600, color: '#222' },
  resultEmail: { fontSize: 12, color: '#888', marginTop: 2 },
  selectedRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f9f0', borderRadius: 10, padding: 12, marginBottom: 14 },
  selectedName: { fontSize: 15, fontWeight: 700, color: '#1a472a' },
  selectedEmail: { fontSize: 12, color: '#666', marginTop: 2 },
  changeBtn: { background: 'transparent', border: 'none', color: '#1a472a', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  setsBlock: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 8 },
  setRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  setLabel: { fontSize: 13, color: '#666', width: 48 },
  setInput: { width: 56, padding: '8px 0', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center' as const, color: '#1a472a' },
  setDash: { color: '#999', fontWeight: 600 },
  removeSet: { marginLeft: 'auto', background: 'transparent', border: 'none', color: '#c0392b', fontSize: 16, cursor: 'pointer' },
  addSet: { background: 'transparent', border: 'none', color: '#1a472a', fontWeight: 600, fontSize: 13, padding: '4px 0', cursor: 'pointer' },
  actions: { display: 'flex', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, padding: '12px 0', background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 600, color: '#333', cursor: 'pointer' },
  submitBtn: { flex: 1, padding: '12px 0', background: '#1a472a', border: 'none', borderRadius: 10, fontWeight: 700, color: '#fff', cursor: 'pointer' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' as const },
  error: { color: '#c0392b', fontSize: 13, marginBottom: 12 },
  muted: { color: '#999', fontSize: 13, marginBottom: 12 },
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  nav: { background: 'var(--green-dark)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 20 },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontSize: 15 },
  navLinkActive: { color: '#fff', borderBottom: '2px solid #ffdc60', paddingBottom: 2 },
  main: { maxWidth: 960, margin: '0 auto', padding: '40px 24px' },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' as const },
  pageTitle: { fontSize: 28, fontWeight: 800, color: 'var(--green-dark)', margin: 0 },
  recordBtn: { background: '#fff', border: '1.5px solid var(--green-dark)', color: 'var(--green-dark)', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  historicBadge: { fontSize: 11, fontWeight: 600, color: '#1a472a', background: '#ffdc60', padding: '2px 8px', borderRadius: 12 },
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
