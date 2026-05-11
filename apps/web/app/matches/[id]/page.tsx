'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '../../shared/StatusBadge';
import {
  useMatch, useAuthUser, submitMatchReport, confirmMatchReport, disputeMatchReport,
  cancelMatch, postponeMatch, deleteMatch,
} from '@tennis/firebase-client';
import {
  EMPTY_STATS,
  formatScoreDisplay,
  formatGameScore,
} from '@tennis/shared';
import Link from 'next/link';
import { getConfirmDialogCopy, type ConfirmAction } from './confirmDialogCopy';

type ConfirmAction =
  | { type: 'cancel' }
  | { type: 'postpone'; newTime: number }
  | { type: 'delete'; message: string };

export default function MatchPage({ params }: { params: { id: string } }): React.JSX.Element {
  const { id } = params;
  const router = useRouter();
  const { match, loading } = useMatch(id);
  const { firebaseUser } = useAuthUser();
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (loading) {
    return <div style={styles.center}>Loading match…</div>;
  }

  if (!match) {
    return <div style={styles.center}>Match not found. <Link href="/matches">Back to matches</Link></div>;
  }

  const uid = firebaseUser?.uid;
  const isParticipant = uid === match.player1Id || uid === match.player2Id;
  const submission = match.reportSubmission;
  const p1Name = match.player1Name ?? 'Player 1';
  const p2Name = match.player2Name ?? 'Player 2';
  const isHistoric = match.source === 'manual';

  const scoreDisplay = formatScoreDisplay(match.liveScore);
  const gameDisplay = formatGameScore(match.liveScore);
  const setsDisplay = `${match.liveScore.player1SetsWon} – ${match.liveScore.player2SetsWon}`;
  const p1Stats = { ...EMPTY_STATS, ...match.stats.player1 };
  const p2Stats = { ...EMPTY_STATS, ...match.stats.player2 };
  const statPercent = (won: number, total: number) => total > 0 ? `${Math.round((won / total) * 100)}%` : '—';
  const formatDuration = (ms?: number) => {
    if (ms === undefined) return '—';
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  async function withLoading(fn: () => Promise<void>) {
    setActionLoading(true);
    try { await fn(); } finally { setActionLoading(false); }
  }

  async function handleSubmit() {
    if (!uid) return;
    await withLoading(() => submitMatchReport(id, uid));
  }

  async function handleConfirm() {
    if (!uid) return;
    await withLoading(() => confirmMatchReport(id, uid));
  }

  async function handleDispute() {
    if (!uid) return;
    setShowDisputeConfirm(false);
    await withLoading(() => disputeMatchReport(id, uid));
  }

  function handleCancel() {
    setConfirmAction({ type: 'cancel' });
  }

  function handlePostponeBy(ms: number) {
    if (!match) return;
    const base = match.scheduledAt ?? Date.now();
    setConfirmAction({ type: 'postpone', newTime: base + ms });
  }

  function handleDelete() {
    if (!match) return;
    const message = match.status === 'completed'
      ? 'Deleting a completed match will not reverse its effect on rankings. Continue?'
      : 'This match and all its data will be permanently deleted.';
    setConfirmAction({ type: 'delete', message });
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.type === 'cancel') {
      await withLoading(() => cancelMatch(id));
      setShowManage(false);
    } else if (action.type === 'postpone') {
      await withLoading(() => postponeMatch(id, action.newTime));
      setShowManage(false);
      setShowPostponeOptions(false);
    } else {
      await withLoading(() => deleteMatch(id));
      router.push('/matches');
    }
  }

  const canManage = isParticipant && match.status !== 'cancelled' && match.status !== 'completed';
  const canPostpone = match.status === 'scheduled';
  const canCancel = match.status === 'scheduled' || match.status === 'in_progress';
  const canDelete = match.status === 'scheduled' || match.status === 'cancelled';
  const { confirmTitle, confirmBody, confirmLabel } = getConfirmDialogCopy(confirmAction);

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link href="/matches" style={styles.back}>← Back to Matches</Link>
        <span style={styles.navBrand}>🎾 Tennis League</span>
      </nav>

      <main style={styles.main}>
        <div style={styles.scoreboard}>
          <div style={styles.badgeRow}>
            <StatusBadge status={match.status} />
            {isHistoric && <span style={styles.historicBadge}>📋 Historic</span>}
          </div>
          <div style={styles.setsRow}>
            <span style={styles.setsLabel}>Sets</span>
            <span style={styles.setsScore}>{setsDisplay}</span>
          </div>
          <div style={styles.score}>{scoreDisplay}</div>
          {match.status === 'in_progress' && <div style={styles.gameScore}>{gameDisplay}</div>}
          {match.status === 'in_progress' && (
            <div style={styles.server}>
              {match.liveScore.server === 'player1' ? `● ${p1Name}` : `● ${p2Name}`} serves · {match.liveScore.serviceSide} side
            </div>
          )}
          <div style={styles.playerNamesRow}>
            <span style={{ ...styles.playerNameLabel, ...(match.winner === 'player1' ? styles.playerNameWinner : {}) }}>{p1Name}</span>
            <span style={styles.playerVsLabel}>vs</span>
            <span style={{ ...styles.playerNameLabel, ...(match.winner === 'player2' ? styles.playerNameWinner : {}) }}>
              {p2Name}{match.player2IsGuest ? ' (Guest)' : ''}
            </span>
          </div>
        </div>

        {canManage && (
          <div style={styles.manageWrap}>
            <button type="button" style={styles.manageBtn} onClick={() => { setShowManage(true); setShowPostponeOptions(false); }}>
              ⋯ Options
            </button>
          </div>
        )}

        {/* Report actions */}
        {isParticipant && match.status === 'pending_report' && !submission && (
          <div style={styles.reportSection}>
            <p style={styles.reportHint}>Match over — submit the final score report for your opponent to confirm.</p>
            <button style={styles.primaryBtn} onClick={handleSubmit} disabled={actionLoading}>
              {actionLoading ? 'Submitting…' : 'Submit Match Report'}
            </button>
          </div>
        )}

        {isParticipant && match.status === 'pending_report' && submission?.submittedBy === uid && (
          <div style={styles.reportSection}>
            <span style={styles.waitingBadge}>⏳ Waiting for opponent to confirm the report</span>
          </div>
        )}

        {isParticipant && match.status === 'pending_report' && submission && submission.submittedBy !== uid && (
          <div style={styles.reportSection}>
            <p style={styles.reportHint}>Your opponent has submitted the match report. Please review the score above and confirm or dispute.</p>
            <div style={styles.reportBtns}>
              <button style={styles.confirmBtn} onClick={handleConfirm} disabled={actionLoading}>
                {actionLoading ? '…' : '✓ Confirm Score'}
              </button>
              <button style={styles.disputeBtn} onClick={() => setShowDisputeConfirm(true)} disabled={actionLoading}>
                ⚠ Dispute Score
              </button>
            </div>
          </div>
        )}

        {match.status === 'disputed' && (
          <div style={styles.reportSection}>
            <span style={styles.disputedBadge}>⚠ Score disputed — awaiting division leader resolution</span>
          </div>
        )}

        {match.status === 'completed' && (
          <div style={styles.reportSection}>
            <span style={styles.confirmedBadge}>✓ Score confirmed · Rankings updated</span>
          </div>
        )}

        {/* Dispute confirmation modal */}
        {showDisputeConfirm && (
          <div style={styles.modalOverlay}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dispute-report-title"
              style={styles.modal}
            >
              <h3 id="dispute-report-title" style={styles.modalTitle}>Dispute this report?</h3>
              <p style={styles.modalBody}>This will escalate to your division leader to resolve. Only dispute if the score shown is incorrect.</p>
              <div style={styles.modalBtns}>
                <button type="button" style={styles.modalCancel} onClick={() => setShowDisputeConfirm(false)}>Cancel</button>
                <button type="button" style={styles.modalConfirm} onClick={handleDispute} disabled={actionLoading}>
                  {actionLoading ? '…' : 'Yes, Dispute'}
                </button>
              </div>
            </div>
          </div>
        )}

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
        {match.status === 'completed' && !isHistoric && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Match Statistics</h2>
            <div style={styles.statsTable}>
              <StatRow label="" v1={p1Name} v2={p2Name} header />
              <StatRow label="Receiving Points Won" v1={statPercent(p1Stats.receivingPointsWon, p1Stats.receivingPointsTotal)} v2={statPercent(p2Stats.receivingPointsWon, p2Stats.receivingPointsTotal)} />
              <StatRow label="Break Points Won" v1={`${p1Stats.breakPointsWon}/${p1Stats.breakPointsFaced}`} v2={`${p2Stats.breakPointsWon}/${p2Stats.breakPointsFaced}`} />
              {match.advancedStatsEnabled && <>
                <StatRow label="Aces" v1={String(p1Stats.aces)} v2={String(p2Stats.aces)} />
                <StatRow label="Double Faults" v1={String(p1Stats.doubleFaults)} v2={String(p2Stats.doubleFaults)} />
                <StatRow label="Winners" v1={String(p1Stats.winners)} v2={String(p2Stats.winners)} />
                <StatRow label="Unforced Errors" v1={String(p1Stats.unforcedErrors)} v2={String(p2Stats.unforcedErrors)} />
              </>}
            </div>
            <div style={styles.statsTable}>
              <StatRow label="Elapsed Time" v1="" v2="" header />
              {match.liveScore.sets.filter((set) => set.winner).map((set) => (
                <StatRow key={set.setNumber} label={`Set ${set.setNumber + 1}`} v1={formatDuration(set.durationMs)} v2="" />
              ))}
              <StatRow label="Match" v1={formatDuration(match.matchDurationMs)} v2="" />
            </div>

          </div>
        )}

        {match.status === 'completed' && match.reportUrl && (
          <div style={styles.section}>
            <a href={match.reportUrl} target="_blank" rel="noreferrer" style={styles.reportBtn}>
              📊 Download Match Report (PDF)
            </a>
          </div>
        )}

        {showManage && (
          <div style={styles.modalOverlay} onClick={() => setShowManage(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="manage-match-title"
              style={styles.modal}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="manage-match-title" style={styles.modalTitle}>{showPostponeOptions ? 'Postpone by…' : 'Manage Match'}</h3>
              {actionLoading && <p style={styles.modalBody}>Working…</p>}
              {!actionLoading && !showPostponeOptions && (
                <div style={styles.manageOptions}>
                  {canPostpone && (
                    <button type="button" style={styles.manageOption} onClick={() => setShowPostponeOptions(true)}>📅  Postpone</button>
                  )}
                  {canCancel && (
                    <button type="button" style={styles.manageOption} onClick={handleCancel}>✕  Cancel Match</button>
                  )}
                  {canDelete && (
                    <button type="button" style={{ ...styles.manageOption, ...styles.manageOptionDanger }} onClick={handleDelete}>🗑  Delete Match</button>
                  )}
                  {!canPostpone && !canCancel && !canDelete && (
                    <p style={styles.modalBody}>No actions available for this match status.</p>
                  )}
                </div>
              )}
              {!actionLoading && showPostponeOptions && (
                <div style={styles.manageOptions}>
                  {[
                    { label: '+30 minutes', ms: 30 * 60 * 1000 },
                    { label: '+1 hour',     ms: 60 * 60 * 1000 },
                    { label: '+2 hours',    ms: 2 * 60 * 60 * 1000 },
                    { label: '+1 day',      ms: 24 * 60 * 60 * 1000 },
                  ].map(({ label, ms }) => (
                    <button key={label} type="button" style={styles.manageOption} onClick={() => handlePostponeBy(ms)}>{label}</button>
                  ))}
                  <button type="button" style={styles.manageOptionGhost} onClick={() => setShowPostponeOptions(false)}>← Back</button>
                </div>
              )}
              <button type="button" style={styles.manageOptionGhost} onClick={() => setShowManage(false)}>Close</button>
            </div>
          </div>
        )}

        {confirmAction && (
          <div style={styles.modalOverlay}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-action-title"
              style={styles.modal}
            >
              <h3 id="confirm-action-title" style={styles.modalTitle}>{confirmTitle}</h3>
              <p style={styles.modalBody}>{confirmBody}</p>
              <div style={styles.modalBtns}>
                <button
                  type="button"
                  style={styles.modalCancel}
                  onClick={() => setConfirmAction(null)}
                  disabled={actionLoading}
                >
                  Keep Match
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.modalConfirm,
                    ...(confirmAction.type !== 'delete' ? styles.modalConfirmNeutral : {}),
                  }}
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Working…' : confirmLabel}
                </button>
              </div>
            </div>
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
  badgeRow: { display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' as const },
  historicBadge: { fontWeight: 600, fontSize: 12, color: '#1a472a', background: '#ffdc60', padding: '3px 10px', borderRadius: 12 },
  playerNamesRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 18 },
  playerNameLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 600 },
  playerNameWinner: { color: '#ffdc60' },
  playerVsLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  manageWrap: { display: 'flex', justifyContent: 'center', marginBottom: 12 },
  manageBtn: { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  manageOptions: { display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 12 },
  manageOption: { textAlign: 'left' as const, padding: '14px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #f0f0f0', fontSize: 15, color: '#222', fontWeight: 500, cursor: 'pointer' },
  manageOptionDanger: { color: '#c0392b' },
  manageOptionGhost: { background: 'transparent', border: 'none', color: '#888', padding: '12px 0', fontSize: 14, cursor: 'pointer', textAlign: 'center' as const },
  setsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 },
  setsLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
  setsScore: { color: '#fff', fontSize: 28, fontWeight: 700 },
  score: { color: '#fff', fontSize: 48, fontWeight: 800, letterSpacing: 4, marginBottom: 8 },
  gameScore: { color: '#a8d5a2', fontSize: 28, fontWeight: 600, marginBottom: 16 },
  server: { color: '#ffdc60', fontSize: 13, fontWeight: 600 },
  section: { background: '#fff', borderRadius: 14, padding: 24, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#1a472a', marginBottom: 16 },
  setRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' },
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
  reportSection: { background: '#fff', borderRadius: 14, padding: 24, marginBottom: 16, textAlign: 'center' as const },
  reportHint: { color: '#555', fontSize: 14, marginBottom: 16 },
  reportBtns: { display: 'flex', gap: 12, justifyContent: 'center' },
  primaryBtn: { background: '#1a472a', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  confirmBtn: { background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  disputeBtn: { background: '#fff', color: '#c0392b', border: '2px solid #c0392b', borderRadius: 10, padding: '14px 24px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  waitingBadge: { background: '#f0f0e8', color: '#666', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14 },
  confirmedBadge: { background: '#e8f5e9', color: '#2d6a4f', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14 },
  disputedBadge: { background: '#fff3e0', color: '#e65100', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 14 },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 16, padding: 32, maxWidth: 380, width: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 },
  modalBody: { fontSize: 14, color: '#555', marginBottom: 24, lineHeight: 1.5 },
  modalBtns: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  modalCancel: { background: '#f0f0f0', color: '#333', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  modalConfirm: { background: '#c0392b', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  modalConfirmNeutral: { background: '#1a472a' },
};
