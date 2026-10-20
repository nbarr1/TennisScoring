"use client";

export const dynamic = "force-dynamic";

import { AppNav, appNavStyles } from "../shared/AppNav";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconChevronRight,
  IconClipboardCheck,
  IconHourglass,
  IconPlayerPlay,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";
import {
  useRankings,
  useDoublesRankings,
  useAuthUser,
  useUserProfile,
  useActiveDivisionId,
  useDivisionLevels,
  useDivisionMemberships,
  usePlayerMatches,
} from "@tennis/firebase-client";
import {
  canRespondToReport,
  currentSeasonForDate,
  defaultSeasonOptions,
  opposingSide,
  sideDisplayName,
  sideOfPlayer,
} from "@tennis/shared";
import type { DivisionMatchType, Match } from "@tennis/shared";
import {
  DataState,
  EmptyState,
  ErrorState,
  LoadingBlock,
  buttonClassName,
  buttonStyle,
  cardStyle,
  color,
  inputStyle,
  radius,
  shadow,
  space,
  type,
  width,
} from "../shared/ui";

/** One standings row, normalized so singles and doubles render identically. */
type StandingsRow = {
  key: string;
  /** The account ids this row belongs to: one for singles, two for a team. */
  memberIds: string[];
  displayName: string;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
};

/** Rostered statuses, so a waitlisted player's level is found too. */
const ROSTERED_STATUSES = ["active", "waitlisted"] as const;

/** Something the player is waiting on someone else for. */
type WaitingItem = { key: string; icon: React.ReactNode; text: string; href: string };

