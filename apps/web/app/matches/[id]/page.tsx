'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { celebrateConfirmedScore } from '../../shared/celebrate';
import { PlayerSlotPicker } from '../../shared/PlayerSlotPicker';
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingBlock,
  StatusBadge,
  buttonClassName,
  buttonStyle,
  cardStyle,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  space,
  target,
  type,
  useAnnounce,
  useAsyncAction,
  useDialogClose,
  gutter,
  sectionPadding,
  width,
} from '../../shared/ui';
import {
  IconAlertTriangle, IconArrowBackUp, IconBallTennis, IconCalendarTime, IconCheck, IconChevronLeft, IconClipboardList,
  IconDotsVertical, IconFileTypePdf, IconPencil, IconTrash, IconUserPlus, IconX,
} from '@tabler/icons-react';
import {
  useMatch, useAuthUser, submitMatchReport, confirmMatchReport, disputeMatchReport,
  cancelMatch, postponeMatch, deleteMatch, startMatch, scorePoint, undoLastPoint,
  resolveDisputedReport, useUserProfile, acceptMatchProposal, declineMatchProposal,
  editMatchScore, linkGuestOpponent,
} from '@tennis/firebase-client';
import {
  EMPTY_STATS,
  getMatchMoment,
  formatScoreDisplay,
  formatGameScore,
  isMatchParticipant,
  canRespondToReport,
  sideOfPlayer,
  sideDisplayName,
  isDoublesMatch,
  isAdminRole,
  parseRecordedScoreLine,
  recordedSetsFromScore,
  validateRecordedSets,
  type Match,
  type MatchMoment,
  type MatchMomentTone,
  type PublicProfile,
  type RecordedSetInput,
} from '@tennis/shared';
import Link from 'next/link';
import { useViewMode } from '../../shared/viewMode';
import { useSlow } from '../../shared/network';

type ConfirmAction =
  | { type: 'cancel' }
  | { type: 'postpone'; newTime: number };

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function initialAndLastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
}

// A doubles side is named "Ann Smith / Bob Jones", so shorten each partner.
function shortSideName(name: string, shorten: (part: string) => string): string {
  return name.split(' / ').map(shorten).join(' / ');
}

// Short names for the live scoreboard's buttons. Last names alone are enough
// until both sides share one, then an initial is added, then the full name.
function liveButtonNames(p1Name: string, p2Name: string): [string, string] {
  for (const shorten of [lastName, initialAndLastName]) {
    const p1 = shortSideName(p1Name, shorten);
    const p2 = shortSideName(p2Name, shorten);
    if (p1.toLowerCase() !== p2.toLowerCase()) return [p1, p2];
  }
  return [p1Name, p2Name];
}

