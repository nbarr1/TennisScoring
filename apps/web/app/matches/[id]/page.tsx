'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '../../shared/StatusBadge';
import {
  useMatch, useAuthUser, submitMatchReport, confirmMatchReport, disputeMatchReport,
  cancelMatch, postponeMatch, deleteMatch, startMatch, scorePoint, undoLastPoint,
} from '@tennis/firebase-client';
import {
  EMPTY_STATS,
  formatScoreDisplay,
  formatGameScore,
} from '@tennis/shared';
import Link from 'next/link';
import { getConfirmDialogCopy, type ConfirmAction } from './confirmDialogCopy';
import { useViewMode } from '../../shared/viewMode';


function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function formatMmSs(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
export default function MatchPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const { match, loading } = useMatch(id ?? null);
  const { firebaseUser } = useAuthUser();
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [liveActionLoading, setLiveActionLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const { effectiveMode } = useViewMode();
  const isIosView = effectiveMode === 'ios';
  const [clockTick, setClockTick] = useState(Date.now());
  const [tapLock, setTapLock] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    if (match?.status !== 'in_progress') return;
    const t = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [match?.status]);

  if (loading) {
    return <div style={styles.center}>Loading match…</div>;
  }

  if (!id) {
    return <div style={styles.center}>Match not found. <Link href="/matches">Back to matches</Link></div>;
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
    if (action.type === 'cancel') {
      await withLoading(() => cancelMatch(id));
      setShowManage(false);
    } else if (action.type === 'postpone') {
      await withLoading(() => postponeMatch(id, action.newTime));
      setShowManage(false);
      setShowPostponeOptions(false);
    } else {
      if (deleteConfirmText !== 'DELETE') return;
      await withLoading(() => deleteMatch(id));
      router.push('/matches');
    }
    setConfirmAction(null);
  }


  async function handleStartLive(server: 'player1' | 'player2') {
    if (!match) return;
    setLiveError(null);
    setLiveActionLoading(true);
    try {
      await startMatch(id, server, false, match.liveScore);
    } catch {
      setLiveError('Could not start live scoring. Please try again.');
    } finally {
      setLiveActionLoading(false);
    }
  }

  async function handlePoint(player: 'player1' | 'player2') {
    if (!match || tapLock) return;
    setTapLock(true);
    setTimeout(() => setTapLock(false), 300);
    setLiveError(null);
    setLiveActionLoading(true);
    try {
      await scorePoint(id, match, player);
    } catch {
      setLiveError('Could not record point. Check your connection and retry.');
    } finally {
      setLiveActionLoading(false);
    }
  }

  async function handleUndoPoint() {
    if (!match) return;
    setLiveError(null);
    setLiveActionLoading(true);
    try {
      await undoLastPoint(id, match);
    } catch {
      setLiveError('Could not undo point.');
    } finally {
      setLiveActionLoading(false);
    }
  }
  const canManage = isParticipant && match.status !== 'cancelled' && match.status !== 'completed';
  const canPostpone = match.status === 'scheduled';
  const canCancel = match.status === 'scheduled' || match.status === 'in_progress';
  const canDelete = match.status === 'scheduled' || match.status === 'cancelled';
  const { confirmTitle, confirmBody, confirmLabel } = getConfirmDialogCopy(confirmAction);


  const p1Last = lastName(p1Name);
  const p2Last = lastName(p2Name);
  const visibleSets = match.liveScore.sets.slice(0, Math.max(2, match.liveScore.currentSet + 1));
  const showSet3 = visibleSets.length >= 3;
  const setClock = formatMmSs((match.liveScore.sets[match.liveScore.currentSet]?.durationMs ?? 0) + (match.status === 'in_progress' && match.currentSetStartedAt ? clockTick - match.currentSetStartedAt : 0));
  const matchClock = formatMmSs((match.matchDurationMs ?? 0) + (match.status === 'in_progress' && match.startedAt ? clockTick - match.startedAt : 0));
  const blockScoring = liveActionLoading || tapLock || match.status !== 'in_progress';

  if (isParticipant && (match.status === 'scheduled' || match.status === 'in_progress')) {
    return (
      <div style={styles.livePage}>
        <div style={styles.liveScoreboardRegion}>
          <div style={styles.timerRow}><span>Set {match.liveScore.currentSet + 1} · {setClock}</span><span>Match · {matchClock}</span></div>
          <button aria-label="Match actions" style={styles.actionsIconBtn} onClick={() => setShowManage(true)}>⋮</button>
          <table style={styles.scoreTable}><tbody>
            {[['player1', p1Last], ['player2', p2Last]].map(([key, name]) => {
              const pl = key as 'player1'|'player2';
              const lead = pl === 'player1' ? match.liveScore.player1SetsWon > match.liveScore.player2SetsWon : match.liveScore.player2SetsWon > match.liveScore.player1SetsWon;
              return <tr key={pl}><td style={styles.nameCell}>{match.liveScore.server===pl?'● ':''}{name}</td><td style={{...styles.scoreCell,...(lead?styles.leadingCell:{})}}>{pl==='player1'?match.liveScore.currentGame.player1:match.liveScore.currentGame.player2}</td><td style={styles.scoreCell}>{match.liveScore.sets[0]?.[pl==='player1'?'player1Games':'player2Games'] ?? 0}</td><td style={styles.scoreCell}>{match.liveScore.sets[1]?.[pl==='player1'?'player1Games':'player2Games'] ?? 0}</td>{showSet3 && <td style={styles.scoreCell}>{match.liveScore.sets[2]?.[pl==='player1'?'player1Games':'player2Games'] ?? 0}</td>}<td style={styles.scoreCell}>{pl==='player1'?match.liveScore.player1SetsWon:match.liveScore.player2SetsWon}</td></tr>;
            })}
          </tbody></table>
        </div>
        <div style={styles.hintStrip}>{match.status === 'scheduled' ? 'Waiting for server selection' : liveError ?? ''}</div>
        {match.status === 'scheduled' ? <div style={styles.serverSelectWrap}><button style={styles.liveHalfBtn} onClick={()=>handleStartLive('player1')}>{p1Last} serves</button><button style={styles.liveHalfBtn} onClick={()=>handleStartLive('player2')}>{p2Last} serves</button></div> : <div style={styles.scoreButtonsRegion}><button aria-label={`Add point for ${p1Last}`} style={styles.liveHalfBtn} disabled={blockScoring} onClick={()=>handlePoint('player1')}>+ {p1Last}</button><button aria-label={`Add point for ${p2Last}`} style={styles.liveHalfBtn} disabled={blockScoring} onClick={()=>handlePoint('player2')}>+ {p2Last}</button></div>}
      </div>
    );
  }

  const containerStyles = {
    page: isIosView ? { ...styles.page, ...styles.iosPage } : styles.page,
    nav: isIosView ? { ...styles.nav, ...styles.iosNav } : styles.nav,
    main: isIosView ? { ...styles.main, ...styles.iosMain } : styles.main,
    scoreboard: isIosView ? { ...styles.scoreboard, ...styles.iosScoreboard } : styles.scoreboard,
    section: isIosView ? { ...styles.section, ...styles.iosSection } : styles.section,
  };

  return (
    <div style={containerStyles.page}>
      <nav style={containerStyles.nav}>
        <Link href="/matches" style={styles.back}>← Back to Matches</Link>
        <span style={styles.navBrand}>🎾 Tennis League</span>
      </nav>

      <main style={containerStyles.main}>
        <div style={containerStyles.scoreboard}>
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
        {match.status === 'scheduled' && isParticipant && (
          <div style={styles.liveControlSection}>
            <h2 style={styles.liveControlTitle}>Start Live Scoring</h2>
            <p style={styles.liveControlHint}>Pick who serves first to begin +Live scoring.</p>
            <div style={styles.liveButtonRow}>
              <button style={styles.liveScoreBtn} onClick={() => handleStartLive('player1')} disabled={liveActionLoading}>{liveActionLoading ? 'Starting…' : `${p1Name} serves`}</button>
              <button style={styles.liveScoreBtn} onClick={() => handleStartLive('player2')} disabled={liveActionLoading}>{liveActionLoading ? 'Starting…' : `${p2Name} serves`}</button>
            </div>
          </div>
        )}

        {match.status === 'in_progress' && isParticipant && (
          <div style={styles.liveControlSection}>
            <h2 style={styles.liveControlTitle}>Live Scoring</h2>
            <div style={styles.liveButtonRow}>
              <button style={styles.liveScoreBtn} onClick={() => handlePoint('player1')} disabled={liveActionLoading}>+1 {p1Name}</button>
              <button style={styles.liveScoreBtn} onClick={() => handlePoint('player2')} disabled={liveActionLoading}>+1 {p2Name}</button>
            </div>
            <div style={styles.liveUndoWrap}>
              <button style={styles.liveUndoBtn} onClick={handleUndoPoint} disabled={liveActionLoading || !match.undoSnapshot}>Undo last point</button>
            </div>
          </div>
        )}

        {liveError && <div style={styles.liveError}>{liveError}</div>}

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
        <div style={containerStyles.section}>
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
          <div style={containerStyles.section}>
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
          <div style={containerStyles.section}>
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

  livePage: { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0E1418', color: '#fff' },
  liveScoreboardRegion: { position: 'relative', padding: '12px 10px 8px', flex: '0 0 auto' },
  timerRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#d7e0e3' },
  actionsIconBtn: { position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' },
  scoreTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  nameCell: { padding: '8px 4px', minWidth: 90, fontWeight: 700, fontSize: 14, borderBottom: '1px solid rgba(255,255,255,.14)' },
  scoreCell: { textAlign: 'center' as const, padding: '8px 4px', minWidth: 36, fontSize: 14, borderBottom: '1px solid rgba(255,255,255,.14)' },
  leadingCell: { color: '#FFB44A', fontWeight: 800 },
  hintStrip: { flex: '0 0 56px', minHeight: 56, padding: '12px', borderTop: '1px solid rgba(255,255,255,.12)', borderBottom: '1px solid rgba(255,255,255,.12)', color: '#c9d1d4', fontSize: 13 },
  scoreButtonsRegion: { flex: 1, display: 'flex' },
  serverSelectWrap: { flex: 1, display: 'flex' },
  liveHalfBtn: { flex: 1, width: '50%', border: '1px solid rgba(255,255,255,.15)', background: '#1F525C', color: '#fff', fontSize: 24, fontWeight: 800 },

  page: { minHeight: '100vh', background: '#1a472a' },
  iosPage: { minHeight: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 8 },
  nav: { padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  iosNav: { position: 'sticky', top: 0, zIndex: 5, background: '#1a472a', paddingTop: 'max(12px, env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16 },
  back: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  navBrand: { color: '#fff', fontWeight: 700, fontSize: 18 },
  main: { maxWidth: 700, margin: '0 auto', padding: '24px' },
  iosMain: { padding: '16px 12px 24px' },
  scoreboard: { textAlign: 'center', padding: '32px 0 40px' },
  iosScoreboard: { padding: '20px 0 24px' },
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
  iosSection: { padding: 16, borderRadius: 12 },
  liveControlSection: { background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'center' as const },
  liveControlTitle: { fontSize: 18, fontWeight: 800, color: '#1a472a', margin: '0 0 8px' },
  liveControlHint: { fontSize: 13, color: '#666', margin: '0 0 12px' },
  liveButtonRow: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const },
  liveScoreBtn: { minHeight: 44, background: '#1a472a', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700, cursor: 'pointer' },
  liveUndoWrap: { marginTop: 10 },
  liveUndoBtn: { minHeight: 40, background: '#fff', color: '#1a472a', border: '1px solid #1a472a', borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  liveError: { background: '#fff3f1', color: '#b3261e', borderRadius: 10, padding: 12, marginBottom: 16, textAlign: 'center' as const },
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
