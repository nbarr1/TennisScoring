import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { onSnapshot } from "firebase/firestore";
import {
  divisionMatchesQuery,
  createMatch,
  recordHistoricMatch,
  recordMatchOnBehalf,
  proposeMatch,
  proposeDoublesMatch,
  acceptMatchProposal,
  declineMatchProposal,
  useDivisionLevels,
  useDivisionMemberships,
} from "@tennis/firebase-client";
import {
  canRespondToReport,
  currentSeasonForDate,
  defaultSeasonOptions,
  formatGameScore,
  formatScoreDisplay,
  getMatchStatusMetadata,
  isMatchParticipant,
  opposingSide,
  sideDisplayName,
  sideOfPlayer,
  validateRecordedSets,
} from "@tennis/shared";
import type {
  DivisionLevel,
  DivisionMembershipStatus,
  Match,
  PublicProfile,
  RecordedSetInput,
  User,
} from "@tennis/shared";
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  announce,
  colors,
  confirmDestructive,
  elevations,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";
import { useAppStore } from "../../store/appStore";
import { StatusBadge } from "../../components/StatusBadge";
import { KeyboardAwareBottomSheet } from "../../components/KeyboardSafeView";
import {
  MatchTiebreakToggle,
  withEligibleTiebreaks,
  type SetDraft,
} from "../../components/MatchTiebreakToggle";
import { PlayerSlotPicker } from "../../components/PlayerSlotPicker";
import { AppIcon, IconLabel, ICON_SIZE } from "../../components/AppIcon";
import {
  DateTimeField,
  type DateTimeFieldHandle,
} from "../../components/DateTimeField";
import { FormErrorSummary, FormField } from "../../components/FormField";

const IS_ANDROID = Platform.OS === "android";

type MatchFilter = "all" | "action" | "upcoming" | "history";

const FILTERS: { id: MatchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "action", label: "Needs action" },
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "History" },
];

/**
 * Where a match sits on this screen, in the order the player needs them:
 * what they must do now, their own next matches, what waits on someone else,
 * then the rest of the division, then history.
 */
type Bucket =
  | "needsYou"
  | "next"
  | "waiting"
  | "live"
  | "divisionUpcoming"
  | "review"
  | "history";

const BUCKET_FILTERS: Record<Bucket, MatchFilter[]> = {
  needsYou: ["all", "action", "upcoming"],
  next: ["all", "upcoming"],
  waiting: ["all", "action", "upcoming"],
  live: ["all", "upcoming"],
  divisionUpcoming: ["all", "upcoming"],
  review: ["all", "action"],
  history: ["all", "history"],
};

type CardKind =
  "invite" | "confirm" | "awaiting" | "myReport" | "myDispute" | "plain";

type MatchItem = { id: string; match: Match; kind: CardKind };
type MatchSection = {
  key: Bucket;
  title: string;
  total: number;
  data: MatchItem[];
};

/** A roster view must include waitlisted players (see CLAUDE.md). */
const ROSTER_STATUSES: readonly DivisionMembershipStatus[] = [
  "active",
  "waitlisted",
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatScheduledAt(ts?: number): string {
  if (!ts) return "Time to be decided";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A local calendar day as the form's `YYYY-MM-DD` value. */
function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** One-tap days for a proposal: today and the six days after it. */
function upcomingDays(
  now = new Date(),
): { value: string; label: string; spoken: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const spoken = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
            });
    return { value: isoDay(d), label, spoken };
  });
}

/** When the match was (or will be) played, for sorting history and fixtures. */
function playDate(m: Match): number {
  return m.scheduledAt ?? m.startedAt ?? m.completedAt ?? m.createdAt ?? 0;
}

function bucketOf(m: Match, uid: string | undefined): Bucket | null {
  const mine = !!uid && isMatchParticipant(m, uid);
  switch (m.status) {
    case "proposed":
      // Other players' proposals are private to them.
      if (!mine) return null;
      return sideOfPlayer(m, uid!) === "player2" ? "needsYou" : "waiting";
    case "scheduled":
      return mine ? "next" : "divisionUpcoming";
    case "in_progress":
      return mine ? "next" : "live";
    case "pending_report":
      if (!mine) return "review";
      return canRespondToReport(m, uid!, m.reportSubmission?.submittedBy)
        ? "needsYou"
        : "waiting";
    case "disputed":
      return mine ? "waiting" : "review";
    case "completed":
    case "cancelled":
      return "history";
    default:
      return null;
  }
}

function kindOf(m: Match, bucket: Bucket): CardKind {
  if (bucket === "needsYou")
    return m.status === "proposed" ? "invite" : "confirm";
  if (bucket === "waiting") {
    if (m.status === "proposed") return "awaiting";
    if (m.status === "disputed") return "myDispute";
    return "myReport";
  }
  return "plain";
}

/** The other side's name from the viewer's point of view. */
function opponentName(m: Match, uid: string | undefined): string {
  const side = uid ? sideOfPlayer(m, uid) : undefined;
  const name = sideDisplayName(m, side ? opposingSide(side) : "player2");
  return name || "your opponent";
}

/**
 * A two-player match is singles by shape. Doubles levels can hold two-player
 * matches too, but the record callables treat `matchType: "doubles"` as a
 * request for a four-player match, so the label is only written for singles.
 */
function twoPlayerMatchType(
  level: DivisionLevel | undefined,
): Match["matchType"] | undefined {
  return level?.matchType === "singles" ? "singles" : undefined;
}

// ---------------------------------------------------------------------------
// Season and division level for a new match
// ---------------------------------------------------------------------------

type CompetitionChoice = ReturnType<typeof useCompetitionChoice>;

/**
 * The season and division level a new match is created in. This is the
 * form's own choice, never the list's view filter: it defaults to the current
 * season and to the division level the anchor player (you, or the first
 * player when a leader records for others) belongs to that season.
 */
