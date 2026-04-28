'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { onSnapshot, addDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import {
  divisionsCol, divisionDoc, channelsCol, usersCol, userDoc,
  createDivision as createDivisionShared, useAuthUser,
  recalculateDivisionRankings,
} from '@tennis/firebase-client';
import type { Division, User, Channel } from '@tennis/shared';
import { query, where } from 'firebase/firestore';

export default function AdminPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newDivisionName, setNewDivisionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [error, setError] = useState('');

  // Find the division this user leads
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(divisionsCol(), where('leaderIds', 'array-contains', firebaseUser.uid));
    return onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const div = { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<Division, 'id'>) };
        setDivision(div);
        // Load player profiles
        if (div.playerIds.length > 0) {
          const profiles = await Promise.all(div.playerIds.map((id) => getDoc(userDoc(id))));
          setPlayers(profiles.filter((d) => d.exists()).map((d) => ({ id: d.id, ...(d.data() as Omit<User, 'id'>) })));
        }
      }
      setLoading(false);
    });
  }, [firebaseUser]);

  async function createDivision() {
    if (!firebaseUser || !newDivisionName.trim()) return;
    const divisionId = await createDivisionShared(
      newDivisionName.trim(),
      firebaseUser.uid,
      { displayName: firebaseUser.displayName ?? undefined, email: firebaseUser.email ?? undefined },
    );
    await addDoc(channelsCol(), {
      type: 'division',
      name: `${newDivisionName.trim()} Chat`,
      divisionId,
      participantIds: [firebaseUser.uid],
      createdAt: Date.now(),
    } as Channel);
    setNewDivisionName('');
  }

  async function handleRecalculate() {
    if (!division) return;
    setRecalculating(true);
    setRecalcMsg('');
    try {
      await recalculateDivisionRankings(division.id);
      setRecalcMsg('Rankings recalculated successfully.');
    } catch {
      setRecalcMsg('Recalculation failed. Check that you are a division leader.');
    } finally {
      setRecalculating(false);
    }
  }

  async function addPlayerByEmail() {
    if (!division || !newPlayerEmail.trim()) return;
    setAdding(true);
    setError('');
    try {
      const q = query(usersCol(), where('email', '==', newPlayerEmail.trim().toLowerCase()));
      const snap = await (await import('firebase/firestore')).getDocs(q);
      if (snap.empty) {
        setError('No user found with that email. They must sign in to the app first.');
        return;
      }
      const userId = snap.docs[0].id;
      await updateDoc(divisionDoc(division.id), { playerIds: arrayUnion(userId) });
      await updateDoc(userDoc(userId), { divisionId: division.id });
      setNewPlayerEmail('');
    } catch {
      setError('Failed to add player. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.navBrand}>🎾 Tennis League</span>
        <div style={styles.navLinks}>
          <Link href="/dashboard" style={styles.navLink}>Rankings</Link>
          <Link href="/matches" style={styles.navLink}>Matches</Link>
          <Link href="/messages" style={styles.navLink}>Messages</Link>
          <Link href="/profile" style={styles.navLink}>Profile</Link>
          <Link href="/admin" style={{ ...styles.navLink, ...styles.navLinkActive }}>Admin</Link>
        </div>
      </nav>

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Division Admin</h1>

        {loading ? (
          <div style={styles.placeholder}>Loading…</div>
        ) : !division ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Create Your Division</h2>
            <p style={styles.hint}>You are not currently managing a division. Create one to get started.</p>
            <div style={styles.row}>
              <input
                style={styles.input}
                value={newDivisionName}
                onChange={(e) => setNewDivisionName(e.target.value)}
                placeholder="Division name (e.g. Office A)"
              />
              <button style={styles.btn} onClick={createDivision} disabled={!newDivisionName.trim()}>
                Create Division
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>
                {division.name}
                <span style={styles.badge}>Code {division.inviteCode}</span>
              </h2>
              <p style={styles.hint}>{players.length} player{players.length !== 1 ? 's' : ''} enrolled</p>
              <p style={{ ...styles.hint, fontFamily: 'monospace', fontSize: 12 }}>
                Division ID: {division.id}
              </p>

              <h3 style={styles.subTitle}>Recalculate Rankings</h3>
              <p style={styles.hint}>
                Run this after migrating match data or if standings appear out of date.
              </p>
              <div style={styles.row}>
                <button
                  style={{ ...styles.btn, background: '#2d6a4f' }}
                  onClick={handleRecalculate}
                  disabled={recalculating}
                >
                  {recalculating ? 'Recalculating…' : 'Recalculate Rankings'}
                </button>
              </div>
              {recalcMsg && (
                <p style={{ marginTop: 10, fontSize: 13, color: recalcMsg.includes('failed') ? '#c0392b' : '#2d6a4f' }}>
                  {recalcMsg}
                </p>
              )}

              <h3 style={styles.subTitle}>Add Player by Email</h3>
              <div style={styles.row}>
                <input
                  style={styles.input}
                  value={newPlayerEmail}
                  onChange={(e) => setNewPlayerEmail(e.target.value)}
                  placeholder="player@company.com"
                  type="email"
                />
                <button style={styles.btn} onClick={addPlayerByEmail} disabled={adding || !newPlayerEmail.trim()}>
                  {adding ? 'Adding…' : 'Add Player'}
                </button>
              </div>
              {error && <p style={styles.error}>{error}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Players</h2>
              {players.length === 0 ? (
                <p style={styles.hint}>No players yet. Add players by email above.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Phone</th>
                      <th style={styles.th}>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.id} style={styles.tr}>
                        <td style={styles.td}>{p.displayName}</td>
                        <td style={styles.td}>
                          {p.contactPreferences.allowEmail ? (
                            <a href={`mailto:${p.email}`} style={styles.contactLink}>{p.email}</a>
                          ) : '—'}
                        </td>
                        <td style={styles.td}>
                          {p.phone && p.contactPreferences.allowSMS ? (
                            <a href={`tel:${p.phone}`} style={styles.contactLink}>{p.phone}</a>
                          ) : '—'}
                        </td>
                        <td style={styles.td}>
                          <span style={division.leaderIds.includes(p.id) ? styles.leaderBadge : styles.playerBadge}>
                            {division.leaderIds.includes(p.id) ? 'Leader' : 'Player'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
  main: { maxWidth: 900, margin: '0 auto', padding: '40px 24px' },
  pageTitle: { fontSize: 28, fontWeight: 800, color: 'var(--green-dark)', marginBottom: 24 },
  placeholder: { color: 'var(--muted)', padding: 40, textAlign: 'center' as const },
  card: { background: '#fff', borderRadius: 14, padding: 28, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
  sectionTitle: { fontSize: 20, fontWeight: 700, color: 'var(--green-dark)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 },
  subTitle: { fontSize: 15, fontWeight: 700, color: '#444', margin: '20px 0 10px' },
  hint: { fontSize: 14, color: 'var(--muted)', marginBottom: 16 },
  badge: { fontSize: 12, background: '#e8f5e9', color: 'var(--green-dark)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 },
  row: { display: 'flex', gap: 10 },
  input: { flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none' },
  btn: { background: 'var(--green-dark)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  error: { marginTop: 10, color: '#c0392b', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: 8 },
  th: { textAlign: 'left' as const, fontSize: 12, fontWeight: 700, color: '#999', padding: '10px 14px', borderBottom: '2px solid #f0f0f0', textTransform: 'uppercase' as const },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '12px 14px', fontSize: 14, color: '#333' },
  contactLink: { color: 'var(--green-dark)', fontWeight: 500 },
  leaderBadge: { background: '#fff3cd', color: '#856404', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 },
  playerBadge: { background: '#f0f0f0', color: '#555', padding: '2px 10px', borderRadius: 20, fontSize: 12 },
};
