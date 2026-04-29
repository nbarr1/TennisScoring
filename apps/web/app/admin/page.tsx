'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { onSnapshot, getDoc } from 'firebase/firestore';
import {
  divisionsCol,
  userDoc,
  createDivision as createDivisionShared,
  addDivisionMemberPlaceholder,
  recalculateDivisionRankings,
  useAuthUser,
  functions,
} from '@tennis/firebase-client';
import type { Division, User } from '@tennis/shared';
import { query, where } from 'firebase/firestore';

export default function AdminPage(): React.JSX.Element {
  const { firebaseUser } = useAuthUser();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [sendInviteForMember, setSendInviteForMember] = useState(true);
  const [newDivisionName, setNewDivisionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [repairingRankings, setRepairingRankings] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');

  // Find the division this user leads
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      divisionsCol(),
      where('leaderIds', 'array-contains', firebaseUser.uid),
    );
    return onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const div = {
          id: snap.docs[0].id,
          ...(snap.docs[0].data() as Omit<Division, 'id'>),
        };
        setDivision(div);
        // Load player profiles
        if (div.playerIds.length > 0) {
          const profiles = await Promise.all(
            div.playerIds.map((id) => getDoc(userDoc(id))),
          );
          setPlayers(
            profiles
              .filter((d) => d.exists())
              .map((d) => ({ id: d.id, ...(d.data() as Omit<User, 'id'>) })),
          );
        }
      }
      setLoading(false);
    });
  }, [firebaseUser]);

  async function createDivision() {
    if (!firebaseUser || !newDivisionName.trim()) return;
    await createDivisionShared(newDivisionName.trim(), firebaseUser.uid, {
      displayName: firebaseUser.displayName ?? undefined,
      email: firebaseUser.email ?? undefined,
    });
    setNewDivisionName('');
  }

  async function addDivisionMember() {
    if (!division || !memberName.trim()) return;
    setAdding(true);
    setError('');
    setInviteMessage('');
    try {
      const memberResult = await addDivisionMemberPlaceholder(
        division.id,
        memberName.trim(),
        memberEmail.trim() || undefined,
        sendInviteForMember && !!memberEmail.trim(),
      );
      let inviteWarning = '';
      if (sendInviteForMember && memberEmail.trim()) {
        setInviting(true);
        try {
          const callable = httpsCallable(functions, 'sendInvite');
          await callable({
            email: memberEmail.trim().toLowerCase(),
            name: memberName.trim(),
            divisionId: division.id,
          });
        } catch (inviteError) {
          const inviteMessage =
            (inviteError as { message?: string; code?: string }).message ??
            'Unknown invite error';
          const inviteCode = (inviteError as { code?: string }).code;
          inviteWarning = ` Member was added, but invite email failed (${inviteCode ?? 'error'}: ${inviteMessage}).`;
        } finally {
          setInviting(false);
        }
      }
      const baseMessage = memberResult.createdPlaceholder
        ? sendInviteForMember && memberEmail.trim()
          ? `Placeholder created for ${memberName.trim()}.`
          : 'Placeholder member created.'
        : 'Existing registered player added to division.';
      setInviteMessage(`${baseMessage}${inviteWarning}`);
      setMemberName('');
      setMemberEmail('');
      setSendInviteForMember(true);
    } catch (e) {
      const message = (e as { message?: string; code?: string }).message;
      const code = (e as { code?: string }).code;
      setError(
        message
          ? `${code ?? 'error'}: ${message}`
          : 'Failed to add division member. Please try again.',
      );
    } finally {
      setAdding(false);
      setInviting(false);
    }
  }

  async function repairRankings() {
    if (!division) return;
    setRepairingRankings(true);
    setError('');
    setRepairMessage('');
    try {
      const response = (await recalculateDivisionRankings(
        division.id,
        true,
      )) as {
        result?: {
          countedMatches?: number;
          guestMatchesCounted?: number;
          matchesNormalized?: number;
          rankingsWritten?: number;
          rankingsDeleted?: number;
        };
      };
      const result = response.result;
      setRepairMessage(
        result
          ? `Rankings repaired. Counted ${result.countedMatches ?? 0} match${
              result.countedMatches === 1 ? '' : 'es'
            }, including ${result.guestMatchesCounted ?? 0} guest match${
              result.guestMatchesCounted === 1 ? '' : 'es'
            }. Updated ${result.rankingsWritten ?? 0} ranking row${
              result.rankingsWritten === 1 ? '' : 's'
            } and removed ${result.rankingsDeleted ?? 0} stale row${
              result.rankingsDeleted === 1 ? '' : 's'
            }. Normalized ${result.matchesNormalized ?? 0} historic match${
              result.matchesNormalized === 1 ? '' : 'es'
            }.`
          : 'Rankings repaired.',
      );
    } catch (e) {
      const message = (e as { message?: string }).message;
      setError(message || 'Failed to repair rankings. Please try again.');
    } finally {
      setRepairingRankings(false);
    }
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.navBrand}>🎾 Tennis League</span>
        <div style={styles.navLinks}>
          <Link href="/dashboard" style={styles.navLink}>
            Rankings
          </Link>
          <Link href="/matches" style={styles.navLink}>
            Matches
          </Link>
          <Link href="/messages" style={styles.navLink}>
            Messages
          </Link>
          <Link href="/profile" style={styles.navLink}>
            Profile
          </Link>
          <Link
            href="/admin"
            style={{ ...styles.navLink, ...styles.navLinkActive }}
          >
            Admin
          </Link>
        </div>
      </nav>

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Division Admin</h1>

        {loading ? (
          <div style={styles.placeholder}>Loading…</div>
        ) : !division ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Create Your Division</h2>
            <p style={styles.hint}>
              You are not currently managing a division. Create one to get
              started.
            </p>
            <div style={styles.row}>
              <input
                style={styles.input}
                value={newDivisionName}
                onChange={(e) => setNewDivisionName(e.target.value)}
                placeholder="Division name (e.g. Office A)"
              />
              <button
                style={styles.btn}
                onClick={createDivision}
                disabled={!newDivisionName.trim()}
              >
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
              <p style={styles.hint}>
                {players.length} player{players.length !== 1 ? 's' : ''}{' '}
                enrolled
              </p>

              <h3 style={styles.subTitle}>Add Division Member</h3>
              <p style={styles.hint}>
                One flow for existing players and placeholders. If the email
                belongs to a registered account, they are added directly.
                Otherwise, a placeholder is created.
              </p>
              <div style={styles.row}>
                <input
                  style={styles.input}
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Player name"
                />
                <input
                  style={styles.input}
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="player@company.com (optional)"
                  type="email"
                />
                <button
                  style={styles.btn}
                  onClick={addDivisionMember}
                  disabled={adding || inviting || !memberName.trim()}
                >
                  {adding || inviting ? 'Saving…' : 'Add Member'}
                </button>
              </div>
              <div style={styles.row}>
                <label style={{ ...styles.hint, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={sendInviteForMember}
                    onChange={(e) => setSendInviteForMember(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Send invite email when an email is provided
                </label>
              </div>
              {inviteMessage && <p style={styles.success}>{inviteMessage}</p>}
              {error && <p style={styles.error}>{error}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Ranking Repair</h2>
              <p style={styles.hint}>
                Rebuild rankings and head-to-head records from completed
                matches without deleting match history.
              </p>
              <button
                style={styles.btn}
                onClick={repairRankings}
                disabled={repairingRankings}
              >
                {repairingRankings ? 'Repairing...' : 'Repair Rankings'}
              </button>
              {repairMessage && <p style={styles.success}>{repairMessage}</p>}
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Players</h2>
              {players.length === 0 ? (
                <p style={styles.hint}>
                  No players yet. Add players by email above.
                </p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Phone</th>
                      <th style={styles.th}>Role</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.id} style={styles.tr}>
                        <td style={styles.td}>{p.displayName}</td>
                        <td style={styles.td}>
                          {p.contactPreferences?.allowEmail !== false ? (
                            <a
                              href={`mailto:${p.email}`}
                              style={styles.contactLink}
                            >
                              {p.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={styles.td}>
                          {p.phone && p.contactPreferences?.allowSMS ? (
                            <a
                              href={`tel:${p.phone}`}
                              style={styles.contactLink}
                            >
                              {p.phone}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={styles.td}>
                          <span
                            style={
                              division.leaderIds.includes(p.id)
                                ? styles.leaderBadge
                                : styles.playerBadge
                            }
                          >
                            {division.leaderIds.includes(p.id)
                              ? 'Leader'
                              : 'Player'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {p.isRegistered === false
                            ? p.inviteStatus === 'invite_sent'
                              ? 'Invite Sent'
                              : 'Unregistered'
                            : 'Registered'}
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
  nav: {
    background: 'var(--green-dark)',
    padding: '16px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 20 },
  navLinks: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  navLink: { color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontSize: 15 },
  navLinkActive: {
    color: '#fff',
    borderBottom: '2px solid #ffdc60',
    paddingBottom: 2,
  },
  main: { maxWidth: 900, margin: '0 auto', padding: '40px 24px' },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: 'var(--green-dark)',
    marginBottom: 24,
  },
  placeholder: {
    color: 'var(--muted)',
    padding: 40,
    textAlign: 'center' as const,
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: 28,
    marginBottom: 20,
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--green-dark)',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#444',
    margin: '20px 0 10px',
  },
  hint: { fontSize: 14, color: 'var(--muted)', marginBottom: 16 },
  badge: {
    fontSize: 12,
    background: '#e8f5e9',
    color: 'var(--green-dark)',
    padding: '2px 10px',
    borderRadius: 20,
    fontWeight: 600,
  },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  input: {
    flex: 1,
    border: '1px solid #ddd',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
  },
  btn: {
    background: 'var(--green-dark)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 20px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  error: { marginTop: 10, color: '#c0392b', fontSize: 13 },
  success: { marginTop: 10, color: '#1a7f37', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: 8 },
  th: {
    textAlign: 'left' as const,
    fontSize: 12,
    fontWeight: 700,
    color: '#999',
    padding: '10px 14px',
    borderBottom: '2px solid #f0f0f0',
    textTransform: 'uppercase' as const,
  },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '12px 14px', fontSize: 14, color: '#333' },
  contactLink: { color: 'var(--green-dark)', fontWeight: 500 },
  leaderBadge: {
    background: '#fff3cd',
    color: '#856404',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  playerBadge: {
    background: '#f0f0f0',
    color: '#555',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
  },
};