function useCompetitionChoice(
  divisionId: string,
  anchorPlayerId: string | undefined,
) {
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [seasonId, setSeasonIdState] = useState(
    () => currentSeasonForDate().id,
  );
  // undefined: follow the default. null: explicitly no level.
  const [chosenLevelId, setChosenLevelId] = useState<string | null | undefined>(
    undefined,
  );
  const {
    levels,
    loading: levelsLoading,
    error: levelsError,
  } = useDivisionLevels(divisionId);
  const { memberships, loading: membershipsLoading } = useDivisionMemberships(
    divisionId,
    seasonId,
    null,
    ROSTER_STATUSES,
  );

  const seasonLevels = levels.filter(
    (level) => level.seasonId === seasonId && level.active !== false,
  );
  const ownLevelId = anchorPlayerId
    ? memberships.find(
        (m) =>
          m.userId === anchorPlayerId &&
          seasonLevels.some((level) => level.id === m.divisionLevelId),
      )?.divisionLevelId
    : undefined;
  const defaultLevelId =
    ownLevelId ?? (seasonLevels.length === 1 ? seasonLevels[0].id : null);
  const levelId =
    chosenLevelId !== undefined &&
    seasonLevels.some((level) => level.id === chosenLevelId)
      ? chosenLevelId
      : defaultLevelId;
  const level = seasonLevels.find((l) => l.id === levelId);
  const loading = levelsLoading || membershipsLoading;
  const seasonName =
    seasonOptions.find((s) => s.id === seasonId)?.name ?? seasonId;

  return {
    seasonId,
    seasonName,
    seasonOptions,
    setSeasonId: (id: string) => {
      setSeasonIdState(id);
      setChosenLevelId(undefined);
    },
    seasonLevels,
    level,
    ownLevelId,
    setLevelId: (id: string) => setChosenLevelId(id),
    touched: chosenLevelId !== undefined,
    loading,
    levelsError: !!levelsError,
    /** Set when the season has levels and none is chosen. */
    levelError:
      !loading && seasonLevels.length > 0 && !level
        ? "Choose a division level."
        : "",
  };
}

