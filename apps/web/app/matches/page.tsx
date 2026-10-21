"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useViewMode } from "../shared/viewMode";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot, where } from "firebase/firestore";
import {
  divisionMatchesQuery,
  divisionMatchesUnorderedQuery,
  recordHistoricMatch,
  recordMatchOnBehalf,
  proposeMatch,
  proposeDoublesMatch,
  createMatch,
  startMatch,
  acceptMatchProposal,
  declineMatchProposal,
  useActiveDivisionId,
  useAuthUser,
  useUserProfile,
  useDivisionLevels,
  useDivisionMemberships,
  usePlayerMatches,
} from "@tennis/firebase-client";
import {
  formatScoreDisplay,
  formatGameScore,
  currentSeasonForDate,
  defaultSeasonOptions,
  sideOfPlayer,
  sideDisplayName,
  isMatchParticipant,
  isDoublesMatch,
  canRespondToReport,
  canBeMatchTiebreak,
  isAdminRole,
  parseRecordedSetToken,
  validateRecordedSets,
} from "@tennis/shared";
import type {
  DivisionLevel,
  DivisionMembershipStatus,
  Match,
  Player,
  PublicProfile,
  RecordedSetInput,
} from "@tennis/shared";
import { PlayerSlotPicker } from "../shared/PlayerSlotPicker";
import {
  AnimatedDiv,
  Button,
  ConfirmDialog,
  DataState,
  Dialog,
  EmptyState,
  InlineAlert,
  StatusBadge,
  buttonClassName,
  buttonStyle,
  cardStyle,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  shadow,
  space,
  target,
  type,
  useAnnounce,
  useAsyncAction,
  useDialogClose,
  width,
  pageMainStyle,
} from "../shared/ui";
import type { ButtonVariant } from "../shared/ui";
import {
  IconBallTennis,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCheck,
  IconChevronDown,
  IconClipboardList,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

type SetDraft = { p1: string; p2: string; matchTiebreak?: boolean };

/** Rostered statuses: a waitlisted player still has a division level. */
const ROSTERED: readonly DivisionMembershipStatus[] = ["active", "waitlisted"];

/** Longest guest name the match rules accept is 100; 80 matches every other name field. */
const MAX_GUEST_NAME_LENGTH = 80;

/** Cards a collapsed group shows before "Show more", so a full season's history doesn't render at once. */
const GROUP_PAGE_SIZE = 24;

/** Moves focus to a field by id, when it is on screen (a filled player slot has no search field). */
function focusField(id: string) {
  document.getElementById(id)?.focus();
}

/** Clears the match tiebreak flag from any row that is no longer the deciding set. */
function withEligibleTiebreaks(rows: SetDraft[]): SetDraft[] {
  return rows.map((row, i) =>
    row.matchTiebreak && !canBeMatchTiebreak(i, rows.length)
      ? { p1: row.p1, p2: row.p2 }
      : row,
  );
}

function formatWhen(ts?: number): string {
  if (!ts) return "Time not set";
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** When the match was (or will be) played, for sorting by play date. */
function playDate(m: Match): number {
  return m.scheduledAt ?? m.startedAt ?? m.completedAt ?? m.createdAt ?? 0;
}

/** `datetime-local` value for a moment, in the viewer's time zone. */
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A side's name as the viewer reads it: their own side is "You" (or "You and
 * Bob Jones" in doubles), a guest is marked as one.
 */
function sideLabel(m: Match, side: Player, uid: string | undefined, myName: string | undefined): string {
  const name = sideDisplayName(m, side);
  const isMine = !!uid && sideOfPlayer(m, uid) === side;
  if (isMine) {
    if (!isDoublesMatch(m)) return "You";
    const partner = name
      .split(" / ")
      .map((part) => part.trim())
      .filter((part) => part && part !== myName?.trim());
    return partner.length === 1 ? `You and ${partner[0]}` : `Your team (${name})`;
  }
  return side === "player2" && m.player2IsGuest ? `${name} (guest)` : name;
}

/** The side opposite the viewer, by name; the second side when they aren't playing. */
function opponentName(m: Match, uid: string | undefined): string {
  const mine = uid ? sideOfPlayer(m, uid) : undefined;
  return sideDisplayName(m, mine === "player2" ? "player1" : "player2");
}

function serverLine(m: Match, uid: string | undefined, myName: string | undefined): string {
  const server = sideLabel(m, m.liveScore.server, uid, myName);
  const plural = server === "You" || server.startsWith("You and ");
  return `${server} ${plural ? "serve" : "serves"} from the ${m.liveScore.serviceSide} side`;
}

function hasBeenPlayed(m: Match): boolean {
  return ["in_progress", "pending_report", "completed", "disputed"].includes(m.status);
}

type CardLink = { label: string; variant?: ButtonVariant };

function MatchCard({
  m,
  uid,
  myName,
  context,
  actions,
  link,
  featured,
}: {
  m: Match;
  uid?: string;
  myName?: string;
  context?: ReactNode;
  actions?: ReactNode;
  link: CardLink;
  featured?: boolean;
}) {
  const headingId = useId();
  const isLive = m.status === "in_progress";
  const isRecorded = m.source === "manual";
  const p1 = sideLabel(m, "player1", uid, myName);
  const p2 = sideLabel(m, "player2", uid, myName);
  const winnerLabel = m.winner === "player1" ? p1 : m.winner === "player2" ? p2 : null;
  const played = hasBeenPlayed(m);

  return (
    <article
      aria-labelledby={headingId}
      style={{
        ...styles.card,
        ...(isLive ? styles.cardLive : {}),
        ...(featured ? styles.cardFeatured : {}),
      }}
    >
      <div style={styles.cardTop}>
        <StatusBadge status={m.status} />
        <div style={styles.badges}>
          {isRecorded && (
            <span style={styles.recordedBadge}>
              <IconClipboardList size={14} aria-hidden="true" /> Recorded result
            </span>
          )}
          {m.status === "completed" && winnerLabel && (
            <span style={styles.winnerBadge}>{winnerLabel === "You" ? "You won" : `${winnerLabel} won`}</span>
          )}
        </div>
      </div>

      <h3 id={headingId} style={featured ? styles.cardTitleFeatured : styles.cardTitle}>
        <span style={m.winner === "player1" ? styles.winnerName : undefined}>{p1}</span>
        <span style={styles.vs}> vs </span>
        <span style={m.winner === "player2" ? styles.winnerName : undefined}>{p2}</span>
      </h3>

      {played ? (
        <p style={styles.scoreBlock}>
          <span style={styles.setScore}>{formatScoreDisplay(m.liveScore)}</span>
          {isLive && <span style={styles.gameScore}>{formatGameScore(m.liveScore)}</span>}
        </p>
      ) : (
        <p style={styles.whenLine}>
          <IconCalendarEvent size={16} aria-hidden="true" />
          {m.scheduledAt ? <time dateTime={new Date(m.scheduledAt).toISOString()}>{formatWhen(m.scheduledAt)}</time> : formatWhen()}
        </p>
      )}

      {isLive && <p style={styles.metaLine}>{serverLine(m, uid, myName)}</p>}

      {context && <p style={styles.contextLine}>{context}</p>}

      <div style={styles.actionsRow}>
        {actions}
        <Link
          href={`/matches/${m.id}`}
          aria-describedby={headingId}
          className={buttonClassName(link.variant ?? "secondary")}
          style={{ ...buttonStyle(link.variant ?? "secondary"), flex: actions ? "1 1 140px" : "0 1 auto" }}
        >
          {link.label}
        </Link>
      </div>
    </article>
  );
}

/** Accept or decline a proposal sent to the viewer. Decline is confirmed first. */
function InvitationActions({ m, proposer }: { m: Match; proposer: string }) {
  const announce = useAnnounce();
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const accept = useAsyncAction(() => acceptMatchProposal(m.id), {
    successMessage: `Proposal accepted. Your match with ${proposer} is scheduled.`,
    errorMessage: "Couldn't accept the proposal. Try again.",
  });

  return (
    <>
      <div style={styles.decisionRow}>
        <Button
          icon={<IconCheck size={18} aria-hidden="true" />}
          pending={accept.pending}
          pendingLabel="Accepting…"
          onClick={() => void accept.run()}
          style={styles.decisionBtn}
        >
          Accept
        </Button>
        <Button
          variant="secondary"
          icon={<IconX size={18} aria-hidden="true" />}
          disabled={accept.pending}
          onClick={() => setConfirmingDecline(true)}
          style={styles.decisionBtn}
        >
          Decline
        </Button>
      </div>
      {accept.error && (
        <InlineAlert tone="error" style={styles.cardAlert}>
          {accept.error}
        </InlineAlert>
      )}
      <ConfirmDialog
        open={confirmingDecline}
        title={`Decline ${proposer}'s proposal?`}
        message={`${proposer} will be told you declined. To play another time, propose a new match.`}
        confirmLabel="Decline proposal"
        pendingLabel="Declining…"
        onConfirm={async () => {
          await declineMatchProposal(m.id);
          setConfirmingDecline(false);
          announce(`Proposal from ${proposer} declined.`, { toast: true });
        }}
        onCancel={() => setConfirmingDecline(false)}
      />
    </>
  );
}

/** Withdraw a proposal the viewer sent. Confirmed first. */
function WithdrawAction({ m, opponent }: { m: Match; opponent: string }) {
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="quiet-danger" onClick={() => setConfirming(true)} style={{ flex: "1 1 140px" }}>
        Withdraw proposal
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Withdraw your proposal to ${opponent}?`}
        message={`${opponent} won't be able to accept it any more. You can propose a new match at any time.`}
        confirmLabel="Withdraw proposal"
        pendingLabel="Withdrawing…"
        cancelLabel="Keep proposal"
        onConfirm={async () => {
          await declineMatchProposal(m.id);
          setConfirming(false);
          announce(`Proposal to ${opponent} withdrawn.`, { toast: true });
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function Section({
  title,
  count,
  children,
  live,
  description,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  live?: boolean;
  description?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} style={styles.section}>
      <div style={styles.sectionHeader}>
        {live && <span style={styles.livePulse} aria-hidden="true" />}
        <h2 id={headingId} style={styles.sectionTitle}>
          {title}
          {count !== undefined && count > 0 && <span style={styles.sectionCount}> ({count})</span>}
        </h2>
      </div>
      {description && <p style={styles.sectionDescription}>{description}</p>}
      {children}
    </section>
  );
}

function CollapsedSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details style={styles.details} data-matches-group="">
      <summary style={styles.summary}>
        <IconChevronDown size={20} aria-hidden="true" className="matches-group-chevron" />
        <h2 style={styles.summaryTitle}>{title}</h2>
        <span style={styles.sectionCount}>({count})</span>
      </summary>
      <div style={styles.detailsBody}>{children}</div>
    </details>
  );
}

/**
 * A grid that renders `GROUP_PAGE_SIZE` cards at a time. A division's history
 * grows by every match of every season; rendering hundreds of cards on open
 * made the page slow to expand and long to scroll.
 */
function CappedGrid({ items, render }: { items: Match[]; render: (m: Match) => ReactNode }) {
  const [shown, setShown] = useState(GROUP_PAGE_SIZE);
  const firstNewRef = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);
  useEffect(() => {
    if (focusFrom.current === null) return;
    focusFrom.current = null;
    firstNewRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [shown]);
  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;
  return (
    <>
      <div style={styles.grid}>
        {visible.map((m, index) =>
          index === shown - GROUP_PAGE_SIZE && index > 0 ? (
            <div key={m.id} ref={firstNewRef} style={styles.gridCell}>
              {render(m)}
            </div>
          ) : (
            <div key={m.id} style={styles.gridCell}>
              {render(m)}
            </div>
          ),
        )}
      </div>
      {remaining > 0 && (
        <div style={styles.showMoreRow}>
          <Button
            variant="secondary"
            onClick={() => {
              focusFrom.current = shown;
              setShown((n) => n + GROUP_PAGE_SIZE);
            }}
          >
            Show {Math.min(GROUP_PAGE_SIZE, remaining)} more
          </Button>
          <span style={styles.showMoreCount}>
            Showing {visible.length} of {items.length}
          </span>
        </div>
      )}
    </>
  );
}

export default function MatchesPage(): React.JSX.Element {
  const router = useRouter();
  const { effectiveMode } = useViewMode();
  const isIosView = effectiveMode === "ios";
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  const { divisionId, loading: divisionLoading } = useActiveDivisionId(
    firebaseUser?.uid ?? null,
    profile?.divisionId,
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showRecord, setShowRecord] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const currentSeason = useMemo(() => currentSeasonForDate(), []);
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [selectedSeasonId, setSelectedSeasonId] = useState(currentSeason.id);
  const [selectedLevelId, setSelectedLevelId] = useState("all");
  const { levels: divisionLevels } = useDivisionLevels(divisionId);
  const seasonLevels = divisionLevels.filter(
    (level) => level.seasonId === selectedSeasonId,
  );
  const activeLevel =
    selectedLevelId !== "all"
      ? seasonLevels.find((level) => level.id === selectedLevelId)
      : undefined;
  const activeLevelId = activeLevel?.id;
  // The player's own matches, every season and level, so a filter never hides a to-do.
  const {
    matches: playerMatches,
    loading: playerMatchesLoading,
    error: playerMatchesError,
  } = usePlayerMatches(firebaseUser?.uid ?? null, reloadKey);

  useEffect(() => {
    if (!divisionId) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const applySnapshot = (snap: { docs: Array<{ id: string; data: () => Omit<Match, "id"> }> }) => {
      const nextMatches = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Match, "id">),
        }))
        .filter((match) => match.seasonId === selectedSeasonId)
        .filter((match) => !activeLevelId || match.divisionLevelId === activeLevelId);
      setMatches(nextMatches);
      setLoadError(null);
      setLoading(false);
    };

    setLoading(true);
    setLoadError(null);
    let fallbackUnsubscribe: (() => void) | undefined;
    const q = divisionMatchesQuery(
      divisionId,
      where("seasonId", "==", selectedSeasonId),
      ...(activeLevelId ? [where("divisionLevelId", "==", activeLevelId)] : []),
    );
    const unsubscribe = onSnapshot(
      q,
      applySnapshot,
      (error) => {
        console.warn(
          "Falling back to unordered division match query after ordered query failed.",
          error,
        );
        fallbackUnsubscribe = onSnapshot(
          divisionMatchesUnorderedQuery(divisionId),
          applySnapshot,
          (fallbackError) => {
            // Say so instead of showing an empty season.
            setMatches([]);
            setLoadError(fallbackError);
            setLoading(false);
          },
        );
      },
    );

    return () => {
      unsubscribe();
      fallbackUnsubscribe?.();
    };
  }, [divisionId, activeLevelId, selectedSeasonId, reloadKey]);

  const uid = firebaseUser?.uid;
  const myName = profile?.displayName;
  const isLeader = profile?.role === "division_leader" || isAdminRole(profile?.role);
  const canRecordOnBehalf =
    profile?.role === "admin" ||
    profile?.role === "division_leader" ||
    profile?.role === "app_developer";

  const groups = useMemo(() => {
    const mine = (m: Match) => !!uid && isMatchParticipant(m, uid);
    const byDateAsc = (a: Match, b: Match) => playDate(a) - playDate(b);
    const byDateDesc = (a: Match, b: Match) => playDate(b) - playDate(a);
    const canConfirm = (m: Match) =>
      !!uid && m.status === "pending_report" && !!m.reportSubmission && canRespondToReport(m, uid, m.reportSubmission.submittedBy);

    // The personal sections read the player's own matches in this division,
    // ignoring the season and level filter; the filtered list is the fallback
    // if that query fails.
    const personal = playerMatchesError
      ? matches.filter(mine)
      : playerMatches.filter((m) => m.divisionId === divisionId);

    // Side membership rather than player2Id, so a doubles partner sees the proposal too.
    const invitations = personal
      .filter((m) => m.status === "proposed" && !!uid && sideOfPlayer(m, uid) === "player2")
      .sort(byDateAsc);
    const toConfirm = personal.filter(canConfirm).sort(byDateAsc);
    const toReport = personal
      .filter((m) => m.status === "pending_report" && !m.reportSubmission && mine(m))
      .sort(byDateAsc);
    const next = personal
      .filter((m) => mine(m) && (m.status === "in_progress" || m.status === "scheduled"))
      .sort((a, b) =>
        a.status === b.status ? byDateAsc(a, b) : a.status === "in_progress" ? -1 : 1,
      );
    const waiting = personal
      .filter(
        (m) =>
          (m.status === "proposed" && !!uid && sideOfPlayer(m, uid) === "player1") ||
          (m.status === "pending_report" && !!m.reportSubmission && mine(m) && !canConfirm(m)) ||
          (m.status === "disputed" && mine(m)),
      )
      .sort(byDateAsc);
    const unsettled = isLeader
      ? matches
          .filter(
            (m) =>
              !mine(m) &&
              (m.status === "disputed" || (m.status === "pending_report" && !!m.reportSubmission)),
          )
          .sort(byDateAsc)
      : [];
    const liveElsewhere = matches.filter((m) => m.status === "in_progress" && !mine(m));

    const shown = new Set(
      [...invitations, ...toConfirm, ...toReport, ...next, ...waiting, ...unsettled, ...liveElsewhere].map((m) => m.id),
    );
    const schedule = matches
      .filter((m) => !shown.has(m.id) && (m.status === "proposed" || m.status === "scheduled"))
      .sort(byDateAsc);
    const history = matches
      .filter((m) => !shown.has(m.id) && m.status !== "proposed" && m.status !== "scheduled")
      .sort(byDateDesc);

    return { invitations, toConfirm, toReport, next, waiting, unsettled, liveElsewhere, schedule, history };
  }, [matches, playerMatches, playerMatchesError, divisionId, uid, isLeader]);

  const needsYouCount = groups.invitations.length + groups.toConfirm.length + groups.toReport.length;
  const personalCount = needsYouCount + groups.next.length + groups.waiting.length;
  const canCreate = !!(divisionId && firebaseUser && profile);

  const pageStyle = isIosView ? { ...styles.page, ...styles.iosPage } : styles.page;
  const mainStyle = isIosView ? { ...styles.main, ...styles.iosMain } : styles.main;
  const titleActionsStyle = isIosView ? { ...styles.titleActions, ...styles.iosTitleActions } : styles.titleActions;
  const filteredByLevel = !!activeLevel;
  const seasonName = seasonOptions.find((s) => s.id === selectedSeasonId)?.name ?? "this season";

  const proposeButton = (variant: ButtonVariant = "primary") => (
    <Button
      variant={variant}
      icon={<IconCalendarPlus size={18} aria-hidden="true" />}
      onClick={() => setShowPropose(true)}
    >
      Propose a match
    </Button>
  );

  return (
    <div style={pageStyle}>
      <AppNav active="matches" />
      <style>{collapsedGroupCss}</style>

      <main style={mainStyle}>
        <div style={styles.titleRow}>
          <h1 style={styles.pageTitle}>Matches</h1>
          {canCreate && (
            <div style={titleActionsStyle}>
              {proposeButton()}
              <Button
                variant="secondary"
                icon={<IconClipboardList size={18} aria-hidden="true" />}
                onClick={() => setShowRecord(true)}
              >
                Record a result
              </Button>
              {isIosView && (
                <Button
                  variant="secondary"
                  icon={<IconBallTennis size={18} aria-hidden="true" />}
                  onClick={() => setShowLive(true)}
                >
                  Score live now
                </Button>
              )}
            </div>
          )}
        </div>

        <div
          role="group"
          aria-label="Show division matches from"
          aria-describedby="matches-filter-hint"
          style={styles.filterBar}
        >
          <div style={styles.filterField}>
            <label htmlFor="matches-filter-season" style={fieldLabelStyle}>
              Season
            </label>
            <select
              id="matches-filter-season"
              style={styles.select}
              value={selectedSeasonId}
              onChange={(e) => {
                setSelectedSeasonId(e.target.value);
                setSelectedLevelId("all");
              }}
            >
              {seasonOptions.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterField}>
            <label htmlFor="matches-filter-level" style={fieldLabelStyle}>
              Division level
            </label>
            <select
              id="matches-filter-level"
              style={styles.select}
              value={activeLevelId ?? "all"}
              onChange={(e) => setSelectedLevelId(e.target.value)}
            >
              <option value="all">All division levels</option>
              {seasonLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </div>
          <p id="matches-filter-hint" style={styles.filterHint}>
            These filters change the division sections. Your own matches and to-dos always show, from every season and
            division level.
          </p>
        </div>

        {!divisionLoading && !divisionId ? (
          <div style={styles.emptyCard}>
            <EmptyState
              title="You're not in a division yet"
              description="Join a division with an invite or a join code to propose, score, and record matches."
              action={
                <Link href="/onboarding/division" className={buttonClassName("primary")} style={buttonStyle("primary")}>
                  Join a division
                </Link>
              }
            />
          </div>
        ) : (
          <DataState
            loading={loading || divisionLoading || (!!uid && playerMatchesLoading)}
            error={loadError}
            isEmpty={matches.length === 0 && personalCount === 0}
            loadingLabel="Loading matches"
            loadingRows={3}
            errorTitle="Couldn't load matches."
            onRetry={() => setReloadKey((k) => k + 1)}
            empty={
              <div style={styles.emptyCard}>
                <EmptyState
                  title={filteredByLevel ? `No matches in ${activeLevel?.name} for ${seasonName}` : `No matches in ${seasonName} yet`}
                  description={
                    filteredByLevel
                      ? "Show every division level, or start this level's season with a proposal."
                      : "Propose a match to someone in your division, or record a result you've already played."
                  }
                  action={
                    <>
                      {filteredByLevel && (
                        <Button variant="secondary" onClick={() => setSelectedLevelId("all")}>
                          Show all division levels
                        </Button>
                      )}
                      {canCreate && proposeButton(filteredByLevel ? "secondary" : "primary")}
                    </>
                  }
                />
              </div>
            }
          >
            <Section title="Needs you" count={needsYouCount}>
              {needsYouCount === 0 ? (
                <p style={styles.quietLine}>Nothing needs you right now.</p>
              ) : (
                <AnimatedDiv style={styles.grid}>
                  {groups.invitations.map((m) => {
                    const proposer = opponentName(m, uid);
                    return (
                      <MatchCard
                        key={m.id}
                        m={m}
                        uid={uid}
                        myName={myName}
                        context={`${proposer} proposed this match. Accept to schedule it, or decline.`}
                        actions={<InvitationActions m={m} proposer={proposer} />}
                        link={{ label: "View details", variant: "quiet" }}
                      />
                    );
                  })}
                  {groups.toConfirm.map((m) => {
                    const submittedBy = m.reportSubmission?.submittedBy;
                    const reporterSide = submittedBy ? sideOfPlayer(m, submittedBy) : undefined;
                    const reporter = reporterSide ? sideDisplayName(m, reporterSide) : opponentName(m, uid);
                    return (
                      <MatchCard
                        key={m.id}
                        m={m}
                        uid={uid}
                        myName={myName}
                        context={`${reporter} reported this score. Confirm it, or dispute it if it's wrong.`}
                        link={{ label: "Review score", variant: "primary" }}
                      />
                    );
                  })}
                  {groups.toReport.map((m) => (
                    <MatchCard
                      key={m.id}
                      m={m}
                      uid={uid}
                      myName={myName}
                      context={`The match is over. Submit the score so ${opponentName(m, uid)} can confirm it.`}
                      link={{ label: "Submit score", variant: "primary" }}
                    />
                  ))}
                </AnimatedDiv>
              )}
            </Section>

            <Section title={groups.next.length > 1 ? "Your next matches" : "Your next match"}>
              {groups.next.length === 0 ? (
                <div style={styles.inlineEmpty}>
                  <p style={styles.quietLine}>
                    You have no matches scheduled. Propose one to keep your season moving.
                  </p>
                  {canCreate && proposeButton("secondary")}
                </div>
              ) : (
                <AnimatedDiv style={styles.grid}>
                  {groups.next.map((m, index) => (
                    <MatchCard
                      key={m.id}
                      m={m}
                      uid={uid}
                      myName={myName}
                      featured={index === 0}
                      context={
                        m.status === "in_progress"
                          ? "Your match is live."
                          : index === 0
                            ? "Open the match to start live scoring when you're on court."
                            : undefined
                      }
                      link={
                        m.status === "in_progress"
                          ? { label: "Resume scoring", variant: "primary" }
                          : { label: "Open match", variant: index === 0 ? "primary" : "secondary" }
                      }
                    />
                  ))}
                </AnimatedDiv>
              )}
            </Section>

            {groups.waiting.length > 0 && (
              <Section title="Waiting on others" count={groups.waiting.length}>
                <AnimatedDiv style={styles.grid}>
                  {groups.waiting.map((m) => {
                    const opponent = opponentName(m, uid);
                    const context =
                      m.status === "proposed"
                        ? `Waiting for ${opponent} to accept.`
                        : m.status === "disputed"
                          ? "Disputed. A division leader will review the score."
                          : `Waiting for ${opponent} to confirm the score.`;
                    return (
                      <MatchCard
                        key={m.id}
                        m={m}
                        uid={uid}
                        myName={myName}
                        context={context}
                        actions={m.status === "proposed" ? <WithdrawAction m={m} opponent={opponent} /> : undefined}
                        link={{ label: "View details" }}
                      />
                    );
                  })}
                </AnimatedDiv>
              </Section>
            )}

            {groups.unsettled.length > 0 && (
              <Section
                title="Results to settle"
                count={groups.unsettled.length}
                description="As a division leader you can confirm a reported score or set the correct one."
              >
                <AnimatedDiv style={styles.grid}>
                  {groups.unsettled.map((m) => (
                    <MatchCard
                      key={m.id}
                      m={m}
                      uid={uid}
                      myName={myName}
                      context={m.status === "disputed" ? "The players disagree on this score." : "Reported, but the opposing side hasn't confirmed it."}
                      link={{ label: "Review result" }}
                    />
                  ))}
                </AnimatedDiv>
              </Section>
            )}

            {groups.liveElsewhere.length > 0 && (
              <Section title="Live in your division" count={groups.liveElsewhere.length} live>
                <AnimatedDiv style={styles.grid}>
                  {groups.liveElsewhere.map((m) => (
                    <MatchCard key={m.id} m={m} uid={uid} myName={myName} link={{ label: "Watch live" }} />
                  ))}
                </AnimatedDiv>
              </Section>
            )}

            {(groups.schedule.length > 0 || groups.history.length > 0) && (
              <div style={styles.collapsedGroup}>
                {groups.schedule.length > 0 && (
                  <CollapsedSection title="Division schedule" count={groups.schedule.length}>
                    <CappedGrid
                      items={groups.schedule}
                      render={(m) => <MatchCard m={m} uid={uid} myName={myName} link={{ label: "View match" }} />}
                    />
                  </CollapsedSection>
                )}
                {groups.history.length > 0 && (
                  <CollapsedSection title="History" count={groups.history.length}>
                    <CappedGrid
                      items={groups.history}
                      render={(m) => <MatchCard m={m} uid={uid} myName={myName} link={{ label: "View match" }} />}
                    />
                  </CollapsedSection>
                )}
              </div>
            )}
          </DataState>
        )}

        {showLive && firebaseUser && profile && divisionId && (
          <StartLiveMatchDialog
            currentUser={profile}
            divisionId={divisionId}
            levels={divisionLevels}
            onClose={() => setShowLive(false)}
            onCreated={(matchId) => {
              setShowLive(false);
              router.push(`/matches/${matchId}`);
            }}
          />
        )}

        {showRecord && firebaseUser && profile && divisionId && (
          <RecordResultDialog
            currentUser={profile}
            divisionId={divisionId}
            levels={divisionLevels}
            canRecordOnBehalf={canRecordOnBehalf}
            onClose={() => setShowRecord(false)}
          />
        )}

        {showPropose && firebaseUser && profile && divisionId && (
          <ProposeMatchDialog
            currentUser={profile}
            divisionId={divisionId}
            levels={divisionLevels}
            onClose={() => setShowPropose(false)}
          />
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Season and division level for a new match                                 */
/* ------------------------------------------------------------------------ */

type Competition = {
  seasonId: string;
  setSeasonId: (id: string) => void;
  levelId: string;
  setLevelId: (id: string) => void;
  level: DivisionLevel | undefined;
  seasonLevels: DivisionLevel[];
  seasonName: string;
  /** True while the level is the subject's own level, not a manual choice. */
  isOwnLevel: boolean;
  /** The user changed the season or the level. */
  touched: boolean;
};

/**
 * Where a new match belongs. Defaults to the current season and the given
 * player's own division level, never to whatever the list happens to show.
 */
function useCompetition(divisionId: string, levels: DivisionLevel[], subjectId: string | null): Competition {
  const current = useMemo(() => currentSeasonForDate(), []);
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [seasonId, setSeasonIdState] = useState(current.id);
  const [levelChoice, setLevelChoice] = useState<string | null>(null);
  const { memberships } = useDivisionMemberships(divisionId, seasonId, undefined, ROSTERED);
  const seasonLevels = levels
    .filter((level) => level.seasonId === seasonId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const ownLevelId = subjectId
    ? memberships.find(
        (membership) =>
          membership.userId === subjectId && seasonLevels.some((level) => level.id === membership.divisionLevelId),
      )?.divisionLevelId
    : undefined;
  const levelId = levelChoice ?? ownLevelId ?? "";
  return {
    seasonId,
    setSeasonId: (id) => {
      setSeasonIdState(id);
      setLevelChoice(null);
    },
    levelId,
    setLevelId: (id) => setLevelChoice(id),
    level: seasonLevels.find((level) => level.id === levelId),
    seasonLevels,
    seasonName: seasonOptions.find((s) => s.id === seasonId)?.name ?? seasonId,
    isOwnLevel: levelChoice === null && !!ownLevelId,
    touched: seasonId !== current.id || levelChoice !== null,
  };
}

function CompetitionFields({
  comp,
  idPrefix,
  ownLevelLabel,
  typeHint,
}: {
  comp: Competition;
  idPrefix: string;
  /** "your" or "Ann's", for the default-level hint. */
  ownLevelLabel: string;
  /** Extra sentence about the match type, when the form changes with it. */
  typeHint?: ReactNode;
}) {
  const hintId = `${idPrefix}-competition-hint`;
  const matchTypeLabel = comp.level ? (comp.level.matchType === "doubles" ? "Doubles" : "Singles") : null;
  let hint: string;
  if (comp.level) {
    hint = comp.isOwnLevel
      ? `${matchTypeLabel}. This is ${ownLevelLabel} division level in ${comp.seasonName}.`
      : `${matchTypeLabel} division level.`;
  } else if (comp.seasonLevels.length === 0) {
    hint = `${comp.seasonName} has no division levels yet, so this match won't belong to one.`;
  } else {
    hint = "This match won't belong to a division level.";
  }

  return (
    <fieldset style={styles.fieldset}>
      <legend style={styles.legend}>Where this match counts</legend>
      <div style={styles.twoCol}>
        <div>
          <label htmlFor={`${idPrefix}-season`} style={fieldLabelStyle}>
            Season
          </label>
          <select
            id={`${idPrefix}-season`}
            style={inputStyle}
            value={comp.seasonId}
            onChange={(e) => comp.setSeasonId(e.target.value)}
          >
            {defaultSeasonOptions().map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-level`} style={fieldLabelStyle}>
            Division level
          </label>
          <select
            id={`${idPrefix}-level`}
            style={inputStyle}
            value={comp.levelId}
            onChange={(e) => comp.setLevelId(e.target.value)}
            aria-describedby={hintId}
          >
            {comp.seasonLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
            <option value="">No division level</option>
          </select>
        </div>
      </div>
      <p id={hintId} style={styles.hint}>
        {hint}
        {typeHint ? <> {typeHint}</> : null}
      </p>
    </fieldset>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared form pieces                                                         */
/* ------------------------------------------------------------------------ */

function CancelButton({ disabled }: { disabled?: boolean }) {
  const close = useDialogClose();
  return (
    <Button variant="secondary" onClick={close} disabled={disabled}>
      Cancel
    </Button>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div style={styles.segmentBlock}>
      <span style={fieldLabelStyle} id={`seg-${label.replace(/\W+/g, "-")}`}>
        {label}
      </span>
      <div role="group" aria-labelledby={`seg-${label.replace(/\W+/g, "-")}`} style={styles.segment}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              style={{ ...styles.segmentBtn, ...(active ? styles.segmentBtnActive : {}) }}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckboxField({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div style={styles.checkboxBlock}>
      <label style={styles.checkboxLabel}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={styles.checkbox} />
        <span>{label}</span>
      </label>
      {hint && <p style={styles.checkboxHint}>{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Score live now (guest opponent)                                           */
/* ------------------------------------------------------------------------ */

function StartLiveMatchDialog({
  onClose,
  onCreated,
  divisionId,
  currentUser,
  levels,
}: {
  onClose: () => void;
  onCreated: (matchId: string) => void;
  divisionId: string;
  currentUser: PublicProfile;
  levels: DivisionLevel[];
}) {
  const announce = useAnnounce();
  const comp = useCompetition(divisionId, levels, currentUser.id);
  const [opponentName, setOpponentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formId = "start-live-form";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!opponentName.trim()) {
      setError("Enter your opponent's name.");
      focusField("live-opponent-name");
      return;
    }
    setSubmitting(true);
    setError("");
    let matchId: string | null = null;
    try {
      matchId = await createMatch({
        player1Id: currentUser.id,
        player2Id: "guest",
        player1Name: currentUser.displayName,
        player2Name: opponentName.trim(),
        player2IsGuest: true,
        divisionId,
        seasonId: comp.seasonId,
        divisionLevelId: comp.level?.id,
        matchType: comp.level?.matchType,
        createdBy: currentUser.id,
        scheduledAt: Date.now(),
      });
      await startMatch(matchId, "player1", false);
      announce("Live match started. You serve first.");
      onCreated(matchId);
    } catch (caught) {
      if (matchId) {
        // The match exists; let the player pick the server on its page.
        announce("Match created, but scoring didn't start. Pick who serves to begin.", { toast: true });
        onCreated(matchId);
        return;
      }
      setError(describeError(caught, "Couldn't create the live match. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Score a match live"
      description="Against a guest who has no account. To score against a division player, open your scheduled match and start scoring there."
      dirty={!!opponentName.trim() || comp.touched}
      dismissible={!submitting}
      footer={
        <>
          <CancelButton disabled={submitting} />
          <Button type="submit" form={formId} pending={submitting} pendingLabel="Starting…">
            Start scoring
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <label htmlFor="live-opponent-name" style={fieldLabelStyle}>
          Guest opponent&apos;s name
        </label>
        <input
          id="live-opponent-name"
          style={{ ...inputStyle, marginBottom: space.lg }}
          value={opponentName}
          onChange={(event) => setOpponentName(event.target.value)}
          autoComplete="off"
          maxLength={MAX_GUEST_NAME_LENGTH}
          aria-invalid={error && !opponentName.trim() ? true : undefined}
          aria-describedby={error ? "start-live-error" : undefined}
        />
        <CompetitionFields comp={comp} idPrefix="live" ownLevelLabel="your" />
        <p style={styles.hint}>You serve first. Guest results stay out of the standings until you link the guest&apos;s account.</p>
        {error && <InlineAlert id="start-live-error" tone="error" style={styles.formAlert}>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Record a result                                                            */
/* ------------------------------------------------------------------------ */

function RecordResultDialog({
  currentUser,
  divisionId,
  levels,
  canRecordOnBehalf,
  onClose,
}: {
  currentUser: PublicProfile;
  divisionId: string;
  levels: DivisionLevel[];
  canRecordOnBehalf: boolean;
  onClose: () => void;
}) {
  const announce = useAnnounce();
  const [entryMode, setEntryMode] = useState<"single" | "bulk">("single");
  const [recordingMode, setRecordingMode] = useState<"self" | "onBehalf">("self");
  const [opponentMode, setOpponentMode] = useState<"search" | "guest">("search");
  const [guestName, setGuestName] = useState("");
  const [selectedPlayer1, setSelectedPlayer1] = useState<PublicProfile | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<PublicProfile | null>(null);
  const [sets, setSets] = useState<SetDraft[]>([{ p1: "", p2: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDivisionMatch, setIsDivisionMatch] = useState(true);
  const [bulkText, setBulkText] = useState("");
  const formId = "record-result-form";

  const onBehalf = entryMode === "single" && recordingMode === "onBehalf";
  const guestOpponent = entryMode === "single" && !onBehalf && opponentMode === "guest";
  const comp = useCompetition(
    divisionId,
    levels,
    onBehalf ? selectedPlayer1?.id ?? null : currentUser.id,
  );

  const dirty =
    comp.touched ||
    !!guestName.trim() ||
    !!selectedPlayer1 ||
    !!selectedOpponent ||
    !!bulkText.trim() ||
    sets.some((s) => s.p1 || s.p2);

  const firstLabel = onBehalf ? (selectedPlayer1 ? `${selectedPlayer1.displayName}'s` : "the first player's") : "your";
  const opponentLabel = onBehalf
    ? selectedOpponent?.displayName ?? "second player"
    : guestOpponent
      ? guestName.trim() || "opponent"
      : selectedOpponent?.displayName ?? "opponent";

  function parseBulkLine(line: string): { opponentName: string; sets: RecordedSetInput[] } | null {
    const parts = line
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 3) return null;
    const opponentName = parts[0];
    const parsed = parts.slice(1).map(parseRecordedSetToken);
    if (!opponentName || opponentName.length > MAX_GUEST_NAME_LENGTH || parsed.some((s) => !s)) return null;
    return { opponentName, sets: parsed as RecordedSetInput[] };
  }

  async function handleBulk() {
    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError("Add at least one line, such as: Jane Doe, 6-3, 6-4");
      return;
    }
    // Check every line before writing any, so a typo on line 4 doesn't leave
    // lines 1-3 recorded and the rest not.
    const items: Array<{ opponentName: string; sets: RecordedSetInput[] }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      const item = parseBulkLine(lines[i]);
      if (!item) {
        setError(
          `Line ${i + 1} isn't in the format Opponent Name, 6-4, 7-5 (use [10-8] for a match tiebreak), with a name of up to ${MAX_GUEST_NAME_LENGTH} characters.`,
        );
        focusField("bulk-match-import");
        return;
      }
      const invalid = validateRecordedSets(item.sets);
      if (invalid) {
        setError(`Line ${i + 1} (${item.opponentName}): ${invalid}`);
        focusField("bulk-match-import");
        return;
      }
      items.push(item);
    }
    setSubmitting(true);
    let recorded = 0;
    try {
      for (const item of items) {
        await recordHistoricMatch({
          player1Id: currentUser.id,
          player2Id: "guest",
          player1Name: currentUser.displayName,
          player2Name: item.opponentName,
          player2IsGuest: true,
          divisionId,
          seasonId: comp.seasonId,
          divisionLevelId: comp.level?.id,
          matchType: comp.level?.matchType,
          createdBy: currentUser.id,
          sets: item.sets,
          isDivisionMatch,
        });
        recorded += 1;
      }
      announce(`${recorded} ${recorded === 1 ? "result" : "results"} recorded against guests.`, { toast: true });
      onClose();
    } catch (caught) {
      const reason = describeError(caught, "Couldn't record that line.");
      if (recorded > 0) {
        // Drop the lines that landed so trying again can't record them twice.
        setBulkText(lines.slice(recorded).join("\n"));
        setError(
          `Recorded ${recorded} of ${items.length}. ${items[recorded].opponentName} wasn't recorded: ${reason} The recorded lines were removed, so you can try the rest again.`,
        );
      } else {
        setError(reason);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    if (entryMode === "bulk") {
      await handleBulk();
      return;
    }

    if (onBehalf && (!selectedPlayer1 || !selectedOpponent)) {
      setError("Choose both players.");
      focusField(!selectedPlayer1 ? "record-match-player1-search" : "record-match-opponent-search");
      return;
    }
    if (!onBehalf && guestOpponent && !guestName.trim()) {
      setError("Enter the guest's name.");
      focusField("record-match-guest-name");
      return;
    }
    if (!onBehalf && !guestOpponent && !selectedOpponent) {
      setError("Choose your opponent.");
      focusField("record-match-opponent-search");
      return;
    }

    const parsed: RecordedSetInput[] = sets.map((s) => ({
      p1: parseInt(s.p1, 10),
      p2: parseInt(s.p2, 10),
      ...(s.matchTiebreak ? { matchTiebreak: true } : {}),
    }));
    const invalid = validateRecordedSets(parsed);
    if (invalid) {
      setError(invalid);
      return;
    }

    const competition = {
      divisionId,
      seasonId: comp.seasonId,
      divisionLevelId: comp.level?.id,
      matchType: comp.level?.matchType,
    };
    setSubmitting(true);
    try {
      if (onBehalf) {
        await recordMatchOnBehalf({
          player1Id: selectedPlayer1!.id,
          player2Id: selectedOpponent!.id,
          ...competition,
          sets: parsed,
          isDivisionMatch,
          notifyPlayers: true,
        });
        announce(
          `Result recorded and confirmed. ${selectedPlayer1!.displayName} and ${selectedOpponent!.displayName} have been notified.`,
          { toast: true },
        );
      } else if (guestOpponent) {
        await recordHistoricMatch({
          player1Id: currentUser.id,
          player2Id: "guest",
          player1Name: currentUser.displayName,
          player2Name: guestName.trim(),
          player2IsGuest: true,
          ...competition,
          createdBy: currentUser.id,
          sets: parsed,
          isDivisionMatch,
        });
        announce(
          `Result recorded against ${guestName.trim()}. It stays out of the standings until you link their account.`,
          { toast: true },
        );
      } else {
        await recordHistoricMatch({
          player1Id: currentUser.id,
          player2Id: selectedOpponent!.id,
          player1Name: currentUser.displayName,
          player2Name: selectedOpponent!.displayName,
          player2IsGuest: false, // EXPLICIT: Real division player
          ...competition,
          createdBy: currentUser.id,
          sets: parsed,
          isDivisionMatch,
        });
        announce(`Result recorded. ${selectedOpponent!.displayName} will be asked to confirm it.`, { toast: true });
      }
      onClose();
    } catch (caught) {
      setError(describeError(caught, "Couldn't record the result. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function updateSet(index: number, patch: Partial<SetDraft>) {
    setSets((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record a result"
      description="For a match you've already played."
      dirty={dirty}
      dismissible={!submitting}
      footer={
        <>
          <CancelButton disabled={submitting} />
          <Button type="submit" form={formId} pending={submitting} pendingLabel="Recording…">
            {entryMode === "bulk" ? "Record all results" : "Record result"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <SegmentedControl
          label="What are you recording?"
          value={entryMode}
          options={[
            { value: "single", label: "One match" },
            { value: "bulk", label: "Several guest matches" },
          ]}
          onChange={(value) => {
            setEntryMode(value);
            setError("");
          }}
        />

        {entryMode === "single" && (
          <>
            {canRecordOnBehalf && (
              <SegmentedControl
                label="Who played?"
                value={recordingMode}
                options={[
                  { value: "self", label: "I played" },
                  { value: "onBehalf", label: "Two other players" },
                ]}
                onChange={(value) => {
                  setRecordingMode(value);
                  setSelectedPlayer1(null);
                  setSelectedOpponent(null);
                  setError("");
                }}
              />
            )}

            {onBehalf ? (
              <>
                <PlayerSlotPicker
                  label="First player"
                  inputId="record-match-player1-search"
                  divisionId={divisionId}
                  excludeIds={selectedOpponent ? [selectedOpponent.id] : []}
                  selected={selectedPlayer1}
                  onSelect={setSelectedPlayer1}
                  onClear={() => setSelectedPlayer1(null)}
                />
                <PlayerSlotPicker
                  label="Second player"
                  inputId="record-match-opponent-search"
                  divisionId={divisionId}
                  excludeIds={selectedPlayer1 ? [selectedPlayer1.id] : []}
                  selected={selectedOpponent}
                  onSelect={setSelectedOpponent}
                  onClear={() => setSelectedOpponent(null)}
                />
              </>
            ) : (
              <>
                <SegmentedControl
                  label="Your opponent"
                  value={opponentMode}
                  options={[
                    { value: "search", label: "Division player" },
                    { value: "guest", label: "Guest (no account)" },
                  ]}
                  onChange={(value) => {
                    setOpponentMode(value);
                    setError("");
                  }}
                />
                {guestOpponent ? (
                  <div style={styles.fieldBlock}>
                    <label htmlFor="record-match-guest-name" style={fieldLabelStyle}>
                      Guest&apos;s name
                    </label>
                    <input
                      id="record-match-guest-name"
                      style={inputStyle}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      autoComplete="off"
                      maxLength={MAX_GUEST_NAME_LENGTH}
                    />
                  </div>
                ) : (
                  <PlayerSlotPicker
                    label="Opponent"
                    inputId="record-match-opponent-search"
                    divisionId={divisionId}
                    excludeIds={[currentUser.id]}
                    selected={selectedOpponent}
                    onSelect={setSelectedOpponent}
                    onClear={() => setSelectedOpponent(null)}
                  />
                )}
              </>
            )}

            <fieldset style={styles.fieldset}>
              <legend style={styles.legend}>Score, with {firstLabel} games first</legend>
              {sets.map((s, i) => {
                const unit = s.matchTiebreak ? "points" : "games";
                return (
                  <div key={i} style={styles.setBlock}>
                    <div style={styles.setRow}>
                      <span style={styles.setLabel}>{s.matchTiebreak ? "Match tiebreak" : `Set ${i + 1}`}</span>
                      <input
                        aria-label={`Set ${i + 1}: ${firstLabel} ${unit}`}
                        style={styles.setInput}
                        value={s.p1}
                        onChange={(e) => updateSet(i, { p1: e.target.value.replace(/[^0-9]/g, "") })}
                        inputMode="numeric"
                        maxLength={2}
                      />
                      <span style={styles.setDash} aria-hidden="true">–</span>
                      <input
                        aria-label={`Set ${i + 1}: ${opponentLabel}'s ${unit}`}
                        style={styles.setInput}
                        value={s.p2}
                        onChange={(e) => updateSet(i, { p2: e.target.value.replace(/[^0-9]/g, "") })}
                        inputMode="numeric"
                        maxLength={2}
                      />
                      {sets.length > 1 && (
                        <Button
                          variant="quiet-danger"
                          size="sm"
                          aria-label={`Remove set ${i + 1}`}
                          icon={<IconX size={20} aria-hidden="true" />}
                          style={styles.removeSet}
                          onClick={() => setSets(withEligibleTiebreaks(sets.filter((_, j) => j !== i)))}
                        />
                      )}
                    </div>
                    {canBeMatchTiebreak(i, sets.length) && (
                      <label style={styles.tiebreakToggle}>
                        <input
                          type="checkbox"
                          checked={!!s.matchTiebreak}
                          onChange={(e) => updateSet(i, { matchTiebreak: e.target.checked })}
                          style={styles.checkbox}
                        />
                        <span>Played as a 10-point match tiebreak (enter points)</span>
                      </label>
                    )}
                  </div>
                );
              })}
              {sets.length < 5 && (
                <Button
                  variant="quiet"
                  size="sm"
                  icon={<IconPlus size={18} aria-hidden="true" />}
                  onClick={() => setSets(withEligibleTiebreaks([...sets, { p1: "", p2: "" }]))}
                >
                  Add a set
                </Button>
              )}
            </fieldset>
          </>
        )}

        {entryMode === "bulk" && (
          <div style={styles.fieldBlock}>
            <label htmlFor="bulk-match-import" style={fieldLabelStyle}>
              Results, one match per line
            </label>
            <p id="bulk-match-format" style={styles.hint}>
              Write the guest&apos;s name, then each set with your games first: <strong>Jane Doe, 6-3, 6-4</strong>. Write a
              match tiebreak in brackets: <strong>Alex Smith, 4-6, 6-3, [10-8]</strong>. These are matches you played against
              guests.
            </p>
            <textarea
              id="bulk-match-import"
              aria-describedby="bulk-match-format"
              style={styles.textarea}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Jane Doe, 6-3, 6-4\nAlex Smith, 4-6, 7-5, 6-2"}
              rows={6}
            />
          </div>
        )}

        <CompetitionFields
          comp={comp}
          idPrefix="record"
          ownLevelLabel={onBehalf ? (selectedPlayer1 ? `${selectedPlayer1.displayName}'s` : "the first player's") : "your"}
        />

        <CheckboxField
          checked={isDivisionMatch}
          onChange={setIsDivisionMatch}
          label={entryMode === "bulk" ? "Count these results in the standings" : "Count this result in the standings"}
          hint={
            !isDivisionMatch
              ? "Recorded for history only. It won't change the standings."
              : entryMode === "bulk" || guestOpponent
                ? "Guest results stay out of the standings until you link the guest's account and they confirm the result."
                : onBehalf
                  ? "Counts toward the division standings right away."
                  : "Counts toward the division standings once your opponent confirms it."
          }
        />

        {error && <InlineAlert tone="error" style={styles.formAlert}>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Propose a match                                                            */
/* ------------------------------------------------------------------------ */

function ProposeMatchDialog({
  currentUser,
  divisionId,
  levels,
  onClose,
}: {
  currentUser: PublicProfile;
  divisionId: string;
  levels: DivisionLevel[];
  onClose: () => void;
}) {
  const announce = useAnnounce();
  const comp = useCompetition(divisionId, levels, currentUser.id);
  const isDoubles = comp.level?.matchType === "doubles";
  const [selectedOpponent, setSelectedOpponent] = useState<PublicProfile | null>(null);
  // Doubles slots: the signed-in player always fills side 1's first seat.
  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [opponent1, setOpponent1] = useState<PublicProfile | null>(null);
  const [opponent2, setOpponent2] = useState<PublicProfile | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");
  const formId = "propose-match-form";
  const minDate = useMemo(() => toLocalInputValue(Date.now()), []);

  const doublesChosenIds = [currentUser.id, partner?.id, opponent1?.id, opponent2?.id].filter(
    (id): id is string => !!id,
  );
  const dirty = comp.touched || !!(selectedOpponent || partner || opponent1 || opponent2 || scheduledAt);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setDateError("");
    if (isDoubles ? !(partner && opponent1 && opponent2) : !selectedOpponent) {
      setError(isDoubles ? "Choose your partner and both opponents." : "Choose an opponent.");
      focusField(
        !isDoubles
          ? "proposal-opponent-search"
          : !partner
            ? "proposal-partner-search"
            : !opponent1
              ? "proposal-opponent1-search"
              : "proposal-opponent2-search",
      );
      return;
    }
    const ts = Date.parse(scheduledAt);
    if (!scheduledAt || Number.isNaN(ts)) {
      setDateError("Pick a date and time.");
      focusField("proposal-scheduled-at");
      return;
    }
    if (ts < Date.now()) {
      setDateError("Pick a time in the future.");
      focusField("proposal-scheduled-at");
      return;
    }
    setSubmitting(true);
    try {
      if (isDoubles) {
        await proposeDoublesMatch({
          side1PlayerIds: [currentUser.id, partner!.id],
          side2PlayerIds: [opponent1!.id, opponent2!.id],
          divisionId,
          seasonId: comp.seasonId,
          divisionLevelId: comp.level?.id,
          scheduledAt: ts,
        });
        announce(
          `Proposal sent. ${opponent1!.displayName} and ${opponent2!.displayName} will be asked to accept it.`,
          { toast: true },
        );
      } else {
        await proposeMatch({
          player1Id: currentUser.id,
          player2Id: selectedOpponent!.id,
          player1Name: currentUser.displayName,
          player2Name: selectedOpponent!.displayName,
          divisionId,
          seasonId: comp.seasonId,
          divisionLevelId: comp.level?.id,
          matchType: comp.level?.matchType,
          createdBy: currentUser.id,
          scheduledAt: ts,
        });
        announce(`Proposal sent. ${selectedOpponent!.displayName} will be asked to accept it.`, { toast: true });
      }
      onClose();
    } catch (caught) {
      setError(describeError(caught, "Couldn't send the proposal. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Propose a match"
      description="Your opponent gets a notification and can accept or decline."
      dirty={dirty}
      dismissible={!submitting}
      footer={
        <>
          <CancelButton disabled={submitting} />
          <Button type="submit" form={formId} pending={submitting} pendingLabel="Sending…">
            Send proposal
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <CompetitionFields
          comp={comp}
          idPrefix="propose"
          ownLevelLabel="your"
          typeHint={isDoubles ? "You and a partner play another pair." : undefined}
        />

        {isDoubles ? (
          <>
            <PlayerSlotPicker
              label="Your partner"
              inputId="proposal-partner-search"
              divisionId={divisionId}
              excludeIds={doublesChosenIds}
              selected={partner}
              onSelect={setPartner}
              onClear={() => setPartner(null)}
            />
            <PlayerSlotPicker
              label="Opponent 1"
              inputId="proposal-opponent1-search"
              divisionId={divisionId}
              excludeIds={doublesChosenIds}
              selected={opponent1}
              onSelect={setOpponent1}
              onClear={() => setOpponent1(null)}
            />
            <PlayerSlotPicker
              label="Opponent 2"
              inputId="proposal-opponent2-search"
              divisionId={divisionId}
              excludeIds={doublesChosenIds}
              selected={opponent2}
              onSelect={setOpponent2}
              onClear={() => setOpponent2(null)}
            />
          </>
        ) : (
          <PlayerSlotPicker
            label="Opponent"
            inputId="proposal-opponent-search"
            divisionId={divisionId}
            excludeIds={[currentUser.id]}
            selected={selectedOpponent}
            onSelect={setSelectedOpponent}
            onClear={() => setSelectedOpponent(null)}
          />
        )}

        <div style={styles.fieldBlock}>
          <label htmlFor="proposal-scheduled-at" style={fieldLabelStyle}>
            Date and time
          </label>
          <input
            id="proposal-scheduled-at"
            style={inputStyle}
            type="datetime-local"
            min={minDate}
            value={scheduledAt}
            onChange={(e) => {
              setScheduledAt(e.target.value);
              setDateError("");
            }}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? "proposal-scheduled-at-error" : undefined}
          />
          {dateError && (
            <p id="proposal-scheduled-at-error" role="alert" style={styles.fieldError}>
              {dateError}
            </p>
          )}
        </div>

        {error && <InlineAlert tone="error" style={styles.formAlert}>{error}</InlineAlert>}
      </form>
    </Dialog>
  );
}

// Native <details> needs these two rules, which inline styles cannot express:
// Safari's marker and the chevron turning when the group opens.
const collapsedGroupCss = `
details[data-matches-group] > summary::-webkit-details-marker { display: none; }
details[data-matches-group][open] .matches-group-chevron { transform: rotate(180deg); }
`;

/* ------------------------------------------------------------------------ */
/* Styles                                                                     */
/* ------------------------------------------------------------------------ */

const styles: Record<string, CSSProperties> = {
  page: appNavStyles.page,
  iosPage: { minHeight: "100dvh" },
  main: pageMainStyle(width.list),
  iosMain: { padding: `${space.xl}px ${space.lg}px calc(${space.xl}px + env(safe-area-inset-bottom))` },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.xl,
    gap: space.lg,
    flexWrap: "wrap",
  },
  pageTitle: { ...type.display, color: color.clubhouseGreen, margin: 0 },
  titleActions: { display: "flex", gap: space.md, flexWrap: "wrap" },
  iosTitleActions: { width: "100%" },

  filterBar: { display: "flex", gap: space.md, flexWrap: "wrap", marginBottom: space.xxl },
  filterField: { flex: "1 1 200px", maxWidth: 280 },
  filterHint: { ...type.bodySmall, color: color.textMuted, margin: 0, flex: "1 1 100%" },
  select: inputStyle,

  emptyCard: { ...cardStyle, padding: 0 },
  quietLine: { ...type.bodySmall, color: color.textMuted, margin: 0 },
  inlineEmpty: {
    ...cardStyle,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
  },

  section: { marginBottom: space.xxl },
  sectionHeader: { display: "flex", alignItems: "center", gap: space.sm, marginBottom: space.md },
  sectionTitle: { ...type.headline, color: color.clubhouseGreen, margin: 0 },
  sectionCount: { ...type.label, fontFamily: "var(--font-body)", color: color.textMuted, fontWeight: 500 },
  sectionDescription: { ...type.bodySmall, color: color.textMuted, margin: `-${space.xs}px 0 ${space.md}px` },
  livePulse: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    background: color.liveGreen,
    boxShadow: `0 0 0 3px color-mix(in srgb, ${color.liveGreen} 30%, transparent)`,
    animation: "pulse 1.5s infinite",
    flex: "0 0 auto",
  },
  collapsedGroup: { display: "grid", gap: space.md },
  details: { ...cardStyle, padding: 0 },
  summary: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.control + 8,
    padding: `0 ${space.lg}px`,
    cursor: "pointer",
    listStyle: "none",
    borderRadius: radius.card,
  },
  summaryTitle: { ...type.title, fontFamily: "var(--font-body)", color: color.clubhouseGreen, margin: 0 },
  detailsBody: { padding: `0 ${space.lg}px ${space.lg}px` },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
    gap: space.lg,
  },
  // A grid cell that lets its card fill the row height, as a direct card child would.
  gridCell: { display: "grid", minWidth: 0 },
  showMoreRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: space.md, marginTop: space.lg },
  showMoreCount: { ...type.bodySmall, color: color.textMuted },
  card: {
    ...cardStyle,
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    minWidth: 0,
  },
  cardFeatured: { gridColumn: "1 / -1" },
  cardLive: {
    borderLeft: `4px solid ${color.liveGreen}`,
    boxShadow: shadow.live,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
  badges: { display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" },
  recordedBadge: {
    ...type.caption,
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    color: color.ink,
    background: color.surfaceMuted,
    padding: "2px 8px",
    borderRadius: radius.pill,
  },
  winnerBadge: {
    ...type.caption,
    fontWeight: 600,
    color: color.clubhouseGreen,
    background: color.greenSoft,
    padding: "2px 8px",
    borderRadius: radius.pill,
  },
  cardTitle: { ...type.label, fontSize: 16, color: color.ink, margin: 0, overflowWrap: "anywhere" },
  cardTitleFeatured: { ...type.title, color: color.ink, margin: 0, overflowWrap: "anywhere" },
  winnerName: { color: color.clubhouseGreen, fontWeight: 700 },
  vs: { color: color.textMuted, fontWeight: 400 },
  scoreBlock: { margin: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: space.sm },
  setScore: { fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: color.ink, letterSpacing: 1 },
  gameScore: { ...type.label, fontSize: 15, color: color.liveText },
  whenLine: {
    ...type.label,
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    color: color.clubhouseGreen,
    margin: 0,
  },
  metaLine: { ...type.caption, color: color.textMuted, margin: 0 },
  contextLine: { ...type.bodySmall, color: color.ink, margin: 0 },
  actionsRow: { display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: "auto", paddingTop: space.xs },
  decisionRow: { display: "flex", gap: space.md, flex: "1 1 100%" },
  decisionBtn: { flex: 1 },
  cardAlert: { flex: "1 1 100%" },

  // Forms
  fieldset: { border: "none", padding: 0, margin: `0 0 ${space.lg}px`, minWidth: 0 },
  legend: { ...type.label, color: color.ink, padding: 0, marginBottom: space.sm },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
    gap: space.md,
  },
  hint: { ...type.bodySmall, color: color.textMuted, margin: `${space.sm}px 0 0` },
  fieldBlock: { marginBottom: space.lg },
  fieldError: { ...type.caption, color: color.destructivePressed, margin: `${space.xs}px 0 0` },
  formAlert: { marginTop: space.lg },
  segmentBlock: { marginBottom: space.lg },
  segment: {
    display: "flex",
    flexWrap: "wrap",
    borderRadius: radius.md,
    border: `1px solid ${color.borderStrong}`,
    overflow: "hidden",
    background: color.surface,
  },
  segmentBtn: {
    ...type.label,
    flex: "1 1 120px",
    minHeight: target.control,
    padding: "0 12px",
    background: color.surface,
    border: "none",
    color: color.ink,
    cursor: "pointer",
  },
  segmentBtnActive: { background: color.brandFill, color: color.onBrand },
  textarea: {
    ...inputStyle,
    minHeight: 160,
    padding: "10px 12px",
    resize: "vertical",
    marginTop: space.sm,
  },
  setBlock: { marginBottom: space.sm },
  // Wraps at 200% zoom or a narrow sheet instead of pushing the remove button off the edge.
  setRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  setLabel: { ...type.bodySmall, color: color.textMuted, width: 72, flex: "0 0 auto" },
  setInput: {
    ...inputStyle,
    width: 64,
    padding: 0,
    fontWeight: 700,
    textAlign: "center",
    color: color.clubhouseGreen,
  },
  setDash: { color: color.textMuted, fontWeight: 600 },
  removeSet: { marginLeft: "auto" },
  tiebreakToggle: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    marginLeft: 80,
    ...type.bodySmall,
    color: color.ink,
    cursor: "pointer",
  },
  checkboxBlock: { marginBottom: space.sm },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    minHeight: target.min,
    cursor: "pointer",
    ...type.label,
    color: color.ink,
  },
  checkbox: { cursor: "pointer", width: 20, height: 20, flex: "0 0 auto", accentColor: "var(--clubhouse-green)" },
  checkboxHint: { ...type.bodySmall, color: color.textMuted, margin: `0 0 0 ${space.xxl}px` },
};