/** One thing this player has to do, newest-urgent first. */
type TodoItem = {
  key: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

function formatWhen(timestamp: number | undefined): string {
  if (!timestamp) return "No time set yet";
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DashboardPage(): React.JSX.Element {
  const router = useRouter();
  const { firebaseUser } = useAuthUser();
  const uid = firebaseUser?.uid ?? null;
  const { profile, loading: profileLoading } = useUserProfile(uid);
  const { divisionId, loading: divisionLoading } = useActiveDivisionId(uid, profile?.divisionId);
  const currentSeason = useMemo(() => currentSeasonForDate(), []);
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [selectedSeasonId, setSelectedSeasonId] = useState(currentSeason.id);
  const [selectedLevelId, setSelectedLevelId] = useState("all");
  const [matchTypeFilter, setMatchTypeFilter] = useState<DivisionMatchType>("singles");
  const [standingsReloadKey, setStandingsReloadKey] = useState(0);
  const [matchesReloadKey, setMatchesReloadKey] = useState(0);
  const { levels: divisionLevels } = useDivisionLevels(divisionId);
  const { memberships: seasonMemberships } = useDivisionMemberships(
    divisionId,
    selectedSeasonId,
    undefined,
    ROSTERED_STATUSES,
  );
  // Seasons where the player picked a format or level themselves, so the
  // preselection below never overrides a choice.
  const filterTouched = useRef(new Set<string>());

  // Open on the player's own level. "All levels" pools every level of the
  // season into one ranked table, which is not a table the league keeps.
  useEffect(() => {
    if (!uid || filterTouched.current.has(selectedSeasonId)) return;
    const mine = seasonMemberships.find((m) => m.userId === uid && m.seasonId === selectedSeasonId);
    const level = mine ? divisionLevels.find((l) => l.id === mine.divisionLevelId) : undefined;
    if (!level) return;
    setMatchTypeFilter(level.matchType);
    setSelectedLevelId(level.id);
  }, [uid, selectedSeasonId, seasonMemberships, divisionLevels]);
  // Only levels of the selected format, so picking Doubles cannot leave a
  // singles level selected underneath it.
  const seasonLevels = divisionLevels.filter(
    (level) => level.seasonId === selectedSeasonId && level.matchType === matchTypeFilter,
  );
  const activeLevelId =
    selectedLevelId !== "all" && seasonLevels.some((level) => level.id === selectedLevelId)
      ? selectedLevelId
      : undefined;
  const seasonName = seasonOptions.find((s) => s.id === selectedSeasonId)?.name ?? selectedSeasonId;
  const levelName = seasonLevels.find((l) => l.id === activeLevelId)?.name ?? "All levels";

  const { matches, loading: matchesLoading, error: matchesError } = usePlayerMatches(uid, matchesReloadKey);

  useEffect(() => {
    if (profileLoading || !profile) return;
    if (profile.divisionId && !profile.tutorialDone) {
      router.replace("/onboarding/tutorial");
    }
  }, [profileLoading, profile, router]);

  const todos: TodoItem[] = [];
  const waiting: WaitingItem[] = [];
  let nextMatch: Match | undefined;
  if (uid) {
    for (const m of matches) {
      const mySide = sideOfPlayer(m, uid);
      if (!mySide) continue;
      const opponent = sideDisplayName(m, opposingSide(mySide)) || "your opponent";
      if (m.status === "in_progress") {
        todos.push({
          key: m.id,
          icon: <IconPlayerPlay size={22} aria-hidden="true" />,
          title: `Your match against ${opponent} is live`,
          detail: "Pick up scoring where you left off.",
          href: `/matches/${m.id}`,
          actionLabel: "Open live match",
        });
      } else if (m.status === "pending_report" && canRespondToReport(m, uid, m.reportSubmission?.submittedBy)) {
        todos.push({
          key: m.id,
          icon: <IconClipboardCheck size={22} aria-hidden="true" />,
          title: `Confirm the score against ${opponent}`,
          detail: "Your opponent reported the result. Confirm it, or dispute it if it's wrong.",
          href: `/matches/${m.id}`,
          actionLabel: "Review report",
        });
      } else if (m.status === "proposed" && mySide === "player2") {
        todos.push({
          key: m.id,
          icon: <IconCalendarEvent size={22} aria-hidden="true" />,
          title: `${opponent} proposed a match`,
          detail: `${formatWhen(m.scheduledAt)}. Accept or decline the proposal on Matches.`,
          href: "/matches",
          actionLabel: "Respond to proposal",
        });
      } else if (m.status === "pending_report" && !m.reportSubmission) {
        // Live scoring has finished, but nobody has submitted the result yet.
        todos.push({
          key: m.id,
          icon: <IconClipboardCheck size={22} aria-hidden="true" />,
          title: `Submit the score against ${opponent}`,
          detail: `The match is over. Submit the result so ${opponent} can confirm it.`,
          href: `/matches/${m.id}`,
          actionLabel: "Submit score",
        });
      } else if (m.status === "pending_report") {
        waiting.push({
          key: m.id,
          icon: <IconHourglass size={18} aria-hidden="true" />,
          text: `Waiting for ${opponent} to confirm the score`,
          href: `/matches/${m.id}`,
        });
      } else if (m.status === "disputed") {
        waiting.push({
          key: m.id,
          icon: <IconAlertTriangle size={18} aria-hidden="true" />,
          text: `Your result against ${opponent} is disputed. A division leader will resolve it.`,
          href: `/matches/${m.id}`,
        });
      } else if (m.status === "proposed" && mySide === "player1") {
        waiting.push({
          key: m.id,
          icon: <IconCalendarEvent size={18} aria-hidden="true" />,
          text: `Waiting for ${opponent} to answer your proposal (${formatWhen(m.scheduledAt)})`,
          href: "/matches",
        });
      }
    }
    nextMatch = matches
      .filter((m) => m.status === "scheduled" && sideOfPlayer(m, uid))
      .sort((a, b) => (a.scheduledAt ?? Number.MAX_SAFE_INTEGER) - (b.scheduledAt ?? Number.MAX_SAFE_INTEGER))[0];
  }

  const noDivision = !profileLoading && !divisionLoading && !divisionId;
  const firstName = (profile?.displayName ?? "").trim().split(/\s+/)[0];

  return (
    <div style={styles.page}>
      <AppNav active="dashboard" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>{firstName ? `Welcome back, ${firstName}` : "Dashboard"}</h1>

        {noDivision ? (
          <section style={styles.card}>
            <EmptyState
              icon={<IconUsers size={32} aria-hidden="true" />}
              title="You're not in a division yet"
              description="Join a division with a code from your leader, or create one, to see standings and schedule matches."
              action={
                <Link href="/onboarding/division" className={buttonClassName("primary")} style={buttonStyle("primary")}>
                  Join or create a division
                </Link>
              }
            />
          </section>
        ) : (
          <>
            <section aria-labelledby="todo-heading" style={styles.card}>
              <h2 id="todo-heading" style={styles.sectionTitle}>
                For you
              </h2>
              {matchesError ? (
                <ErrorState
                  compact
                  title="Couldn't load your matches."
                  error={matchesError}
                  onRetry={() => setMatchesReloadKey((k) => k + 1)}
                />
              ) : matchesLoading ? (
                <LoadingBlock label="Loading your matches…" rows={2} rowHeight={48} />
              ) : (
                <>
                  {todos.length > 0 ? (
                    <ul style={styles.todoList}>
                      {todos.map((item) => (
                        <li key={item.key} style={styles.todoItem}>
                          <span style={styles.todoIcon}>{item.icon}</span>
                          <div style={styles.todoBody}>
                            <p style={styles.todoTitle}>{item.title}</p>
                            <p style={styles.todoDetail}>{item.detail}</p>
                          </div>
                          <Link
                            href={item.href}
                            className={buttonClassName("primary")}
                            style={buttonStyle("primary", { size: "sm" })}
                          >
                            {item.actionLabel}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={styles.allClear}>Nothing needs you right now.</p>
                  )}
                  {waiting.length > 0 && (
                    <div style={styles.waiting}>
                      <h3 style={styles.subTitle}>Waiting on others</h3>
                      <ul style={styles.waitingList}>
                        {waiting.map((item) => (
                          <li key={item.key}>
                            <Link href={item.href} style={styles.waitingLink}>
                              <span style={styles.waitingIcon}>{item.icon}</span>
                              <span style={styles.waitingText}>{item.text}</span>
                              <IconChevronRight size={18} aria-hidden="true" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div style={styles.nextMatch}>
                    <h3 style={styles.subTitle}>Your next match</h3>
                    {nextMatch && uid ? (
                      <Link href={`/matches/${nextMatch.id}`} style={styles.nextMatchLink}>
                        <span>
                          <span style={styles.nextMatchOpponent}>
                            vs {sideDisplayName(nextMatch, opposingSide(sideOfPlayer(nextMatch, uid) ?? "player1")) || "Opponent"}
                          </span>
                          <span style={styles.nextMatchWhen}>{formatWhen(nextMatch.scheduledAt)}</span>
                        </span>
                        <IconChevronRight size={20} aria-hidden="true" />
                      </Link>
                    ) : (
                      <p style={styles.todoDetail}>
                        No match scheduled.{" "}
                        <Link href="/matches" style={styles.inlineLink}>
                          Propose one on Matches
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>

            <section aria-labelledby="standings-heading">
              <div style={styles.standingsHeader}>
                <h2 id="standings-heading" style={styles.sectionTitleLarge}>
                  {matchTypeFilter === "doubles" ? "Doubles team standings" : "Singles standings"}
                </h2>
                <p style={styles.subtitle}>
                  Ranked by matches won, then sets won, games won, game difference, and head-to-head. Only
                  confirmed results count.
                </p>
              </div>

              <fieldset style={styles.filterBar}>
                <legend className="sr-only">Standings filters</legend>
                <label style={styles.filterLabel}>
                  Format
                  <select
                    style={styles.select}
                    value={matchTypeFilter}
                    onChange={(e) => {
                      filterTouched.current.add(selectedSeasonId);
                      setMatchTypeFilter(e.target.value as DivisionMatchType);
                      setSelectedLevelId("all");
                    }}
                  >
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </label>
                <label style={styles.filterLabel}>
                  Season
                  <select
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
                </label>
                <label style={styles.filterLabel}>
                  Division level
                  <select
                    style={styles.select}
                    value={activeLevelId ?? "all"}
                    onChange={(e) => {
                      filterTouched.current.add(selectedSeasonId);
                      setSelectedLevelId(e.target.value);
                    }}
                  >
                    <option value="all">All levels</option>
                    {seasonLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              {!activeLevelId && seasonLevels.length > 1 && (
                <p style={styles.pooledNote}>
                  &ldquo;All levels&rdquo; combines every {matchTypeFilter} level of this season into one table. The
                  league keeps standings for each level separately; choose a level to see its table.
                </p>
              )}

              <StandingsSection
                // A remount re-runs the ranking subscriptions after a failure.
                key={standingsReloadKey}
                divisionId={divisionId}
                divisionLoading={divisionLoading}
                matchType={matchTypeFilter}
                seasonId={selectedSeasonId}
                divisionLevelId={activeLevelId}
                caption={`${matchTypeFilter === "doubles" ? "Doubles team" : "Singles"} standings, ${seasonName}, ${levelName}`}
                currentUserId={uid}
                onRetry={() => setStandingsReloadKey((k) => k + 1)}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StandingsSection({
  divisionId,
  divisionLoading,
  matchType,
  seasonId,
  divisionLevelId,
  caption,
  currentUserId,
  onRetry,
}: {
  divisionId: string | null;
  divisionLoading: boolean;
  matchType: DivisionMatchType;
  seasonId: string;
  divisionLevelId: string | undefined;
  caption: string;
  currentUserId: string | null;
  onRetry: () => void;
}): React.JSX.Element {
  const isDoubles = matchType === "doubles";
  const filters = { seasonId, divisionLevelId };
  const singles = useRankings(isDoubles ? null : divisionId, filters);
  const doubles = useDoublesRankings(isDoubles ? divisionId : null, filters);
  const { loading, error } = isDoubles ? doubles : singles;
  const rows: StandingsRow[] = isDoubles
    ? doubles.rankings.map((r) => ({ ...r, key: r.teamId, memberIds: r.playerIds ?? [] }))
    : singles.rankings.map((r) => ({ ...r, key: r.userId, memberIds: [r.userId] }));
  const myIndex = currentUserId ? rows.findIndex((r) => r.memberIds.includes(currentUserId)) : -1;
  const myRow = myIndex >= 0 ? rows[myIndex] : undefined;

  return (
    <DataState
      loading={loading || divisionLoading}
      error={error}
      isEmpty={rows.length === 0}
      loadingLabel="Loading standings…"
      loadingRows={6}
      errorTitle="Couldn't load standings."
      onRetry={onRetry}
      empty={
        <div style={styles.card}>
          <EmptyState
            compact
            icon={<IconTrophy size={32} aria-hidden="true" />}
            title={isDoubles ? "No confirmed doubles results yet" : "No confirmed results yet"}
            description={
              isDoubles
                ? "Team standings appear once both sides confirm the first doubles result for this season and level."
                : "Standings appear once both players confirm the first result for this season and level."
            }
            action={
              <Link href="/matches" className={buttonClassName("secondary")} style={buttonStyle("secondary")}>
                Go to matches
              </Link>
            }
          />
        </div>
      }
    >
      {myRow && (
        <p style={styles.myStanding} role="note">
          <strong style={styles.myStandingRank}>#{myIndex + 1}</strong>
          <span>
            {isDoubles ? `${myRow.displayName}: ` : "You: "}
            {myRow.matchesWon}–{myRow.matchesLost} in matches, {formatDiff(myRow.gameDifferential)} games
          </span>
        </p>
      )}
      <div style={styles.tableWrap} role="region" aria-label={caption} tabIndex={0}>
        <table style={styles.table}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...styles.th, ...styles.thRank }}>
                <span aria-hidden="true">#</span>
                <span className="sr-only">Rank</span>
              </th>
              <th scope="col" style={{ ...styles.th, textAlign: "left" }}>
                {isDoubles ? "Team" : "Player"}
              </th>
              <th scope="col" style={styles.th}>
                <abbr title="Matches won" style={styles.abbr}>W</abbr>
              </th>
              <th scope="col" style={styles.th}>
                <abbr title="Matches lost" style={styles.abbr}>L</abbr>
              </th>
              <th scope="col" style={styles.th}>
                <abbr title="Sets won / sets played" style={styles.abbr}>Sets</abbr>
              </th>
              <th scope="col" style={styles.th}>
                <abbr title="Games won / games played" style={styles.abbr}>Games</abbr>
              </th>
              <th scope="col" style={styles.th}>
                <abbr title="Game difference" style={styles.abbr}>+/−</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isMe = i === myIndex;
              return (
                <tr key={r.key} style={isMe ? styles.rowMe : undefined} aria-current={isMe ? "true" : undefined}>
                  <td style={{ ...styles.td, ...styles.tdRank }}>
                    {i === 0 ? (
                      <span style={styles.leader}>
                        <IconTrophy size={16} aria-hidden="true" />1
                      </span>
                    ) : (
                      i + 1
                    )}
                  </td>
                  <th scope="row" style={styles.tdName}>
                    {r.displayName}
                    {isMe && <span style={styles.youBadge}>{isDoubles ? "Your team" : "You"}</span>}
                  </th>
                  <td style={styles.td}>{r.matchesWon}</td>
                  <td style={styles.td}>{r.matchesLost}</td>
                  <td style={styles.td}>
                    {r.setsWon}/{r.setsWon + r.setsLost}
                  </td>
                  <td style={styles.td}>
                    {r.gamesWon}/{r.gamesWon + r.gamesLost}
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      fontWeight: 600,
                      color: r.gameDifferential >= 0 ? color.courtGreen : color.destructivePressed,
                    }}
                  >
                    {formatDiff(r.gameDifferential)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DataState>
  );
}

function formatDiff(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: width.wide, margin: "0 auto", padding: "40px 24px" },
  pageTitle: {
    ...type.display,
    color: color.clubhouseGreen,
    marginBottom: space.xl,
    overflowWrap: "anywhere",
  },
  card: { ...cardStyle, marginBottom: space.xl },
  sectionTitle: { ...type.headline, color: color.clubhouseGreen, marginBottom: space.md },
  sectionTitleLarge: { ...type.headline, color: color.clubhouseGreen, marginBottom: space.xs },
  subTitle: { ...type.label, color: color.ink, marginBottom: space.sm },
  subtitle: { ...type.bodySmall, color: color.textMuted, maxWidth: "70ch" },
  standingsHeader: { marginBottom: space.lg },
  todoList: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.sm },
  todoItem: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    background: color.greenSoft,
  },
  todoIcon: { color: color.clubhouseGreen, display: "flex", flexShrink: 0 },
  todoBody: { flex: "1 1 240px", minWidth: 0 },
  todoTitle: { ...type.label, fontSize: 16, color: color.ink, overflowWrap: "anywhere" },
  todoDetail: { ...type.bodySmall, color: color.textMuted, marginTop: space.xxs },
  allClear: { ...type.body, color: color.textMuted },
  nextMatch: { marginTop: space.lg, paddingTop: space.lg, borderTop: `1px solid ${color.border}` },
  nextMatchLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: 56,
    padding: `${space.sm}px ${space.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${color.border}`,
    color: color.ink,
    textDecoration: "none",
  },
  nextMatchOpponent: { display: "block", ...type.label, fontSize: 16, overflowWrap: "anywhere" },
  nextMatchWhen: { display: "block", ...type.bodySmall, color: color.textMuted },
  inlineLink: { color: color.clubhouseGreen, fontWeight: 600, textDecoration: "underline" },
  filterBar: {
    display: "flex",
    gap: space.md,
    flexWrap: "wrap",
    alignItems: "end",
    marginBottom: space.lg,
    border: "none",
    padding: 0,
    minWidth: 0,
  },
  filterLabel: {
    display: "grid",
    gap: space.xs,
    ...type.label,
    color: color.ink,
    flex: "1 1 180px",
    maxWidth: 260,
  },
  select: { ...inputStyle, fontWeight: 400 },
  myStanding: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.sm,
    ...type.body,
    color: color.ink,
    marginBottom: space.md,
  },
  myStandingRank: { ...type.headline, color: color.clubhouseGreen },
  tableWrap: {
    background: color.surface,
    borderRadius: radius.card,
    overflowX: "auto",
    boxShadow: shadow.card,
  },
  table: {
    width: "100%",
    minWidth: 520,
    borderCollapse: "collapse",
    fontVariantNumeric: "tabular-nums",
  },
  th: {
    ...type.label,
    padding: "12px 12px",
    background: color.clubhouseGreen,
    color: color.surface,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  thRank: { width: 64, paddingLeft: 20, textAlign: "left" },
  abbr: { textDecoration: "none", cursor: "help" },
  td: {
    ...type.bodySmall,
    padding: "14px 12px",
    textAlign: "center",
    color: color.ink,
    borderBottom: `1px solid ${color.border}`,
  },
  tdRank: { textAlign: "left", paddingLeft: 20, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 },
  tdName: {
    ...type.label,
    fontSize: 15,
    textAlign: "left",
    padding: "14px 12px",
    color: color.ink,
    borderBottom: `1px solid ${color.border}`,
    overflowWrap: "anywhere",
  },
  rowMe: { background: color.greenSoft },
  pooledNote: { ...type.bodySmall, color: color.textMuted, marginTop: -space.sm, marginBottom: space.lg, maxWidth: "70ch" },
  waiting: { marginTop: space.lg },
  waitingList: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.xs },
  waitingLink: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    padding: `${space.xs}px ${space.sm}px`,
    borderRadius: radius.md,
    color: color.ink,
    ...type.bodySmall,
  },
  waitingIcon: { color: color.textMuted, display: "flex", flexShrink: 0 },
  waitingText: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  leader: { display: "inline-flex", alignItems: "center", gap: space.xs, color: color.clubhouseGreen },
  youBadge: {
    ...type.caption,
    marginLeft: space.sm,
    padding: "2px 8px",
    borderRadius: radius.pill,
    background: color.clubhouseGreen,
    color: color.surface,
    whiteSpace: "nowrap",
  },
};