function CompetitionFields({
  choice,
  showError,
}: {
  choice: CompetitionChoice;
  showError: boolean;
}) {
  const levelError = showError ? choice.levelError : "";
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel} accessibilityRole="header">
        Season
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {choice.seasonOptions.map((season) => (
          <Chip
            key={season.id}
            label={season.name}
            accessibilityLabel={`Season ${season.name}`}
            selected={choice.seasonId === season.id}
            onPress={() => choice.setSeasonId(season.id)}
          />
        ))}
      </ScrollView>

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
        Division level
      </Text>
      {choice.loading ? (
        <LoadingState inline label="Loading division levels" showLabel />
      ) : choice.levelsError ? (
        <InlineAlert
          tone="warning"
          message="Couldn't load division levels. The match will be saved to the season without a level."
        />
      ) : choice.seasonLevels.length === 0 ? (
        <Text style={styles.helperText}>
          {`${choice.seasonName} has no division levels yet, so the match is saved to the season without one.`}
        </Text>
      ) : (
        <>
          <View style={styles.chipWrap}>
            {choice.seasonLevels.map((level) => {
              const own = level.id === choice.ownLevelId;
              return (
                <Chip
                  key={level.id}
                  label={own ? `${level.name} (yours)` : level.name}
                  accessibilityLabel={`Division level ${level.name}${own ? ", your level" : ""}`}
                  selected={choice.level?.id === level.id}
                  onPress={() => choice.setLevelId(level.id)}
                />
              );
            })}
          </View>
          {levelError ? (
            <Text style={styles.errorText}>{levelError}</Text>
          ) : (
            <Text style={styles.helperText}>
              {choice.ownLevelId
                ? "Set to the player's own division level for this season."
                : "Pick the division level this match belongs to."}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Form sheet shell
// ---------------------------------------------------------------------------

/** Ask before throwing away a half-filled form. */
async function confirmDiscard(dirty: boolean, close: () => void) {
  if (
    !dirty ||
    (await confirmDestructive({
      title: "Discard this match?",
      message: "What you've entered so far will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
    }))
  )
    close();
}

function FormSheet({
  title,
  onRequestClose,
  children,
}: {
  title: string;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onRequestClose}
    >
      <KeyboardAwareBottomSheet style={styles.modalOverlay}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              {title}
            </Text>
            <IconButton label="Close" icon="xmark" onPress={onRequestClose} />
          </View>
          {children}
        </View>
      </KeyboardAwareBottomSheet>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Match card
// ---------------------------------------------------------------------------

function MatchCard({
  match,
  uid,
  kind,
  onOpen,
  onNotice,
}: {
  match: Match;
  uid: string | undefined;
  kind: CardKind;
  onOpen: () => void;
  /** Shows an action's outcome above the list, since the card moves or leaves. */
  onNotice: (message: string) => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const isLive = match.status === "in_progress";
  const isUpcoming =
    match.status === "scheduled" || match.status === "proposed";
  const metadata = getMatchStatusMetadata(match.status);
  const player1Name = sideDisplayName(match, "player1") || "Player 1";
  const player2Name = sideDisplayName(match, "player2") || "Player 2";
  const opponent = opponentName(match, uid);
  const mine = !!uid && isMatchParticipant(match, uid);

  const acceptMessage = `Match with ${opponent} accepted. It's now in your upcoming matches.`;
  const declineMessage =
    kind === "invite"
      ? `Proposal from ${opponent} declined.`
      : `Proposal to ${opponent} withdrawn.`;
  const accept = useAsyncAction(() => acceptMatchProposal(match.id), {
    successMessage: acceptMessage,
    onSuccess: () => onNotice(acceptMessage),
    errorMessage:
      "Couldn't accept the proposal. Check your connection and try again.",
  });
  const decline = useAsyncAction(() => declineMatchProposal(match.id), {
    successMessage: declineMessage,
    onSuccess: () => onNotice(declineMessage),
    errorMessage:
      kind === "invite"
        ? "Couldn't decline the proposal. Check your connection and try again."
        : "Couldn't withdraw the proposal. Check your connection and try again.",
  });

  async function handleDecline() {
    const ok = await confirmDestructive(
      kind === "invite"
        ? {
            title: "Decline this proposal?",
            message: `${opponent} will be told you declined. The match is cancelled.`,
            confirmLabel: "Decline",
            cancelLabel: "Keep proposal",
          }
        : {
            title: "Withdraw this proposal?",
            message: `The match with ${opponent} is cancelled and leaves their invitations.`,
            confirmLabel: "Withdraw",
            cancelLabel: "Keep proposal",
          },
    );
    if (ok) await decline.run();
  }

  const context =
    kind === "invite"
      ? `${opponent} invited you to play.`
      : kind === "confirm"
        ? `${opponent} reported this result. Confirm or dispute it.`
        : kind === "awaiting"
          ? `Waiting for ${opponent} to accept.`
          : kind === "myReport"
            ? `Waiting for ${opponent} to confirm the result.`
            : kind === "myDispute"
              ? "Disputed. A division leader will resolve it."
              : isLive && mine
                ? "Your match is live. Open it to keep scoring."
                : "";

  const winnerName = match.winner ? sideDisplayName(match, match.winner) : "";
  const serverName = isLive
    ? sideDisplayName(match, match.liveScore.server)
    : "";
  const scoreText = !isUpcoming ? formatScoreDisplay(match.liveScore) : "";

  const cardAccessibilityLabel = [
    `${player1Name} versus ${player2Name}`,
    metadata.accessibilityLabel,
    context,
    isUpcoming ? formatScheduledAt(match.scheduledAt) : "",
    scoreText ? `Score ${scoreText}` : "",
    winnerName ? `${winnerName} won` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const actionError = accept.error ?? decline.error;

  return (
    <View style={[styles.card, isLive && styles.cardLive]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cardAccessibilityLabel}
        accessibilityHint="Opens the match"
        onPress={onOpen}
        android_ripple={{ color: "rgba(26, 71, 42, 0.12)" }}
        style={({ pressed }) => [
          styles.cardBody,
          !IS_ANDROID && pressed && styles.cardBodyPressed,
        ]}
      >
        <View style={[styles.cardHeader, compact && styles.wrapRow]}>
          <StatusBadge status={match.status} />
          {!!winnerName && (
            <Text style={styles.winnerBadge}>{`${winnerName} wins`}</Text>
          )}
        </View>

        {!!context && <Text style={styles.contextLine}>{context}</Text>}

        {isUpcoming && (
          <IconLabel name="calendar" textStyle={styles.scheduledLine}>
            {formatScheduledAt(match.scheduledAt)}
          </IconLabel>
        )}

        {!isUpcoming && (
          <View style={[styles.scoreRow, compact && styles.wrapRow]}>
            <Text style={styles.setScore} maxFontSizeMultiplier={1.35}>
              {scoreText}
            </Text>
            {isLive && (
              <Text style={styles.gameScore} maxFontSizeMultiplier={1.5}>
                {formatGameScore(match.liveScore)}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.players, compact && styles.playersCompact]}>
          <Text
            style={[
              styles.playerName,
              match.winner === "player1" && styles.winner,
            ]}
          >
            {player1Name}
          </Text>
          <Text style={styles.vs}>vs</Text>
          <View style={styles.playerRight}>
            <Text
              style={[
                styles.playerName,
                styles.playerNameRight,
                match.winner === "player2" && styles.winner,
              ]}
            >
              {player2Name}
            </Text>
            {match.player2IsGuest && (
              <Text style={styles.guestBadge}>Guest</Text>
            )}
          </View>
        </View>

        {isLive && (
          <Text style={styles.serverLine}>
            {`${serverName} serves · ${match.liveScore.serviceSide === "advantage" ? "ad" : "deuce"} court`}
          </Text>
        )}
      </Pressable>

      {kind === "invite" && (
        <View
          style={[styles.cardActions, compact && styles.cardActionsCompact]}
        >
          <Button
            label="Accept"
            icon="checkmark"
            accessibilityLabel={`Accept proposal from ${opponent}`}
            pending={accept.pending}
            disabled={decline.pending}
            onPress={() => accept.run()}
            style={styles.cardActionButton}
          />
          <Button
            label="Decline"
            variant="secondary"
            accessibilityLabel={`Decline proposal from ${opponent}`}
            pending={decline.pending}
            disabled={accept.pending}
            onPress={handleDecline}
            style={styles.cardActionButton}
          />
        </View>
      )}
      {kind === "awaiting" && (
        <View style={styles.cardActions}>
          <Button
            label="Withdraw proposal"
            variant="secondary"
            accessibilityLabel={`Withdraw proposal to ${opponent}`}
            pending={decline.pending}
            onPress={handleDecline}
            style={styles.cardActionButton}
          />
        </View>
      )}
      {kind === "confirm" && (
        <View style={styles.cardActions}>
          <Button
            label="Review result"
            accessibilityLabel={`Review the result ${opponent} reported`}
            onPress={onOpen}
            style={styles.cardActionButton}
          />
        </View>
      )}
      {!!actionError && (
        <InlineAlert
          tone="error"
          message={actionError}
          style={styles.cardAlert}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type Sheet = null | "choices" | "live" | "historic" | "propose";

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const { user, divisionId } = useAppStore();
  const router = useRouter();
  const currentSeasonId = useMemo(() => currentSeasonForDate().id, []);
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [selectedSeasonId, setSelectedSeasonId] = useState(currentSeasonId);
  const [activeFilter, setActiveFilter] = useState<MatchFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  // null: the filter's default (open on History, closed on All).
  const [historyOpen, setHistoryOpen] = useState<boolean | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!divisionId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    const unsub = onSnapshot(
      divisionMatchesQuery(divisionId),
      (snap) => {
        setMatches(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Match));
        setLoading(false);
      },
      (err) => {
        console.error("[MatchesScreen] matches listener error:", err);
        setLoadError(true);
        setLoading(false);
      },
    );
    return unsub;
  }, [divisionId, loadRetryKey]);

  if (loading) return <LoadingState label="Loading matches" />;

  if (loadError)
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load matches"
          message="Check your connection, then try again."
          onRetry={() => setLoadRetryKey((key) => key + 1)}
        />
      </View>
    );

  if (!divisionId || !user)
    return (
      <View style={styles.container}>
        <EmptyState
          icon="person.crop.rectangle.stack"
          title="You're not in a division yet"
          message="Join a division with an invite or a join code to see and schedule matches."
        />
      </View>
    );

  const uid = user.id;
  const canRecordOnBehalf =
    user.role === "admin" ||
    user.role === "division_leader" ||
    user.role === "app_developer";

  const normalizedSearch = playerSearch.trim().toLocaleLowerCase();
  const seasonMatches = matches.filter(
    (match) => match.seasonId === selectedSeasonId,
  );
  const visibleMatches = seasonMatches.filter((match) => {
    if (!normalizedSearch) return true;
    return [
      match.player1Name,
      match.player2Name,
      match.side1?.displayName,
      match.side2?.displayName,
    ].some((name) => name?.toLocaleLowerCase().includes(normalizedSearch));
  });

  const buckets: Record<Bucket, Match[]> = {
    needsYou: [],
    next: [],
    waiting: [],
    live: [],
    divisionUpcoming: [],
    review: [],
    history: [],
  };
  for (const match of visibleMatches) {
    const bucket = bucketOf(match, uid);
    if (bucket) buckets[bucket].push(match);
  }
  const byPlayDateAsc = (a: Match, b: Match) =>
    (a.scheduledAt ?? Number.MAX_SAFE_INTEGER) -
    (b.scheduledAt ?? Number.MAX_SAFE_INTEGER);
  // Invitations first, then results to confirm, each soonest first.
  buckets.needsYou.sort(
    (a, b) =>
      Number(a.status !== "proposed") - Number(b.status !== "proposed") ||
      byPlayDateAsc(a, b),
  );
  // A live match of yours first, then the next scheduled one.
  buckets.next.sort(
    (a, b) =>
      Number(b.status === "in_progress") - Number(a.status === "in_progress") ||
      byPlayDateAsc(a, b),
  );
  buckets.waiting.sort(byPlayDateAsc);
  buckets.live.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  buckets.divisionUpcoming.sort(byPlayDateAsc);
  buckets.review.sort((a, b) => playDate(b) - playDate(a));
  buckets.history.sort((a, b) => playDate(b) - playDate(a));

  const needsYouCount = buckets.needsYou.length;
  const historyExpanded = historyOpen ?? activeFilter === "history";
  const titles: Record<Bucket, string> = {
    needsYou: "Needs you",
    next: buckets.next.length === 1 ? "Your next match" : "Your matches",
    waiting: "Waiting on others",
    live: "Live in your division",
    divisionUpcoming: "Scheduled in your division",
    review: "Results in review",
    history: "History",
  };
  const sections: MatchSection[] = (Object.keys(buckets) as Bucket[])
    .filter(
      (key) =>
        BUCKET_FILTERS[key].includes(activeFilter) && buckets[key].length > 0,
    )
    .map((key) => ({
      key,
      title: titles[key],
      total: buckets[key].length,
      data:
        key === "history" && !historyExpanded
          ? []
          : buckets[key].map((match) => ({
              id: match.id,
              match,
              kind: kindOf(match, key),
            })),
    }));

  const seasonName =
    seasonOptions.find((s) => s.id === selectedSeasonId)?.name ??
    selectedSeasonId;

  function finishSheet(message: string) {
    setSheet(null);
    setNotice(message);
    announce(message);
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MatchCard
            match={item.match}
            uid={uid}
            kind={item.kind}
            onOpen={() => router.push(`/match/${item.id}`)}
            onNotice={setNotice}
          />
        )}
        renderSectionHeader={({ section }) =>
          section.key === "history" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`History, ${section.total} ${section.total === 1 ? "match" : "matches"}`}
              accessibilityState={{ expanded: historyExpanded }}
              accessibilityHint={
                historyExpanded ? "Hides match history" : "Shows match history"
              }
              onPress={() => setHistoryOpen(!historyExpanded)}
              style={[styles.sectionHeader, styles.sectionHeaderButton]}
            >
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {`${section.title} (${section.total})`}
              </Text>
              <Text style={styles.sectionToggle}>
                {historyExpanded ? "Hide" : "Show"}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.sectionHeader}>
              {section.key === "live" && <View style={styles.liveDot} />}
              <Text
                accessibilityRole="header"
                style={[
                  styles.sectionTitle,
                  section.key === "live" && styles.sectionTitleLive,
                  section.key === "needsYou" && styles.sectionTitleUrgent,
                ]}
              >
                {section.total > 1
                  ? `${section.title} (${section.total})`
                  : section.title}
              </Text>
            </View>
          )
        }
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.listControls}>
            {!!notice && (
              <InlineAlert
                tone="success"
                message={notice}
                announce={false}
                actionLabel="Dismiss"
                onAction={() => setNotice(null)}
              />
            )}
            <Text style={styles.controlLabel}>Season shown</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {seasonOptions.map((season) => (
                <Chip
                  key={season.id}
                  label={season.name}
                  accessibilityLabel={`Show matches for ${season.name}`}
                  selected={selectedSeasonId === season.id}
                  onPress={() => {
                    setSelectedSeasonId(season.id);
                    setHistoryOpen(null);
                  }}
                />
              ))}
            </ScrollView>

            <View style={styles.matchSearchRow}>
              <AppIcon
                name="magnifyingglass"
                size={ICON_SIZE.action}
                color={colors.textMuted}
              />
              <TextInput
                accessibilityLabel="Search matches by player name"
                value={playerSearch}
                onChangeText={setPlayerSearch}
                placeholder="Search by player name"
                placeholderTextColor={colors.placeholder}
                autoCorrect={false}
                returnKeyType="search"
                style={styles.matchSearchInput}
              />
              {!!playerSearch && (
                <IconButton
                  label="Clear player search"
                  icon="xmark.circle.fill"
                  onPress={() => setPlayerSearch("")}
                />
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {FILTERS.map((filter) => {
                const count = filter.id === "action" ? needsYouCount : 0;
                return (
                  <Chip
                    key={filter.id}
                    label={count ? `${filter.label} (${count})` : filter.label}
                    accessibilityLabel={`Show ${filter.label.toLowerCase()}${count ? `, ${count} need${count === 1 ? "s" : ""} you` : ""}`}
                    selected={activeFilter === filter.id}
                    onPress={() => {
                      setActiveFilter(filter.id);
                      setHistoryOpen(null);
                    }}
                  />
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          seasonMatches.length === 0 ? (
            <EmptyState
              icon="figure.tennis"
              title={`No matches in ${seasonName}`}
              message="Propose a match to an opponent, or record one you've already played."
              actionLabel="New match"
              onAction={() => setSheet("choices")}
            />
          ) : (
            <EmptyState
              icon="magnifyingglass"
              title="No matches here"
              message="Try another filter, player name, or season."
            />
          )
        }
        contentContainerStyle={styles.list}
      />

      <View
        style={[
          styles.fabGroup,
          { paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}
      >
        <Button
          label="New match"
          icon="plus"
          accessibilityHint="Start scoring, propose a match, or record a result"
          onPress={() => setSheet("choices")}
          style={styles.fab}
        />
      </View>

      <Modal
        visible={sheet === "choices"}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.newMatchOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close new match choices"
            style={StyleSheet.absoluteFill}
            onPress={() => setSheet(null)}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.newMatchSheet,
              { paddingBottom: Math.max(insets.bottom, spacing.xl) },
            ]}
          >
            <Text style={styles.newMatchTitle} accessibilityRole="header">
              New match
            </Text>
            {(
              [
                [
                  "calendar.badge.plus",
                  "Propose a match",
                  "Invite an opponent and pick a time. They accept or decline.",
                  "propose",
                ],
                [
                  "figure.tennis",
                  "Start live scoring",
                  "Score every point as you play.",
                  "live",
                ],
                [
                  "doc.text",
                  "Record a result",
                  "Enter the final score of a match you've played.",
                  "historic",
                ],
              ] as const
            ).map(([icon, title, description, action]) => (
              <Pressable
                key={action}
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityHint={description}
                android_ripple={{ color: "rgba(26, 71, 42, 0.12)" }}
                style={({ pressed }) => [
                  styles.newMatchChoice,
                  !IS_ANDROID && pressed && styles.cardBodyPressed,
                ]}
                onPress={() => setSheet(action)}
              >
                <IconLabel name={icon} textStyle={styles.newMatchChoiceTitle}>
                  {title}
                </IconLabel>
                <Text style={styles.newMatchChoiceDescription}>
                  {description}
                </Text>
              </Pressable>
            ))}
            <Button
              label="Cancel"
              variant="quiet"
              accessibilityLabel="Close new match choices"
              onPress={() => setSheet(null)}
            />
          </View>
        </View>
      </Modal>

      {sheet === "propose" && (
        <ProposeMatchSheet
          currentUser={user}
          divisionId={divisionId}
          onClose={() => setSheet(null)}
          onDone={finishSheet}
        />
      )}

      {(sheet === "live" || sheet === "historic") && (
        <LiveOrRecordSheet
          mode={sheet}
          currentUser={user}
          divisionId={divisionId}
          canRecordOnBehalf={canRecordOnBehalf}
          onClose={() => setSheet(null)}
          onDone={finishSheet}
          onStarted={(matchId) => {
            setSheet(null);
            router.push({ pathname: "/match/[id]", params: { id: matchId } });
          }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Start live / record a result
// ---------------------------------------------------------------------------

function LiveOrRecordSheet({
  mode,
  currentUser,
  divisionId,
  canRecordOnBehalf,
  onClose,
  onDone,
  onStarted,
}: {
  mode: "live" | "historic";
  currentUser: User;
  divisionId: string;
  canRecordOnBehalf: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onStarted: (matchId: string) => void;
}) {
  const historic = mode === "historic";
  const [recordingMode, setRecordingMode] = useState<"self" | "onBehalf">(
    "self",
  );
  const onBehalf = historic && recordingMode === "onBehalf";
  const [opponentMode, setOpponentMode] = useState<"player" | "guest">(
    "player",
  );
  const [guestName, setGuestName] = useState("");
  const [player1, setPlayer1] = useState<PublicProfile | null>(null);
  const [opponent, setOpponent] = useState<PublicProfile | null>(null);
  const [sets, setSets] = useState<SetDraft[]>([{ p1: "", p2: "" }]);
  const [attempted, setAttempted] = useState(false);
  const guestNameRef = useRef<TextInput>(null);
  const choice = useCompetitionChoice(
    divisionId,
    onBehalf ? player1?.id : currentUser.id,
  );

  const dirty = !!(
    player1 ||
    opponent ||
    guestName.trim() ||
    sets.some((s) => s.p1 || s.p2)
  );
  const requestClose = () => confirmDiscard(dirty, onClose);

  const isGuest = opponentMode === "guest";
  const opponentLabel = isGuest ? guestName.trim() : opponent?.displayName;

  const submit = useAsyncAction(
    async () => {
      const competition = {
        divisionId,
        seasonId: choice.seasonId,
        ...(choice.level ? { divisionLevelId: choice.level.id } : {}),
        ...(twoPlayerMatchType(choice.level)
          ? { matchType: twoPlayerMatchType(choice.level) }
          : {}),
      };
      const sidesFor = (): Parameters<typeof createMatch>[0] =>
        isGuest
          ? {
              player1Id: currentUser.id,
              player2Id: "guest",
              player1Name: currentUser.displayName,
              player2Name: guestName.trim(),
              player2IsGuest: true,
              createdBy: currentUser.id,
              ...competition,
            }
          : {
              player1Id: currentUser.id,
              player2Id: opponent!.id,
              player1Name: currentUser.displayName,
              player2Name: opponent!.displayName,
              createdBy: currentUser.id,
              ...competition,
            };

      if (!historic) {
        const matchId = await createMatch(sidesFor());
        onStarted(matchId);
        return;
      }
      const parsed = parseSets(sets);
      if (onBehalf) {
        await recordMatchOnBehalf({
          player1Id: player1!.id,
          player2Id: opponent!.id,
          sets: parsed,
          notifyPlayers: true,
          ...competition,
        });
        onDone(
          `Result saved for ${player1!.displayName} and ${opponent!.displayName}. Both players are notified where the app has their contact details.`,
        );
        return;
      }
      await recordHistoricMatch({ ...sidesFor(), sets: parsed });
      onDone(
        isGuest
          ? `Result saved. You can link ${guestName.trim()} to their account later from the match.`
          : `Result saved. ${opponent!.displayName} will be asked to confirm it before standings update.`,
      );
    },
    {
      errorMessage: historic
        ? "Couldn't save the result. Check your connection and try again."
        : "Couldn't start the match. Check your connection and try again.",
    },
  );

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (onBehalf && !player1) next.player1 = "Choose the first player.";
    if (isGuest && !guestName.trim())
      next.opponent = "Enter the guest opponent's name.";
    if (!isGuest && !opponent)
      next.opponent = onBehalf
        ? "Choose the second player."
        : "Choose your opponent.";
    if (choice.loading)
      next.level = "Division levels are still loading. Try again in a moment.";
    else if (choice.levelError) next.level = choice.levelError;
    if (historic) {
      const invalid = validateRecordedSets(parseSets(sets));
      if (invalid) next.scores = invalid;
    }
    return next;
  }

  async function handleSubmit() {
    const next = validate();
    setAttempted(true);
    if (Object.keys(next).length) {
      if (next.opponent && isGuest) guestNameRef.current?.focus();
      return;
    }
    await submit.run();
  }

  // Re-validate as the player fixes things, once they have tried to submit.
  const liveErrors: Record<string, string> = attempted ? validate() : {};
  const errorList = Object.values(liveErrors).filter(Boolean);

  return (
    <FormSheet
      title={historic ? "Record a result" : "Start live scoring"}
      onRequestClose={requestClose}
    >
      {historic && canRecordOnBehalf && (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Whose match?</Text>
          <View style={styles.chipWrap}>
            <Chip
              label="One of mine"
              accessibilityLabel="Record one of my matches"
              selected={recordingMode === "self"}
              onPress={() => {
                setRecordingMode("self");
                setPlayer1(null);
              }}
            />
            <Chip
              label="Two other players"
              accessibilityLabel="Record a match between two division players, as a leader"
              selected={recordingMode === "onBehalf"}
              onPress={() => {
                setRecordingMode("onBehalf");
                setOpponentMode("player");
                setGuestName("");
                setOpponent(null);
              }}
            />
          </View>
        </View>
      )}

      {onBehalf && (
        <View style={styles.fieldGroup}>
          <PlayerSlotPicker
            label="First player"
            divisionId={divisionId}
            excludeIds={opponent ? [opponent.id] : []}
            selected={player1}
            onSelect={setPlayer1}
            onClear={() => setPlayer1(null)}
          />
          {!!liveErrors.player1 && (
            <Text style={styles.errorText}>{liveErrors.player1}</Text>
          )}
        </View>
      )}

      {!onBehalf && (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Opponent</Text>
          <View style={styles.chipWrap}>
            <Chip
              label="Division player"
              accessibilityLabel="Play a division player"
              selected={opponentMode === "player"}
              onPress={() => {
                setOpponentMode("player");
                setGuestName("");
              }}
            />
            <Chip
              label="Guest"
              accessibilityLabel="Play a guest who isn't in the app"
              selected={opponentMode === "guest"}
              onPress={() => {
                setOpponentMode("guest");
                setOpponent(null);
              }}
            />
          </View>
        </View>
      )}

      <View style={styles.fieldGroup}>
        {isGuest ? (
          <FormField
            ref={guestNameRef}
            label="Guest's name"
            required
            helperText="Guest results don't count toward standings. You can link the guest to their account later."
            error={liveErrors.opponent}
            value={guestName}
            onChangeText={setGuestName}
            placeholder="First and last name"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
        ) : (
          <>
            <PlayerSlotPicker
              label={onBehalf ? "Second player" : "Your opponent"}
              divisionId={divisionId}
              excludeIds={
                onBehalf ? (player1 ? [player1.id] : []) : [currentUser.id]
              }
              selected={opponent}
              onSelect={setOpponent}
              onClear={() => setOpponent(null)}
            />
            {!!liveErrors.opponent && (
              <Text style={styles.errorText}>{liveErrors.opponent}</Text>
            )}
          </>
        )}
      </View>

      <CompetitionFields choice={choice} showError={attempted} />

      {historic && (
        <SetScoresField
          sets={sets}
          onChangeSets={setSets}
          firstLabel={onBehalf ? player1?.displayName || "First player" : "You"}
          secondLabel={
            onBehalf
              ? opponent?.displayName || "Second player"
              : opponentLabel || "Opponent"
          }
          error={liveErrors.scores}
        />
      )}

      <FormErrorSummary errors={attempted ? errorList : []} />
      {!!submit.error && (
        <InlineAlert
          tone="error"
          message={submit.error}
          style={styles.submitAlert}
        />
      )}

      <Text style={styles.helperText}>
        {historic
          ? onBehalf
            ? "Both players are told the result was recorded."
            : isGuest
              ? "Guest results are confirmed by you alone."
              : `${opponentLabel || "Your opponent"} will be asked to confirm the result before standings update.`
          : "The scoreboard opens next. Choose who serves first there."}
      </Text>

      <View style={styles.modalActions}>
        <Button
          label="Cancel"
          variant="secondary"
          accessibilityLabel={
            historic ? "Cancel recording" : "Cancel live match"
          }
          onPress={requestClose}
          style={styles.modalActionButton}
        />
        <Button
          label={historic ? "Save result" : "Start match"}
          pending={submit.pending}
          onPress={handleSubmit}
          style={styles.modalActionButton}
        />
      </View>
    </FormSheet>
  );
}

function parseSets(sets: SetDraft[]): RecordedSetInput[] {
  return sets.map((s) => ({
    p1: parseInt(s.p1, 10),
    p2: parseInt(s.p2, 10),
    ...(s.matchTiebreak ? { matchTiebreak: true } : {}),
  }));
}

function SetScoresField({
  sets,
  onChangeSets,
  firstLabel,
  secondLabel,
  error,
}: {
  sets: SetDraft[];
  onChangeSets: (sets: SetDraft[]) => void;
  firstLabel: string;
  secondLabel: string;
  error?: string;
}) {
  const update = (index: number, key: "p1" | "p2", value: string) => {
    const next = [...sets];
    next[index] = { ...next[index], [key]: value.replace(/[^0-9]/g, "") };
    onChangeSets(next);
  };
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>Set scores</Text>
      <Text style={styles.helperText}>
        {`Games for ${firstLabel} first, then ${secondLabel}.`}
      </Text>
      {sets.map((s, i) => {
        const unit = s.matchTiebreak ? "tiebreak points" : "games";
        const setName = s.matchTiebreak ? "Match tiebreak" : `Set ${i + 1}`;
        const isLast = i === sets.length - 1;
        return (
          <React.Fragment key={i}>
            <View style={styles.setRow}>
              <Text style={styles.setLabel}>
                {s.matchTiebreak ? "TB" : `Set ${i + 1}`}
              </Text>
              <TextInput
                accessibilityLabel={`${setName}, ${firstLabel} ${unit}`}
                style={[styles.setInput, !!error && styles.setInputError]}
                value={s.p1}
                onChangeText={(v) => update(i, "p1", v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.setDash} importantForAccessibility="no">
                –
              </Text>
              <TextInput
                accessibilityLabel={`${setName}, ${secondLabel} ${unit}`}
                style={[styles.setInput, !!error && styles.setInputError]}
                value={s.p2}
                onChangeText={(v) => update(i, "p2", v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
              />
              {isLast && sets.length > 1 && (
                <IconButton
                  label={`Remove ${setName.toLowerCase()}`}
                  icon="trash"
                  onPress={() =>
                    onChangeSets(withEligibleTiebreaks(sets.slice(0, -1)))
                  }
                />
              )}
            </View>
            <MatchTiebreakToggle
              sets={sets}
              index={i}
              onChangeSets={onChangeSets}
            />
          </React.Fragment>
        );
      })}
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {sets.length < 5 && (
        <Button
          label="Add set"
          icon="plus"
          variant="quiet"
          accessibilityLabel={`Add set ${sets.length + 1}`}
          onPress={() =>
            onChangeSets(withEligibleTiebreaks([...sets, { p1: "", p2: "" }]))
          }
          style={styles.addSet}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Propose a match
// ---------------------------------------------------------------------------

function ProposeMatchSheet({
  currentUser,
  divisionId,
  onClose,
  onDone,
}: {
  currentUser: User;
  divisionId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [formatChoice, setFormatChoice] = useState<
    "singles" | "doubles" | null
  >(null);
  const [opponent, setOpponent] = useState<PublicProfile | null>(null);
  // Doubles slots: the signed-in player always fills side 1's first seat.
  const [partner, setPartner] = useState<PublicProfile | null>(null);
  const [opponent1, setOpponent1] = useState<PublicProfile | null>(null);
  const [opponent2, setOpponent2] = useState<PublicProfile | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [attempted, setAttempted] = useState(false);
  const dateRef = useRef<DateTimeFieldHandle>(null);
  const timeRef = useRef<DateTimeFieldHandle>(null);
  const days = useMemo(() => upcomingDays(), []);
  // The typed date and time read back in words, so a wrong day is visible.
  const proposedTs =
    DATE_RE.test(date.trim()) && TIME_RE.test(time.trim())
      ? Date.parse(`${date.trim()}T${time.trim()}`)
      : Number.NaN;
  const choice = useCompetitionChoice(divisionId, currentUser.id);
  // Follows the division level's match type until the player picks one.
  const isDoubles =
    (formatChoice ?? choice.level?.matchType ?? "singles") === "doubles";

  const doublesChosenIds = [
    currentUser.id,
    partner?.id,
    opponent1?.id,
    opponent2?.id,
  ].filter((id): id is string => !!id);
  const opponentReady = isDoubles
    ? !!(partner && opponent1 && opponent2)
    : !!opponent;
  const dirty = !!(
    opponent ||
    partner ||
    opponent1 ||
    opponent2 ||
    date.trim() ||
    time.trim()
  );
  const requestClose = () => confirmDiscard(dirty, onClose);
  const opponentsLabel = isDoubles
    ? opponent1 && opponent2
      ? `${opponent1.displayName} and ${opponent2.displayName}`
      : "Your opponents"
    : opponent?.displayName || "Your opponent";

  function validate() {
    const next: Record<string, string> = {};
    if (!opponentReady)
      next.opponent = isDoubles
        ? "Choose your partner and both opponents."
        : "Choose your opponent.";
    if (!DATE_RE.test(date.trim()))
      next.date = "Choose a date.";
    if (!TIME_RE.test(time.trim()))
      next.time = "Choose a time.";
    const ts = Date.parse(`${date.trim()}T${time.trim()}`);
    if (!next.date && !next.time && Number.isNaN(ts))
      next.date = "Choose a date.";
    else if (!next.date && !next.time && ts < Date.now())
      next.date = "Choose a date and time in the future.";
    if (choice.loading)
      next.level = "Division levels are still loading. Try again in a moment.";
    else if (choice.levelError) next.level = choice.levelError;
    return { errors: next, ts };
  }

  const submit = useAsyncAction(
    async (ts: number) => {
      const level = choice.level;
      if (isDoubles) {
        await proposeDoublesMatch({
          side1PlayerIds: [currentUser.id, partner!.id],
          side2PlayerIds: [opponent1!.id, opponent2!.id],
          divisionId,
          seasonId: choice.seasonId,
          ...(level ? { divisionLevelId: level.id } : {}),
          scheduledAt: ts,
        });
      } else {
        const matchType = twoPlayerMatchType(level);
        await proposeMatch({
          player1Id: currentUser.id,
          player2Id: opponent!.id,
          player1Name: currentUser.displayName,
          player2Name: opponent!.displayName,
          divisionId,
          seasonId: choice.seasonId,
          ...(level ? { divisionLevelId: level.id } : {}),
          ...(matchType ? { matchType } : {}),
          createdBy: currentUser.id,
          scheduledAt: ts,
        });
      }
      onDone(
        `Proposal sent. ${opponentsLabel} will be asked to accept or decline. Until then it's under Waiting on others.`,
      );
    },
    {
      errorMessage:
        "Couldn't send the proposal. Check your connection and try again.",
    },
  );

  async function handleSubmit() {
    const { errors, ts } = validate();
    setAttempted(true);
    if (Object.keys(errors).length) {
      if (errors.date) dateRef.current?.focus();
      else if (errors.time) timeRef.current?.focus();
      return;
    }
    await submit.run(ts);
  }

  const errors = attempted ? validate().errors : {};
  const errorList = Object.values(errors).filter(Boolean);

  return (
    <FormSheet title="Propose a match" onRequestClose={requestClose}>
      <CompetitionFields choice={choice} showError={attempted} />

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Format</Text>
        <View style={styles.chipWrap}>
          {(["singles", "doubles"] as const).map((format) => (
            <Chip
              key={format}
              label={format === "doubles" ? "Doubles" : "Singles"}
              accessibilityLabel={`Propose a ${format} match`}
              selected={isDoubles === (format === "doubles")}
              onPress={() => setFormatChoice(format)}
            />
          ))}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        {isDoubles ? (
          <>
            <PlayerSlotPicker
              label="Your partner"
              divisionId={divisionId}
              excludeIds={doublesChosenIds}
              selected={partner}
              onSelect={setPartner}
              onClear={() => setPartner(null)}
            />
            <PlayerSlotPicker
              label="Opponent 1"
              divisionId={divisionId}
              excludeIds={doublesChosenIds}
              selected={opponent1}
              onSelect={setOpponent1}
              onClear={() => setOpponent1(null)}
            />
            <PlayerSlotPicker
              label="Opponent 2"
              divisionId={divisionId}
              excludeIds={doublesChosenIds}
              selected={opponent2}
              onSelect={setOpponent2}
              onClear={() => setOpponent2(null)}
            />
          </>
        ) : (
          <PlayerSlotPicker
            label="Your opponent"
            divisionId={divisionId}
            excludeIds={[currentUser.id]}
            selected={opponent}
            onSelect={setOpponent}
            onClear={() => setOpponent(null)}
          />
        )}
        {!!errors.opponent && (
          <Text style={styles.errorText}>{errors.opponent}</Text>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Day</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {days.map((day) => (
            <Chip
              key={day.value}
              label={day.label}
              accessibilityLabel={`Play on ${day.spoken}`}
              selected={date.trim() === day.value}
              onPress={() => {
                setDate(day.value);
                if (!time.trim()) timeRef.current?.focus();
              }}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.dateTimeRow}>
        <DateTimeField
          ref={dateRef}
          mode="date"
          label="Date"
          required
          helperText="Pick a day above, or choose any date"
          error={errors.date}
          containerStyle={styles.dateField}
          value={date}
          onChange={setDate}
          minimumDate={new Date()}
        />
        <DateTimeField
          ref={timeRef}
          mode="time"
          label="Time"
          required
          error={errors.time}
          containerStyle={styles.timeField}
          value={time}
          onChange={setTime}
          defaultValue="18:00"
        />
      </View>
      {Number.isFinite(proposedTs) && (
        <Text style={styles.whenSummary} accessibilityLiveRegion="polite">
          {`Proposing ${formatScheduledAt(proposedTs)}.`}
        </Text>
      )}

      <FormErrorSummary errors={errorList} />
      {!!submit.error && (
        <InlineAlert
          tone="error"
          message={submit.error}
          style={styles.submitAlert}
        />
      )}

      <Text style={styles.helperText}>
        {`${opponentsLabel} will be asked to accept or decline. The match is scheduled once they accept.`}
      </Text>

      <View style={styles.modalActions}>
        <Button
          label="Cancel"
          variant="secondary"
          accessibilityLabel="Cancel proposal"
          onPress={requestClose}
          style={styles.modalActionButton}
        />
        <Button
          label="Send proposal"
          pending={submit.pending}
          onPress={handleSubmit}
          style={styles.modalActionButton}
        />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  list: { padding: spacing.lg, paddingBottom: spacing.lg, flexGrow: 1 },
  listControls: { marginBottom: spacing.md, gap: spacing.md },
  controlLabel: { ...typography.label, color: colors.textMuted },
  chipRow: { flexDirection: "row", gap: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  matchSearchRow: {
    minHeight: MIN_TOUCH_TARGET,
    paddingLeft: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  matchSearchInput: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    color: colors.text,
    ...typography.bodySmall,
  },
  wrapRow: { flexWrap: "wrap", alignItems: "flex-start" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.canvas,
  },
  sectionHeaderButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "space-between",
  },
  sectionTitle: { ...typography.label, color: colors.textMuted },
  sectionTitleUrgent: { color: colors.primary },
  sectionTitleLive: { color: colors.liveText },
  sectionToggle: { ...typography.label, color: colors.primary },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.live,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    marginBottom: spacing.md,
    overflow: "hidden",
    ...elevations.low,
  },
  cardLive: { borderLeftWidth: 4, borderLeftColor: colors.live },
  cardBody: { padding: spacing.lg },
  cardBodyPressed: { backgroundColor: colors.surfaceMuted },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  winnerBadge: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  contextLine: {
    ...typography.bodySmall,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  scheduledLine: {
    ...typography.label,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  setScore: {
    ...typography.heading,
    color: colors.text,
    letterSpacing: 1,
  },
  gameScore: { ...typography.label, color: colors.liveText },
  players: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playersCompact: { flexWrap: "wrap", gap: spacing.sm },
  playerName: { ...typography.label, fontSize: 15, color: colors.text },
  playerNameRight: { textAlign: "right", flexShrink: 1 },
  playerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
    justifyContent: "flex-end",
  },
  winner: { color: colors.primary, fontWeight: "700" },
  vs: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },
  guestBadge: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.warningText,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  serverLine: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  cardActionsCompact: { flexDirection: "column" },
  cardActionButton: { flex: 1 },
  cardAlert: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },

  fabGroup: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    justifyContent: "flex-end",
    backgroundColor: colors.canvas,
  },
  fab: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    ...elevations.medium,
  },
  newMatchOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  newMatchSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  newMatchTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  newMatchChoice: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    justifyContent: "center",
    gap: spacing.xs,
    overflow: "hidden",
  },
  newMatchChoiceTitle: { ...typography.subheading, color: colors.primary },
  newMatchChoiceDescription: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    gap: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modalTitle: { ...typography.heading, color: colors.primary, flex: 1 },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.text },
  fieldLabelSpaced: { marginTop: spacing.sm },
  helperText: { ...typography.bodySmall, color: colors.textMuted },
  whenSummary: { ...typography.label, color: colors.primary },
  errorText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.destructive,
  },
  submitAlert: { marginTop: -spacing.sm },
  dateTimeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  dateField: { flexGrow: 3, flexBasis: 160 },
  timeField: { flexGrow: 2, flexBasis: 120 },
  setRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  setLabel: { ...typography.label, color: colors.textMuted, width: 44 },
  setInput: {
    minHeight: 48,
    width: 64,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    ...typography.subheading,
    textAlign: "center",
    color: colors.text,
    backgroundColor: colors.surface,
  },
  setInputError: { borderColor: colors.destructive },
  setDash: { ...typography.subheading, color: colors.textMuted },
  addSet: { alignSelf: "flex-start" },
  modalActions: { flexDirection: "row", gap: spacing.md },
  modalActionButton: { flex: 1 },
});