function formatMmSs(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function formatWhen(ts?: number): string {
  if (!ts) return 'a time still to be agreed';
  return new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** `datetime-local` value for a moment, in the viewer's time zone. */
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The live match's current moment, or null when there is nothing to call out. */
function liveMoment(match: Match): MatchMoment | null {
  if (match.status !== 'in_progress' || !match.format) return null;
  try {
    const moment = getMatchMoment(match.liveScore, match.format);
    return moment.tone === 'live' ? null : moment;
  } catch {
    return null;
  }
}

/** Band fill per moment, from the scoreboard palette; each carries black text at 7:1 or better. */
const MOMENT_FILL: Record<MatchMomentTone, string> = {
  mp: color.matchPointPink,
  sp: color.scoreboardYellow,
  ad: color.scoreboardYellow,
  tb: color.scoreboardYellow,
  bp: color.playerOrange,
  deuce: color.scoreboardText,
  ok: color.scoreboardMuted,
  live: color.scoreboardMuted,
};

/** A recorded score as the editor's text, from player 1's side: "6-4, 3-6, [10-8]". */
function scoreLine(match: Match): string {
  return recordedSetsFromScore(match.liveScore)
    .filter((set) => set.p1 > 0 || set.p2 > 0)
    .map((set) => (set.matchTiebreak ? `[${set.p1}-${set.p2}]` : `${set.p1}-${set.p2}`))
    .join(', ');
}

/** The opposing side's name from the viewer's seat, or the second side for a spectator. */
function opponentOf(match: Match, uid: string | undefined): string {
  const mine = uid ? sideOfPlayer(match, uid) : undefined;
  return sideDisplayName(match, mine === 'player2' ? 'player1' : 'player2');
}

export default function MatchPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const announce = useAnnounce();
  const { match, loading, error: loadError } = useMatch(id ?? null);
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  const [correctedScore, setCorrectedScore] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSets, setResolveSets] = useState<RecordedSetInput[] | null | undefined>(undefined);
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showEditScore, setShowEditScore] = useState(false);
  const [showLinkGuest, setShowLinkGuest] = useState(false);
  const [liveActionLoading, setLiveActionLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const { effectiveMode } = useViewMode();
  const isIosView = effectiveMode === 'ios';
  const [clockTick, setClockTick] = useState(Date.now());
  const [tapLock, setTapLock] = useState(false);
  // A scheduled match opens on its details; the court view only after "Start live scoring".
  const [onCourt, setOnCourt] = useState(false);
  const [postponeAt, setPostponeAt] = useState('');
  const [postponeError, setPostponeError] = useState<string | null>(null);
  // A point write that hangs (a dropped connection holds it until the network
  // returns) blocks the next tap; after a few seconds the strip says why.
  const slowLiveAction = useSlow(liveActionLoading, 4000);

  const uid = firebaseUser?.uid;
  const opponent = match ? opponentOf(match, uid) : 'your opponent';

  const submitReport = useAsyncAction(() => submitMatchReport(id!, uid!), {
    successMessage: `Score submitted. ${opponent} will be asked to confirm it.`,
    errorMessage: "Couldn't submit the score. Try again.",
  });
  const confirmReport = useAsyncAction(() => confirmMatchReport(id!, uid!), {
    successMessage: 'Score confirmed. The standings are updating.',
    errorMessage: "Couldn't confirm the score. Try again.",
  });
  const accept = useAsyncAction(() => acceptMatchProposal(id!), {
    successMessage: `Proposal accepted. Your match with ${opponent} is scheduled.`,
    errorMessage: "Couldn't accept the proposal. Try again.",
  });

  useEffect(() => {
    if (match?.status !== 'in_progress') return;
    const t = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [match?.status]);

  // Once a match is live, stay on court: undoing the first point returns it to
  // scheduled, and the scorer should still see the serve choice, not the details.
  useEffect(() => {
    if (match?.status === 'in_progress') setOnCourt(true);
  }, [match?.status]);

  // Celebrate a confirmation that happens while the page is open, not every
  // later visit to a completed match. Guest results are not in the standings.
  const previousStatus = useRef(match?.status);
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = match?.status;
    if (before && before !== 'completed' && match?.status === 'completed' && !match.player2IsGuest) {
      celebrateConfirmedScore();
    }
  }, [match?.status, match?.player2IsGuest]);

  if (loading) {
    // A landmark and heading while loading too, so the skip link has a target
    // and a screen reader hears where it is before the match arrives.
    return (
      <main style={styles.loadingPage}>
        <h1 className="sr-only">Match</h1>
        <LoadingBlock label="Loading match…" rows={4} rowHeight={48} />
      </main>
    );
  }

  if (loadError && !match) {
    return (
      <StatePage>
        <ErrorState
          headingLevel={1}
          title="Couldn't load this match."
          error={loadError}
          onRetry={() => window.location.reload()}
        />
      </StatePage>
    );
  }

  if (!id || !match) {
    return (
      <StatePage>
        <EmptyState
          headingLevel={1}
          title="Match not found"
          description="It may have been deleted, or the link is incomplete."
          action={
            <Link href="/matches" className={buttonClassName('primary')} style={buttonStyle('primary')}>
              Back to matches
            </Link>
          }
        />
      </StatePage>
    );
  }

  const isParticipant = !!uid && isMatchParticipant(match, uid);
  const mySide = uid ? sideOfPlayer(match, uid) : undefined;
  const canReviewReport = !!uid && canRespondToReport(match, uid, match.reportSubmission?.submittedBy);
  const submission = match.reportSubmission;
  const p1Name = sideDisplayName(match, 'player1');
  const p2Name = sideDisplayName(match, 'player2');
  const isHistoric = match.source === 'manual';
  const isLeaderOrAdmin = profile?.role === 'division_leader' || isAdminRole(profile?.role);
  // The resolveDisputedReport callable decides for real (leader of this
  // division, or admin); this only decides whether to offer the panel.
  const canResolveReport =
    isLeaderOrAdmin &&
    (match.status === 'disputed' || (match.status === 'pending_report' && !!submission));
  // Players may only correct a result awaiting confirmation; once confirmed,
  // only a leader or admin can change it (the rules enforce the same split).
  const canEditScore =
    ((isParticipant || isLeaderOrAdmin) && match.status === 'pending_report') ||
    (isLeaderOrAdmin && match.status === 'completed');
  const canLinkGuest = isParticipant && !!match.player2IsGuest;

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
  const reporterSide = submission?.submittedBy ? sideOfPlayer(match, submission.submittedBy) : undefined;
  const reporterName = reporterSide ? sideDisplayName(match, reporterSide) : opponent;

  function requestResolve(withCorrectedScore: boolean) {
    setResolveError(null);
    if (!withCorrectedScore) {
      setResolveSets(null);
      return;
    }
    const sets = parseRecordedScoreLine(correctedScore);
    if (!sets) {
      setResolveError(`Enter the score as sets from ${p1Name}'s side, for example 6-4, 3-6, [10-8].`);
      return;
    }
    const invalid = validateRecordedSets(sets);
    if (invalid) {
      setResolveError(invalid);
      return;
    }
    setResolveSets(sets);
  }

  function handlePostponeBy(ms: number) {
    if (!match) return;
    const base = match.scheduledAt ?? Date.now();
    setConfirmAction({ type: 'postpone', newTime: base + ms });
  }

  function handlePostponeTo(event: FormEvent) {
    event.preventDefault();
    const ts = Date.parse(postponeAt);
    if (!postponeAt || Number.isNaN(ts)) {
      setPostponeError('Pick a date and time.');
      return;
    }
    if (ts <= Date.now()) {
      setPostponeError('Pick a time in the future.');
      return;
    }
    setPostponeError(null);
    setConfirmAction({ type: 'postpone', newTime: ts });
  }

  function closeManage() {
    setShowManage(false);
    setShowPostponeOptions(false);
    setPostponeAt('');
    setPostponeError(null);
    setConfirmAction(null);
    setShowDelete(false);
  }

  async function runConfirmAction() {
    if (!confirmAction || !id) return;
    if (confirmAction.type === 'cancel') {
      await cancelMatch(id);
      closeManage();
      announce('Match cancelled.', { toast: true });
    } else {
      await postponeMatch(id, confirmAction.newTime);
      closeManage();
      announce(`Match moved to ${formatWhen(confirmAction.newTime)}.`, { toast: true });
    }
  }

  async function handleStartLive(server: 'player1' | 'player2') {
    if (!match || !id || liveActionLoading) return;
    setLiveError(null);
    setLiveActionLoading(true);
    try {
      await startMatch(id, server, false, match.liveScore);
    } catch (err) {
      console.error('Failed to start live scoring:', err);
      setLiveError(describeError(err, "Couldn't start live scoring. Try again."));
    } finally {
      setLiveActionLoading(false);
    }
  }

  async function handlePoint(player: 'player1' | 'player2') {
    // The point buttons stay enabled while locked (see blockScoring), so the
    // lock is enforced here rather than by the browser.
    if (!match || !id || tapLock || liveActionLoading || match.status !== 'in_progress') return;
    setTapLock(true);
    setTimeout(() => setTapLock(false), 300);
    setLiveError(null);
    setLiveActionLoading(true);
    try {
      await scorePoint(id, match, player);
    } catch (err) {
      console.error('Failed to record point:', err);
      setLiveError("Couldn't record the point. Check your connection and tap again.");
    } finally {
      setLiveActionLoading(false);
    }
  }

  async function handleUndoPoint() {
    if (!match || !id || liveActionLoading || !match.undoSnapshot) return;
    setLiveError(null);
    setLiveActionLoading(true);
    try {
      await undoLastPoint(id, match);
      announce('Last point undone.');
    } catch (err) {
      console.error('Failed to undo point:', err);
      setLiveError("Couldn't undo the point. Try again.");
    } finally {
      setLiveActionLoading(false);
    }
  }

  const canPostpone = match.status === 'scheduled';
  const canCancel = match.status === 'scheduled' || match.status === 'in_progress';
  const canDelete = match.status === 'scheduled' || match.status === 'cancelled';
  // Only offer the options menu when it holds something to do.
  const canManage =
    isParticipant && match.status !== 'cancelled' && match.status !== 'completed' && (canPostpone || canCancel || canDelete);

  const [p1Last, p2Last] = liveButtonNames(p1Name, p2Name);
  const visibleSets = match.liveScore.sets.slice(0, Math.max(2, match.liveScore.currentSet + 1));
  const setClock = formatMmSs((match.liveScore.sets[match.liveScore.currentSet]?.durationMs ?? 0) + (match.status === 'in_progress' && match.currentSetStartedAt ? clockTick - match.currentSetStartedAt : 0));
  const matchClock = formatMmSs((match.matchDurationMs ?? 0) + (match.status === 'in_progress' && match.startedAt ? clockTick - match.startedAt : 0));
  // Applied as aria-disabled, never `disabled`: a focused button that becomes
  // disabled is blurred, and a keyboard scorer would have to Tab back to the
  // point buttons after every point.
  const blockScoring = liveActionLoading || tapLock || match.status !== 'in_progress';
  const blockUndo = liveActionLoading || !match.undoSnapshot;
  const deleteMessage = match.status === 'completed'
    ? 'Deleting a completed match removes it from the standings, and rankings are recalculated without it.'
    : `The match with ${opponent} and everything recorded for it will be permanently deleted.`;

  function openManage() {
    setShowManage(true);
    setShowPostponeOptions(false);
  }

  const confirmCopy = confirmAction?.type === 'postpone'
    ? {
        title: `Move the match to ${formatWhen(confirmAction.newTime)}?`,
        message: `${opponent} will see the new time.`,
        confirmLabel: 'Postpone match',
        pendingLabel: 'Postponing…',
        tone: 'primary' as const,
      }
    : {
        title: `Cancel your match with ${opponent}?`,
        message: "The match will be marked as cancelled for both sides. This can't be undone; propose a new match to play another time.",
        confirmLabel: 'Cancel match',
        pendingLabel: 'Cancelling…',
        tone: 'danger' as const,
      };

  const actionModals = (
    <>
      <Dialog
        open={showManage}
        onClose={closeManage}
        title={showPostponeOptions ? 'Postpone by…' : 'Match options'}
        description={showPostponeOptions ? `Currently ${formatWhen(match.scheduledAt)}.` : undefined}
        size="sm"
      >
        {!showPostponeOptions ? (
          <div style={styles.manageOptions}>
            {canPostpone && (
              <Button variant="secondary" fullWidth icon={<IconCalendarTime size={20} aria-hidden="true" />} onClick={() => setShowPostponeOptions(true)} style={styles.manageOption}>
                Postpone
              </Button>
            )}
            {canCancel && (
              <Button variant="secondary" fullWidth icon={<IconX size={20} aria-hidden="true" />} onClick={() => setConfirmAction({ type: 'cancel' })} style={styles.manageOption}>
                Cancel match
              </Button>
            )}
            {canDelete && (
              <Button variant="quiet-danger" fullWidth icon={<IconTrash size={20} aria-hidden="true" />} onClick={() => setShowDelete(true)} style={styles.manageOption}>
                Delete match
              </Button>
            )}
          </div>
        ) : (
          <div style={styles.manageOptions}>
            {[
              { label: '30 minutes later', ms: 30 * 60 * 1000 },
              { label: '1 hour later', ms: 60 * 60 * 1000 },
              { label: '2 hours later', ms: 2 * 60 * 60 * 1000 },
              { label: '1 day later', ms: 24 * 60 * 60 * 1000 },
            ].map(({ label, ms }) => (
              <Button key={label} variant="secondary" fullWidth onClick={() => handlePostponeBy(ms)} style={styles.manageOption}>
                {label}
              </Button>
            ))}
            <form onSubmit={handlePostponeTo} noValidate style={styles.postponeForm}>
              <label htmlFor="postpone-at" style={fieldLabelStyle}>Or pick a new date and time</label>
              <div style={styles.resolveRow}>
                <input
                  id="postpone-at"
                  type="datetime-local"
                  min={toLocalInputValue(Date.now())}
                  value={postponeAt}
                  onChange={(event) => {
                    setPostponeAt(event.target.value);
                    setPostponeError(null);
                  }}
                  style={styles.resolveInput}
                  aria-invalid={postponeError ? true : undefined}
                  aria-describedby={postponeError ? 'postpone-at-error' : undefined}
                />
                <Button type="submit" variant="secondary">Move to this time</Button>
              </div>
              {postponeError && <p id="postpone-at-error" role="alert" style={styles.fieldError}>{postponeError}</p>}
            </form>
            <Button variant="quiet" fullWidth icon={<IconChevronLeft size={20} aria-hidden="true" />} onClick={() => setShowPostponeOptions(false)}>
              Back to options
            </Button>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        pendingLabel={confirmCopy.pendingLabel}
        cancelLabel="Keep match"
        tone={confirmCopy.tone}
        onConfirm={runConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {showDelete && (
        <DeleteMatchDialog
          message={deleteMessage}
          onCancel={() => setShowDelete(false)}
          onDelete={async () => {
            await deleteMatch(id);
            closeManage();
            announce('Match deleted.', { toast: true });
            router.push('/matches');
          }}
        />
      )}
    </>
  );

  if (isParticipant && (match.status === 'in_progress' || (match.status === 'scheduled' && onCourt))) {
    const columns = Math.max(2, visibleSets.length);
    const serverName = match.liveScore.server === 'player1' ? p1Last : p2Last;
    const moment = liveMoment(match);
    const momentText = moment
      ? moment.player ? `${moment.label} · ${moment.player === 'player1' ? p1Last : p2Last}` : moment.label
      : '';
    return (
      <main style={styles.livePage}>
        <h1 className="sr-only">
          {match.status === 'scheduled' ? 'Start live scoring' : 'Live scoring'}: {p1Name} vs {p2Name}
        </h1>
        <div style={styles.liveScoreboardRegion}>
          <div style={styles.liveTopBar}>
            {match.status === 'scheduled' ? (
              <button type="button" className="tl-tint" style={styles.liveBackBtn} onClick={() => setOnCourt(false)}>
                <IconChevronLeft size={20} aria-hidden="true" /> Details
              </button>
            ) : (
              <Link href="/matches" style={styles.liveBackLink}>
                <IconChevronLeft size={20} aria-hidden="true" /> Matches
              </Link>
            )}
            <div style={styles.timerRow}>
              <span>Set {match.liveScore.currentSet + 1} · {setClock}</span>
              <span>Match · {matchClock}</span>
            </div>
            <button type="button" aria-label="Match options" className="tl-tint" style={styles.actionsIconBtn} onClick={openManage}>
              <IconDotsVertical size={24} aria-hidden="true" />
            </button>
          </div>
          <div style={styles.scoreTableScroll}>
            <table style={styles.scoreTable}>
              <caption className="sr-only">Live score</caption>
              <thead>
                <tr>
                  <th scope="col" style={styles.headCell}>
                    <span className="sr-only">Player</span>
                  </th>
                  <th scope="col" style={styles.headCellNum}>Game</th>
                  {Array.from({ length: columns }).map((_, idx) => (
                    <th key={idx} scope="col" style={styles.headCellNum}>
                      <abbr title={`Set ${idx + 1}`} style={styles.abbr}>S{idx + 1}</abbr>
                    </th>
                  ))}
                  <th scope="col" style={styles.headCellNum}>Sets</th>
                </tr>
              </thead>
              <tbody>
                {([['player1', p1Last], ['player2', p2Last]] as const).map(([pl, name]) => {
                  const lead = pl === 'player1' ? match.liveScore.player1SetsWon > match.liveScore.player2SetsWon : match.liveScore.player2SetsWon > match.liveScore.player1SetsWon;
                  const serving = match.liveScore.server === pl && match.status === 'in_progress';
                  return (
                    <tr key={pl}>
                      <th scope="row" style={{ ...styles.nameCell, borderLeftColor: pl === 'player1' ? color.playerBlue : color.playerOrange }}>
                        {serving && <span aria-hidden="true" style={styles.serveDot}>● </span>}
                        {name}
                        {serving && <span className="sr-only"> (serving)</span>}
                      </th>
                      <td style={{ ...styles.scoreCell, ...(lead ? styles.leadingCell : {}) }}>{pl === 'player1' ? match.liveScore.currentGame.player1 : match.liveScore.currentGame.player2}</td>
                      {Array.from({ length: columns }).map((_, idx) => (
                        <td key={idx} style={styles.scoreCell}>{match.liveScore.sets[idx]?.[pl === 'player1' ? 'player1Games' : 'player2Games'] ?? 0}</td>
                      ))}
                      <td style={styles.scoreCell}>{pl === 'player1' ? match.liveScore.player1SetsWon : match.liveScore.player2SetsWon}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mounted with the scoreboard, before the match starts: screen
              readers often skip text that arrives together with a new live
              region, which would swallow the first point. */}
          <p className="sr-only" aria-live="polite">
            {match.status === 'in_progress'
              ? `${momentText ? `${momentText}. ` : ''}Game ${gameDisplay}. Sets ${scoreDisplay}. ${serverName} serving.`
              : ''}
          </p>
        </div>
        <div style={styles.hintStrip}>
          {liveError ? (
            <span role="alert" style={styles.liveErrorText}>
              <IconAlertTriangle size={18} aria-hidden="true" /> {liveError}
            </span>
          ) : slowLiveAction ? (
            <span role="status" style={styles.liveErrorText}>
              <span className="tl-spinner" aria-hidden="true" /> Still saving. Check your connection; scoring resumes once it lands.
            </span>
          ) : (
            <span style={styles.hintText}>
              {moment && (
                <span aria-hidden="true" style={{ ...styles.momentPill, background: MOMENT_FILL[moment.tone] }}>
                  {momentText}
                </span>
              )}
              <span>{match.status === 'scheduled' ? 'Choose who serves first to start scoring.' : 'Tap the player who won the point.'}</span>
            </span>
          )}
          {match.status === 'in_progress' && (
            <button
              type="button"
              style={{ ...styles.liveUndoStripBtn, ...(!match.undoSnapshot ? styles.liveUnavailable : {}) }}
              onClick={() => void handleUndoPoint()}
              aria-disabled={blockUndo || undefined}
            >
              <IconArrowBackUp size={18} aria-hidden="true" /> Undo
            </button>
          )}
        </div>
        {match.status === 'scheduled' ? (
          <div style={styles.serverSelectWrap}>
            {(['player1', 'player2'] as const).map((pl) => (
              <button
                key={pl}
                type="button"
                style={{ ...styles.liveHalfBtn, borderTopColor: pl === 'player1' ? color.playerBlue : color.playerOrange }}
                onClick={() => void handleStartLive(pl)}
                aria-disabled={liveActionLoading || undefined}
                aria-busy={liveActionLoading || undefined}
              >
                {pl === 'player1' ? p1Last : p2Last} serves first
              </button>
            ))}
          </div>
        ) : (
          <div style={styles.scoreButtonsRegion}>
            {(['player1', 'player2'] as const).map((pl) => {
              const name = pl === 'player1' ? p1Last : p2Last;
              return (
                <button
                  key={pl}
                  type="button"
                  aria-label={`Point to ${name}`}
                  style={{ ...styles.liveHalfBtn, borderTopColor: pl === 'player1' ? color.playerBlue : color.playerOrange }}
                  aria-disabled={blockScoring || undefined}
                  onClick={() => void handlePoint(pl)}
                >
                  + {name}
                </button>
              );
            })}
          </div>
        )}
        {actionModals}
      </main>
    );
  }

  const played =
    ['in_progress', 'pending_report', 'completed', 'disputed'].includes(match.status) || !!match.startedAt;
  const containerStyles = {
    page: isIosView ? { ...styles.page, ...styles.iosPage } : styles.page,
    nav: isIosView ? { ...styles.nav, ...styles.iosNav } : styles.nav,
    main: isIosView ? { ...styles.main, ...styles.iosMain } : styles.main,
    scoreboard: isIosView ? { ...styles.scoreboard, ...styles.iosScoreboard } : styles.scoreboard,
    section: isIosView ? { ...styles.section, ...styles.iosSection } : styles.section,
  };

  // What this viewer can do next, by status.
  let nextStep: ReactNode = null;
  if (match.status === 'proposed') {
    if (mySide === 'player2') {
      nextStep = (
        <StepPanel title={`${opponent} proposed this match`} style={containerStyles.section}>
          <p style={styles.stepText}>For {formatWhen(match.scheduledAt)}. Accept to schedule it, or decline.</p>
          <div style={styles.stepActions}>
            <Button icon={<IconCheck size={18} aria-hidden="true" />} pending={accept.pending} pendingLabel="Accepting…" onClick={() => void accept.run()}>
              Accept proposal
            </Button>
            <Button variant="secondary" icon={<IconX size={18} aria-hidden="true" />} disabled={accept.pending} onClick={() => setShowDecline(true)}>
              Decline
            </Button>
          </div>
          {accept.error && <InlineAlert tone="error">{accept.error}</InlineAlert>}
        </StepPanel>
      );
    } else if (mySide === 'player1') {
      nextStep = (
        <StepPanel title={`Waiting for ${opponent} to accept`} style={containerStyles.section}>
          <p style={styles.stepText}>You proposed {formatWhen(match.scheduledAt)}. {opponent} will get a notification to accept or decline.</p>
          <div style={styles.stepActions}>
            <Button variant="quiet-danger" onClick={() => setShowDecline(true)}>Withdraw proposal</Button>
          </div>
        </StepPanel>
      );
    } else {
      nextStep = (
        <StepPanel title="Proposed" style={containerStyles.section}>
          <p style={styles.stepText}>{p1Name} proposed {formatWhen(match.scheduledAt)}. Waiting for {p2Name} to accept.</p>
        </StepPanel>
      );
    }
  } else if (match.status === 'scheduled') {
    nextStep = isParticipant ? (
      <StepPanel title="Scheduled" style={containerStyles.section}>
        <p style={styles.stepText}>
          Your match with {opponent} is {match.scheduledAt ? `on ${formatWhen(match.scheduledAt)}` : 'still waiting for a time'}. When
          you&apos;re on court, start live scoring and choose who serves first.
        </p>
        <div style={styles.stepActions}>
          <Button icon={<IconBallTennis size={18} aria-hidden="true" />} onClick={() => setOnCourt(true)}>
            Start live scoring
          </Button>
        </div>
      </StepPanel>
    ) : (
      <StepPanel title="Scheduled" style={containerStyles.section}>
        <p style={styles.stepText}>{formatWhen(match.scheduledAt)}. The players start live scoring from this page when they&apos;re on court.</p>
      </StepPanel>
    );
  } else if (match.status === 'in_progress') {
    nextStep = (
      <StepPanel title="Live now" style={containerStyles.section}>
        <p style={styles.stepText}>The score above updates as each point is played.</p>
      </StepPanel>
    );
  } else if (match.status === 'pending_report') {
    if (isParticipant && !submission) {
      nextStep = (
        <StepPanel title="Submit the score" style={containerStyles.section}>
          <p style={styles.stepText}>The match is over. Check the score above, then submit it so {opponent} can confirm it.</p>
          <div style={styles.stepActions}>
            <Button pending={submitReport.pending} pendingLabel="Submitting…" onClick={() => void submitReport.run()}>
              Submit score for confirmation
            </Button>
            {canEditScore && (
              <Button variant="secondary" icon={<IconPencil size={18} aria-hidden="true" />} onClick={() => setShowEditScore(true)}>
                Edit score
              </Button>
            )}
          </div>
          {submitReport.error && <InlineAlert tone="error">{submitReport.error}</InlineAlert>}
        </StepPanel>
      );
    } else if (isParticipant && submission && canReviewReport) {
      nextStep = (
        <StepPanel title="Confirm the score" style={containerStyles.section}>
          <p style={styles.stepText}>
            {reporterName} reported <strong>{scoreDisplay}</strong>. Confirm it if it matches what you played. If it&apos;s wrong, dispute it and a division leader will settle it.
          </p>
          <div style={styles.stepActions}>
            <Button icon={<IconCheck size={18} aria-hidden="true" />} pending={confirmReport.pending} pendingLabel="Confirming…" onClick={() => void confirmReport.run()} className="tl-btn--on-dark" style={styles.confirmBtn}>
              Confirm score
            </Button>
            <Button variant="secondary" icon={<IconAlertTriangle size={18} aria-hidden="true" />} disabled={confirmReport.pending} onClick={() => setShowDisputeConfirm(true)} className="tl-tint" style={styles.disputeBtn}>
              Dispute score
            </Button>
          </div>
          {confirmReport.error && <InlineAlert tone="error">{confirmReport.error}</InlineAlert>}
        </StepPanel>
      );
    } else if (isParticipant && submission) {
      nextStep = (
        <StepPanel title={`Waiting for ${opponent} to confirm`} style={containerStyles.section}>
          <p style={styles.stepText}>
            {submission.submittedBy === uid ? 'You submitted this score.' : 'Your partner submitted this score.'} It counts in the standings once {opponent} confirms it.
          </p>
          {canEditScore && (
            <div style={styles.stepActions}>
              <Button variant="secondary" icon={<IconPencil size={18} aria-hidden="true" />} onClick={() => setShowEditScore(true)}>
                Edit score
              </Button>
            </div>
          )}
        </StepPanel>
      );
    } else {
      nextStep = (
        <StepPanel title="Awaiting confirmation" style={containerStyles.section}>
          <p style={styles.stepText}>{submission ? 'The score has been reported and is waiting for the opposing side to confirm it.' : "The match is over and the score hasn't been submitted yet."}</p>
          {canEditScore && !canResolveReport && (
            <div style={styles.stepActions}>
              <Button variant="secondary" icon={<IconPencil size={18} aria-hidden="true" />} onClick={() => setShowEditScore(true)}>
                Edit score
              </Button>
            </div>
          )}
        </StepPanel>
      );
    }
  } else if (match.status === 'disputed') {
    nextStep = (
      <InlineAlert tone="warning" title="Score disputed" role={null} style={styles.statusAlert}>
        {canResolveReport ? 'Settle it below.' : 'A division leader will review the score and settle it.'}
      </InlineAlert>
    );
  } else if (match.status === 'completed') {
    nextStep = (
      <div style={styles.statusAlert}>
        <InlineAlert tone={match.player2IsGuest ? 'info' : 'success'} title={match.player2IsGuest ? 'Score recorded' : 'Score confirmed'} role={null}>
          {match.player2IsGuest
            ? `Played against a guest, so it isn't in the standings.${canLinkGuest ? ' Link their account once they join, and they can confirm it.' : ''}`
            : 'The standings include this result.'}
        </InlineAlert>
      </div>
    );
  } else if (match.status === 'cancelled') {
    nextStep = (
      <InlineAlert tone="info" title="Cancelled" role={null} style={styles.statusAlert}>
        This match won&apos;t be played. Propose a new match from the matches page to play another time.
      </InlineAlert>
    );
  }

  return (
    <div style={containerStyles.page}>
      <nav style={containerStyles.nav} aria-label="Match">
        <Link href="/matches" style={styles.back}>
          <IconChevronLeft size={20} aria-hidden="true" /> Back to matches
        </Link>
        <span style={styles.navBrand}><IconBallTennis size={20} aria-hidden="true" color="var(--ball-yellow)" /> Tennis League</span>
      </nav>

      <main>
        <h1 className="sr-only">{p1Name} vs {p2Name}</h1>
        <div style={isIosView ? { ...styles.heroBand, padding: `0 ${space.lg}px` } : styles.heroBand}>
          <div style={containerStyles.scoreboard}>
            <div style={styles.badgeRow}>
              <StatusBadge status={match.status} style={styles.statusPill} />
              {isHistoric && <span style={styles.historicBadge}><IconClipboardList size={14} aria-hidden="true" /> Recorded result</span>}
              {isDoublesMatch(match) && <span style={styles.historicBadge}>Doubles</span>}
            </div>
            {played ? (
              <>
                <div style={styles.setsRow}>
                  <span style={styles.setsLabel}>Sets</span>
                  <span style={styles.setsScore}>{setsDisplay}</span>
                </div>
                <div style={styles.score}>{scoreDisplay}</div>
              </>
            ) : (
              <p style={styles.heroWhen}>
                <IconCalendarTime size={24} aria-hidden="true" />
                {match.scheduledAt ? (
                  <time dateTime={new Date(match.scheduledAt).toISOString()}>{formatWhen(match.scheduledAt)}</time>
                ) : (
                  'Time not set yet'
                )}
              </p>
            )}
            {match.status === 'in_progress' && <div style={styles.gameScore}>{gameDisplay}</div>}
            {match.status === 'in_progress' && (
              <div style={styles.server}>
                {match.liveScore.server === 'player1' ? p1Name : p2Name} serves from the {match.liveScore.serviceSide} side
              </div>
            )}
            <div style={styles.playerNamesRow}>
              <span style={{ ...styles.playerNameLabel, ...(match.winner === 'player1' ? styles.playerNameWinner : {}) }}>
                {p1Name}{mySide === 'player1' ? ' (you)' : ''}
              </span>
              <span style={styles.playerVsLabel}>vs</span>
              <span style={{ ...styles.playerNameLabel, ...(match.winner === 'player2' ? styles.playerNameWinner : {}) }}>
                {p2Name}{match.player2IsGuest ? ' (guest)' : ''}{mySide === 'player2' ? ' (you)' : ''}
              </span>
            </div>
            {match.winner && match.status === 'completed' && (
              <p className="sr-only">{match.winner === 'player1' ? p1Name : p2Name} won.</p>
            )}
          </div>
        </div>

        <div style={containerStyles.main}>

          {canManage && (
            <div style={styles.manageWrap}>
              <Button variant="secondary" size="sm" icon={<IconDotsVertical size={18} aria-hidden="true" />} onClick={openManage}>
                Match options
              </Button>
            </div>
          )}

          {nextStep}

          {canLinkGuest && (
            <StepPanel title="Link your opponent's account" style={containerStyles.section}>
              <p style={styles.stepText}>
                Did {p2Name} join the app? Link their account to put this match in their history
                {match.status === 'completed' ? ' and ask them to confirm the result, so it can count in the standings.' : '.'}
              </p>
              <div style={styles.stepActions}>
                <Button variant="secondary" icon={<IconUserPlus size={18} aria-hidden="true" />} onClick={() => setShowLinkGuest(true)}>
                  Link account
                </Button>
              </div>
            </StepPanel>
          )}

          {canResolveReport && (
            <StepPanel title="Settle this result" style={containerStyles.section}>
              <p style={styles.stepText}>
                {match.status === 'disputed'
                  ? 'The players disagree on this score. Confirm the reported score, or enter the correct one.'
                  : 'The opposing side has not answered this report. Confirm the reported score, or enter the correct one.'}
                {' '}Either way, the result is final and counts in the standings.
              </p>
              <p style={styles.resolveReported}>Reported: {p1Name} {scoreDisplay} {p2Name}</p>
              <div style={styles.stepActions}>
                <Button icon={<IconCheck size={18} aria-hidden="true" />} onClick={() => requestResolve(false)} className="tl-btn--on-dark" style={styles.confirmBtn}>
                  Confirm reported score
                </Button>
              </div>
              <div>
                <label style={fieldLabelStyle} htmlFor="corrected-score">
                  Or set the correct score, with {p1Name}&apos;s games first
                </label>
                <div style={styles.resolveRow}>
                  <input
                    id="corrected-score"
                    type="text"
                    autoComplete="off"
                    placeholder="6-4, 3-6, [10-8]"
                    value={correctedScore}
                    onChange={(e) => {
                      setCorrectedScore(e.target.value);
                      setResolveError(null);
                    }}
                    style={styles.resolveInput}
                    aria-invalid={resolveError ? true : undefined}
                    aria-describedby={resolveError ? 'corrected-score-error' : undefined}
                  />
                  <Button variant="secondary" onClick={() => requestResolve(true)} disabled={!correctedScore.trim()}>
                    Save correct score
                  </Button>
                </div>
                {resolveError && <p id="corrected-score-error" role="alert" style={styles.fieldError}>{resolveError}</p>}
              </div>
              {canEditScore && match.status === 'pending_report' && (
                <p style={styles.stepNote}>
                  To send a corrected score back to the players for confirmation instead,{' '}
                  <button type="button" className="tl-link" style={styles.inlineLinkBtn} onClick={() => setShowEditScore(true)}>edit the score</button>.
                </p>
              )}
            </StepPanel>
          )}

          {match.status === 'completed' && canEditScore && (
            <div style={styles.manageWrap}>
              <Button variant="secondary" size="sm" icon={<IconPencil size={18} aria-hidden="true" />} onClick={() => setShowEditScore(true)}>
                Edit score
              </Button>
            </div>
          )}

          {/* Set breakdown */}
          {played && (
            <section style={containerStyles.section} aria-labelledby="set-breakdown-title">
              <h2 id="set-breakdown-title" style={styles.sectionTitle}>Set breakdown</h2>
              {match.liveScore.sets.filter(s => s.winner || match.liveScore.currentSet === s.setNumber).length === 0 ? (
                <p style={styles.stepText}>No games played yet.</p>
              ) : (
                match.liveScore.sets.filter(s => s.winner || match.liveScore.currentSet === s.setNumber).map((s, i) => (
                  <div key={i} style={styles.setRow}>
                    <span style={styles.setLabel}>{s.matchTiebreak ? 'Match tiebreak' : `Set ${i + 1}`}</span>
                    <span style={{ ...styles.setScore, fontWeight: s.winner === 'player1' ? 700 : 400 }}>{s.matchTiebreak && s.tiebreak ? s.tiebreak.player1Points : s.player1Games}</span>
                    <span style={styles.setDash} aria-hidden="true">–</span>
                    <span style={{ ...styles.setScore, fontWeight: s.winner === 'player2' ? 700 : 400 }}>{s.matchTiebreak && s.tiebreak ? s.tiebreak.player2Points : s.player2Games}</span>
                    {s.tiebreak && !s.matchTiebreak && (
                      <span style={styles.tbScore}>
                        (tiebreak {s.winner === 'player1' ? s.tiebreak.player2Points : s.tiebreak.player1Points})
                      </span>
                    )}
                    {s.winner && (
                      <span style={styles.setWinner}>
                        <IconCheck size={14} aria-hidden="true" /> {s.winner === 'player1' ? p1Name : p2Name}
                      </span>
                    )}
                  </div>
                ))
              )}
            </section>
          )}

          {/* Stats */}
          {match.status === 'completed' && !isHistoric && (
            <section style={containerStyles.section} aria-labelledby="match-stats-title">
              <h2 id="match-stats-title" style={styles.sectionTitle}>Match statistics</h2>
              <div style={styles.statsTable} role="table" aria-label="Match statistics">
                <StatRow label="Statistic" v1={p1Name} v2={p2Name} header />
                <StatRow label="Receiving points won" v1={statPercent(p1Stats.receivingPointsWon, p1Stats.receivingPointsTotal)} v2={statPercent(p2Stats.receivingPointsWon, p2Stats.receivingPointsTotal)} />
                <StatRow label="Break points won" v1={`${p1Stats.breakPointsWon}/${p1Stats.breakPointsFaced}`} v2={`${p2Stats.breakPointsWon}/${p2Stats.breakPointsFaced}`} />
                {match.advancedStatsEnabled && <>
                  <StatRow label="Aces" v1={String(p1Stats.aces)} v2={String(p2Stats.aces)} />
                  <StatRow label="Double faults" v1={String(p1Stats.doubleFaults)} v2={String(p2Stats.doubleFaults)} />
                  <StatRow label="Winners" v1={String(p1Stats.winners)} v2={String(p2Stats.winners)} />
                  <StatRow label="Unforced errors" v1={String(p1Stats.unforcedErrors)} v2={String(p2Stats.unforcedErrors)} />
                </>}
              </div>
              <div style={{ ...styles.statsTable, marginTop: space.lg }} role="table" aria-label="Elapsed time">
                <StatRow label="Elapsed time" v1="Duration" v2="" header />
                {match.liveScore.sets.filter((set) => set.winner).map((set) => (
                  <StatRow key={set.setNumber} label={`Set ${set.setNumber + 1}`} v1={formatDuration(set.durationMs)} v2="" />
                ))}
                <StatRow label="Match" v1={formatDuration(match.matchDurationMs)} v2="" />
              </div>
            </section>
          )}

          {/* Only render links the server generated: older matches could carry a
              client-written reportUrl, and an href is never given another scheme. */}
          {match.status === 'completed' && (
            <div style={containerStyles.section}>
              {match.reportUrl?.startsWith('https://') ? (
                <a href={match.reportUrl} target="_blank" rel="noreferrer" className={buttonClassName('primary')} style={buttonStyle('primary')}>
                  <IconFileTypePdf size={20} aria-hidden="true" /> Download match report (PDF)
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <p style={styles.stepText}>The PDF match report appears here once it&apos;s ready.</p>
              )}
            </div>
          )}

          <ConfirmDialog
            open={showDisputeConfirm}
            title="Dispute this score?"
            message="A division leader will review it and set the final score. Only dispute if the score shown is wrong."
            confirmLabel="Dispute score"
            pendingLabel="Disputing…"
            onConfirm={async () => {
              if (!uid) return;
              await disputeMatchReport(id, uid);
              setShowDisputeConfirm(false);
              announce('Score disputed. A division leader will review it.', { toast: true });
            }}
            onCancel={() => setShowDisputeConfirm(false)}
          />

          <ConfirmDialog
            open={resolveSets !== undefined}
            tone="primary"
            title={resolveSets ? 'Save the corrected score as final?' : `Make ${scoreDisplay} the final result?`}
            message={`It counts in the standings right away${resolveSets ? `, replacing the reported ${scoreDisplay}` : ''}.`}
            confirmLabel={resolveSets ? 'Save final score' : 'Confirm reported score'}
            pendingLabel="Saving…"
            onConfirm={async () => {
              await resolveDisputedReport(id, resolveSets ?? undefined);
              setResolveSets(undefined);
              setCorrectedScore('');
              announce('Result settled. It counts in the standings now.', { toast: true });
            }}
            onCancel={() => setResolveSets(undefined)}
          />

          {actionModals}
        </div>
      </main>

      <ConfirmDialog
        open={showDecline}
        title={mySide === 'player1' ? `Withdraw your proposal to ${opponent}?` : `Decline ${opponent}'s proposal?`}
        message={mySide === 'player1'
          ? `${opponent} won't be able to accept it any more.`
          : `${opponent} will be told you declined. To play another time, propose a new match.`}
        confirmLabel={mySide === 'player1' ? 'Withdraw proposal' : 'Decline proposal'}
        pendingLabel={mySide === 'player1' ? 'Withdrawing…' : 'Declining…'}
        cancelLabel={mySide === 'player1' ? 'Keep proposal' : 'Cancel'}
        onConfirm={async () => {
          await declineMatchProposal(id);
          setShowDecline(false);
          announce(mySide === 'player1' ? 'Proposal withdrawn.' : 'Proposal declined.', { toast: true });
        }}
        onCancel={() => setShowDecline(false)}
      />

      {showEditScore && (
        <EditScoreDialog
          match={match}
          p1Name={p1Name}
          onClose={() => setShowEditScore(false)}
          onSave={async (sets) => {
            await editMatchScore(id, sets);
            setShowEditScore(false);
            announce('Score updated. It needs to be submitted and confirmed again before it counts.', { toast: true });
          }}
        />
      )}

      {showLinkGuest && uid && (
        <LinkGuestDialog
          guestName={p2Name}
          divisionId={match.divisionId}
          excludeIds={[uid, match.player1Id]}
          completed={match.status === 'completed'}
          onClose={() => setShowLinkGuest(false)}
          onLink={async (player) => {
            const wasCompleted = match.status === 'completed';
            await linkGuestOpponent(id, player.id, player.displayName ?? '', match, uid);
            setShowLinkGuest(false);
            announce(
              wasCompleted
                ? `${player.displayName} was linked and asked to confirm the result. It counts in the standings once they do.`
                : `${player.displayName} was linked to this match.`,
              { toast: true },
            );
          }}
        />
      )}
    </div>
  );
}

function StatePage({ children }: { children: ReactNode }) {
  return (
    <main style={styles.statePage}>
      <div style={{ ...cardStyle, padding: 0, width: '100%', maxWidth: width.dialog }}>{children}</div>
    </main>
  );
}

function StepPanel({ title, children, style }: { title: string; children: ReactNode; style: CSSProperties }) {
  const headingId = useId();
  return (
    <section style={{ ...style, ...styles.stepPanel }} aria-labelledby={headingId}>
      <h2 id={headingId} style={styles.stepTitle}>{title}</h2>
      {children}
    </section>
  );
}

function DialogCancel({ label = 'Cancel', disabled }: { label?: string; disabled?: boolean }) {
  const close = useDialogClose();
  return (
    <Button variant="secondary" onClick={close} disabled={disabled}>
      {label}
    </Button>
  );
}

/** Permanent delete, guarded by typing DELETE. */
function DeleteMatchDialog({ message, onCancel, onDelete }: { message: string; onCancel: () => void; onDelete: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().toUpperCase() === 'DELETE';
  const formId = 'delete-match-form';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      await onDelete();
    } catch (caught) {
      setError(describeError(caught, "Couldn't delete the match. Try again."));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      role="alertdialog"
      size="sm"
      onClose={onCancel}
      title="Delete this match?"
      description={`${message} This can't be undone.`}
      dismissible={!pending}
      footer={
        <>
          <DialogCancel label="Keep match" disabled={pending} />
          <Button type="submit" form={formId} variant="danger" disabled={!ready} pending={pending} pendingLabel="Deleting…" icon={<IconTrash size={18} aria-hidden="true" />}>
            Delete match
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <label htmlFor="delete-match-confirm" style={fieldLabelStyle}>Type DELETE to confirm</label>
        <input
          id="delete-match-confirm"
          type="text"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          style={inputStyle}
          data-autofocus
        />
        {error && <InlineAlert tone="error" style={{ marginTop: space.md }}>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

function EditScoreDialog({ match, p1Name, onClose, onSave }: {
  match: Match;
  p1Name: string;
  onClose: () => void;
  onSave: (sets: RecordedSetInput[]) => Promise<void>;
}) {
  const initial = scoreLine(match);
  const [text, setText] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = 'edit-score-form';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const sets = parseRecordedScoreLine(text);
    if (!sets) {
      setError(`Enter the score as sets from ${p1Name}'s side, for example 6-4, 3-6, [10-8].`);
      return;
    }
    const invalid = validateRecordedSets(sets);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave(sets);
    } catch (caught) {
      setError(describeError(caught, "Couldn't save the score. Try again."));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit score"
      description={
        match.status === 'completed'
          ? 'Saving reopens this confirmed result. It leaves the standings until the score is submitted and confirmed again.'
          : 'Saving clears the current report. The score then needs to be submitted and confirmed again before it counts.'
      }
      dirty={text !== initial}
      dismissible={!pending}
      footer={
        <>
          <DialogCancel disabled={pending} />
          <Button type="submit" form={formId} pending={pending} pendingLabel="Saving…">
            Save score
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <label htmlFor="edit-score-input" style={fieldLabelStyle}>
          Score, with {p1Name}&apos;s games first
        </label>
        <input
          id="edit-score-input"
          type="text"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          placeholder="6-4, 3-6, [10-8]"
          style={inputStyle}
          aria-invalid={error ? true : undefined}
          aria-describedby="edit-score-hint"
        />
        <p id="edit-score-hint" style={styles.fieldHint}>Separate sets with commas. Write a 10-point match tiebreak in brackets, such as [10-8].</p>
        {error && <InlineAlert tone="error" style={{ marginTop: space.md }}>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

function LinkGuestDialog({ guestName, divisionId, excludeIds, completed, onClose, onLink }: {
  guestName: string;
  divisionId: string;
  excludeIds: string[];
  completed: boolean;
  onClose: () => void;
  onLink: (player: PublicProfile) => Promise<void>;
}) {
  const [player, setPlayer] = useState<PublicProfile | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = 'link-guest-form';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!player) {
      setError(`Choose the player who played as ${guestName}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onLink(player);
    } catch (caught) {
      setError(describeError(caught, "Couldn't link the account. Try again."));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Link ${guestName}'s account`}
      description={
        completed
          ? 'They will be asked to confirm this result. It counts in the standings once they do.'
          : 'The match moves into their history.'
      }
      dirty={!!player}
      dismissible={!pending}
      footer={
        <>
          <DialogCancel disabled={pending} />
          <Button type="submit" form={formId} pending={pending} pendingLabel="Linking…">
            Link account
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <PlayerSlotPicker
          label="Division player"
          inputId="link-guest-search"
          divisionId={divisionId}
          excludeIds={excludeIds}
          selected={player}
          onSelect={(selected) => {
            setPlayer(selected);
            setError(null);
          }}
          onClear={() => setPlayer(null)}
        />
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

function StatRow({ label, v1, v2, header }: { label: string; v1: string; v2: string; header?: boolean }) {
  return (
    <div role="row" style={{ ...styles.statRow, ...(header ? styles.statRowHeader : {}) }}>
      <span role={header ? 'columnheader' : 'rowheader'} style={header ? styles.statHeadLabel : styles.statLabel}>{label}</span>
      <span role={header ? 'columnheader' : 'cell'} style={styles.statVal}>{v1}</span>
      <span role={header ? 'columnheader' : 'cell'} style={styles.statVal}>{v2}</span>
    </div>
  );
}

const onGreenMuted = color.greenLight;

const styles: Record<string, CSSProperties> = {
  loadingPage: { maxWidth: width.reading, margin: '48px auto', padding: `0 ${gutter}` },
  statePage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space.lg, background: color.canvas },

  // Live court view (participants): the black scoreboard.
  // At least the viewport, never locked to it: large text, a short landscape
  // window, or a five-set table grows the page instead of clipping Undo.
  livePage: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: color.scoreboardBlack, color: color.scoreboardText },
  liveScoreboardRegion: { position: 'relative', padding: `${space.sm}px ${space.md}px ${space.sm}px`, flex: '0 0 auto', background: color.scoreboardRow },
  liveTopBar: { display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  liveBackBtn: { display: 'inline-flex', alignItems: 'center', gap: space.xxs, minHeight: target.min, padding: `0 ${space.sm}px 0 0`, background: 'transparent', border: 'none', color: color.scoreboardMuted, ...type.label, cursor: 'pointer' },
  hintText: { display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  momentPill: { display: 'inline-flex', alignItems: 'center', minHeight: 28, padding: '2px 10px', borderRadius: radius.sm, color: color.scoreboardBlack, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '0.02em', textTransform: 'uppercase' },
  liveBackLink: { display: 'inline-flex', alignItems: 'center', gap: space.xxs, minHeight: target.min, paddingRight: space.sm, color: color.scoreboardMuted, ...type.label, textDecoration: 'none' },
  timerRow: { flex: 1, display: 'flex', justifyContent: 'space-between', gap: space.sm, ...type.bodySmall, color: color.scoreboardMuted, fontVariantNumeric: 'tabular-nums' },
  actionsIconBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: target.control, minHeight: target.control, background: 'transparent', border: 'none', borderRadius: radius.md, color: color.scoreboardText, cursor: 'pointer' },
  // A safety net only: the name column shrinks first (nameCell), so a
  // best-of-five table fits a 320px screen without scrolling.
  scoreTableScroll: { overflowX: 'auto' },
  scoreTable: { width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' },
  headCell: { padding: '4px', textAlign: 'left' },
  headCellNum: { padding: '4px', textAlign: 'center', ...type.caption, color: color.scoreboardMuted, fontWeight: 600 },
  abbr: { textDecoration: 'none' },
  // width 100% with maxWidth 0 gives the name the space the score columns
  // leave, and ellipsizes it rather than pushing the last column off screen.
  nameCell: { padding: '10px 8px', width: '100%', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, borderBottom: `1px solid ${color.scoreboardLine}`, borderLeft: '4px solid transparent' },
  serveDot: { color: color.scoreboardYellow },
  scoreCell: { textAlign: 'center', padding: '10px 2px', minWidth: 32, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, borderBottom: `1px solid ${color.scoreboardLine}` },
  leadingCell: { color: color.scoreboardYellow },
  hintStrip: { flex: '0 0 auto', minHeight: 60, padding: `${space.sm}px ${space.md}px`, borderTop: `1px solid ${color.scoreboardLine}`, borderBottom: `1px solid ${color.scoreboardLine}`, background: color.scoreboardPanel, color: color.scoreboardMuted, ...type.bodySmall, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  liveErrorText: { display: 'inline-flex', alignItems: 'center', gap: space.xs, color: color.scoreboardText, fontWeight: 600 },
  // Nothing to undo yet. The button stays focusable (aria-disabled), so it is
  // dimmed to show it does nothing.
  liveUnavailable: { opacity: 0.5 },
  liveUndoStripBtn: { flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: space.xs, minHeight: target.min, padding: '0 16px', borderRadius: radius.md, border: `1px solid ${color.scoreboardMuted}`, background: 'transparent', color: color.scoreboardText, ...type.label, fontSize: 15, cursor: 'pointer' },
  scoreButtonsRegion: { flex: 1, display: 'flex' },
  serverSelectWrap: { flex: 1, display: 'flex' },
  liveHalfBtn: { flex: 1, width: '50%', minHeight: 160, border: `1px solid ${color.scoreboardLine}`, borderTop: '6px solid transparent', background: color.scoreboardControl, color: color.scoreboardText, fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, cursor: 'pointer', padding: space.md, overflowWrap: 'anywhere' },

  // Clubhouse view
  page: { minHeight: '100vh', background: color.canvas },
  heroBand: { background: color.brandFill, padding: `0 ${gutter}` },
  heroWhen: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space.sm, margin: `${space.sm}px 0 0`, fontFamily: 'var(--font-display)', color: color.onBrand, fontSize: 28, fontWeight: 700, overflowWrap: 'anywhere' },
  postponeForm: { marginTop: space.sm },
  iosPage: { minHeight: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' },
  nav: { background: color.brandFill, padding: `12px ${gutter}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  iosNav: { position: 'sticky', top: 0, zIndex: 5, background: color.brandFill, paddingTop: 'max(12px, env(safe-area-inset-top))', paddingLeft: space.lg, paddingRight: space.lg },
  back: { display: 'inline-flex', alignItems: 'center', gap: space.xxs, minHeight: target.min, color: color.onBrand, ...type.label, fontSize: 15, textDecoration: 'none' },
  navBrand: { display: 'inline-flex', alignItems: 'center', gap: space.xs, fontFamily: 'var(--font-display)', color: color.onBrand, fontWeight: 700, fontSize: 20 },
  main: { maxWidth: width.reading, margin: '0 auto', padding: `${space.lg}px ${gutter} ${space.xxl}px` },
  iosMain: { padding: `${space.lg}px ${space.lg}px ${space.xl}px` },
  scoreboard: { maxWidth: width.reading, margin: '0 auto', textAlign: 'center', padding: '24px 0 32px' },
  iosScoreboard: { padding: '16px 0 24px' },
  badgeRow: { display: 'flex', gap: space.sm, justifyContent: 'center', alignItems: 'center', marginBottom: space.lg, flexWrap: 'wrap' },
  statusPill: { background: color.surface, padding: '4px 12px', borderRadius: radius.pill },
  historicBadge: { display: 'inline-flex', alignItems: 'center', gap: space.xs, ...type.caption, fontWeight: 600, color: color.ink, background: color.surfaceMuted, padding: '4px 10px', borderRadius: radius.pill },
  playerNamesRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space.md, marginTop: space.lg, flexWrap: 'wrap' },
  playerNameLabel: { color: color.onBrand, fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' },
  playerNameWinner: { color: color.ballYellow, fontWeight: 700 },
  playerVsLabel: { color: onGreenMuted, fontSize: 14 },
  manageWrap: { display: 'flex', justifyContent: 'center', marginBottom: space.lg },
  manageOptions: { display: 'flex', flexDirection: 'column', gap: space.sm, paddingBottom: space.lg },
  manageOption: { justifyContent: 'flex-start' },
  setsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space.md, marginBottom: space.sm },
  setsLabel: { color: onGreenMuted, fontSize: 16 },
  setsScore: { fontFamily: 'var(--font-display)', color: color.onBrand, fontSize: 28, fontWeight: 700 },
  // Scales from 36px on a 320px phone to 56px, so a five-set line wraps between sets, not inside one.
  score: { fontFamily: 'var(--font-display)', color: color.onBrand, fontSize: 'clamp(36px, 11vw, 56px)', fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.1, marginBottom: space.sm, wordSpacing: '0.12em' },
  gameScore: { fontFamily: 'var(--font-display)', color: color.greenLight, fontSize: 28, fontWeight: 600, marginBottom: space.lg },
  server: { color: color.ballYellow, ...type.label },
  section: { ...cardStyle, padding: sectionPadding, marginBottom: space.lg },
  iosSection: { padding: space.lg },
  stepPanel: { display: 'flex', flexDirection: 'column', gap: space.md },
  stepTitle: { ...type.headline, color: color.clubhouseGreen, margin: 0 },
  stepText: { ...type.body, color: color.ink, margin: 0 },
  stepNote: { ...type.bodySmall, color: color.textMuted, margin: 0 },
  stepActions: { display: 'flex', gap: space.md, flexWrap: 'wrap' },
  statusAlert: { marginBottom: space.lg },
  confirmBtn: { background: color.courtGreenFill },
  disputeBtn: { color: color.destructivePressed, borderColor: color.destructive },
  inlineLinkBtn: { background: 'none', border: 'none', padding: 0, minHeight: 0, color: color.clubhouseGreen, ...type.bodySmall, fontWeight: 600, cursor: 'pointer' },
  sectionTitle: { ...type.title, color: color.clubhouseGreen, marginBottom: space.md },
  setRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space.md, padding: '10px 0', borderBottom: `1px solid ${color.border}` },
  setLabel: { ...type.bodySmall, color: color.textMuted, width: 112 },
  setScore: { fontFamily: 'var(--font-display)', fontSize: 22, color: color.ink, width: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  setDash: { color: color.textMuted },
  tbScore: { ...type.caption, color: color.textMuted },
  setWinner: { display: 'inline-flex', alignItems: 'center', gap: space.xs, color: color.courtGreen, ...type.label, marginLeft: 'auto', minWidth: 0, overflowWrap: 'anywhere' },
  statsTable: { borderRadius: radius.md, overflow: 'hidden', border: `1px solid ${color.border}` },
  statRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(72px, 120px) minmax(72px, 120px)', gap: space.sm, padding: '10px 16px', borderBottom: `1px solid ${color.border}`, alignItems: 'center' },
  statRowHeader: { background: color.surfaceMuted, ...type.label, color: color.clubhouseGreen },
  statHeadLabel: { color: color.clubhouseGreen },
  statLabel: { ...type.bodySmall, color: color.textMuted },
  statVal: { textAlign: 'center', ...type.bodySmall, fontWeight: 500, color: color.ink, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' },
  resolveReported: { ...type.label, fontSize: 16, color: color.ink, margin: 0 },
  resolveRow: { display: 'flex', gap: space.sm, flexWrap: 'wrap' },
  resolveInput: { ...inputStyle, flex: '1 1 180px', width: 'auto' },
  fieldError: { ...type.caption, color: color.destructivePressed, margin: `${space.xs}px 0 0` },
  fieldHint: { ...type.bodySmall, color: color.textMuted, margin: `${space.sm}px 0 0` },
};
