import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useRankings,
  useDoublesRankings,
  recalculateDivisionRankings,
  useDivisionLevels,
  useDivisionMemberships,
  usePlayerMatches,
} from "@tennis/firebase-client";
import {
  canRespondToReport,
  currentSeasonForDate,
  defaultSeasonOptions,
  isPrivilegedRole,
  sideOfPlayer,
  type DivisionMatchType,
  type DivisionMembershipStatus,
} from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  Screen,
  SectionHeader,
  elevations,
  radii,
  spacing,
  typography,
  useAsyncAction,
  useColors,
  makeStyles,
  useContentWidth,
} from "../../theme";

/** A player's own level counts while they are waitlisted too. */
const ROSTERED: readonly DivisionMembershipStatus[] = ["active", "waitlisted"];

/** One standings row, normalized so singles and doubles render identically. */
type StandingsRow = {
  key: string;
  playerIds: string[];
  displayName: string;
  matchesWon: number;
  matchesLost: number;
  setsWon: number;
  setsLost: number;
  gameDifferential: number;
};

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Column widths that grow with the system font size, so the header and every
 * row stay aligned while "10–12" or a two-digit rank still fits. Past 2x the
 * numbers shrink to fit instead (`adjustsFontSizeToFit` on each cell).
 */
function useColumnWidths() {
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(fontScale, 1), 2);
  return useMemo(
    () => ({
      marker: Math.round(28 * scale),
      rank: Math.round(28 * scale) + spacing.md,
      record: Math.round(58 * scale),
      diff: Math.round(48 * scale),
    }),
    [scale],
  );
}

/** Props for a numeric cell: one line, shrinking rather than wrapping. */
const FIT_ONE_LINE = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.6,
} as const;

function RankingRow({
  item,
  index,
  isCurrentUser,
}: {
  item: StandingsRow;
  index: number;
  isCurrentUser: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [showDetails, setShowDetails] = useState(false);
  const widths = useColumnWidths();
  const differential = `${item.gameDifferential > 0 ? "+" : ""}${item.gameDifferential}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isCurrentUser ? "You, " : ""}${item.displayName}, rank ${index + 1}, ${item.matchesWon} wins and ${item.matchesLost} losses, game differential ${differential}`}
      accessibilityHint={showDetails ? "Hides set record" : "Shows set record"}
      accessibilityState={{ expanded: showDetails }}
      android_ripple={{ color: colors.primarySoft }}
      onPress={() => setShowDetails((visible) => !visible)}
      style={[styles.row, isCurrentUser && styles.rowCurrentUser]}
    >
      <View style={styles.primaryRow}>
        <View
          style={[
            styles.rankMarker,
            { minWidth: widths.marker, minHeight: widths.marker },
            index < 3 && styles.rankMarkerTop,
          ]}
        >
          <Text
            style={[styles.rank, index < 3 && styles.rankTop]}
            {...FIT_ONE_LINE}
          >
            {index + 1}
          </Text>
        </View>
        <View style={styles.playerCell}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={2}>
              {item.displayName}
            </Text>
            {isCurrentUser && <Text style={styles.youLabel}>You</Text>}
          </View>
        </View>
        <Text
          style={[styles.recordCell, { width: widths.record }]}
          {...FIT_ONE_LINE}
        >
          {item.matchesWon}–{item.matchesLost}
        </Text>
        <Text
          style={[
            styles.diffCell,
            { width: widths.diff },
            item.gameDifferential > 0 && styles.positiveDiff,
          ]}
          {...FIT_ONE_LINE}
        >
          {differential}
        </Text>
      </View>
      {showDetails && (
        <View
          style={[styles.detailRow, { paddingLeft: spacing.md + widths.rank }]}
        >
          <Text style={styles.detailLabel}>Set record</Text>
          <Text style={styles.detailValue}>
            {item.setsWon}–{item.setsLost}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * The standings table for one season and format. Keyed by the parent so
 * "Try again" remounts it, which resubscribes the rankings hooks.
 */
function StandingsContent({
  divisionId,
  seasonId,
  seasonName,
  divisionLevelId,
  levelName,
  matchType,
  filters,
  lead,
  onRetry,
}: {
  divisionId: string;
  seasonId: string;
  seasonName: string;
  /** Undefined for "All levels". */
  divisionLevelId: string | undefined;
  levelName: string | null;
  matchType: DivisionMatchType;
  filters: React.ReactNode;
  /** Shown above everything else (the "Needs you" card). */
  lead: React.ReactNode;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const user = useAppStore((state) => state.user);
  const router = useRouter();
  const widths = useColumnWidths();
  // The standings table uses the wide measure on a tablet.
  const contentWidth = useContentWidth("wide");
  const isDoubles = matchType === "doubles";
  const rankingFilters = { seasonId, divisionLevelId };
  const singles = useRankings(isDoubles ? null : divisionId, rankingFilters);
  const doubles = useDoublesRankings(isDoubles ? divisionId : null, rankingFilters);
  const loading = isDoubles ? doubles.loading : singles.loading;
  const loadError = isDoubles ? doubles.error : singles.error;
  const rankings: StandingsRow[] = isDoubles
    ? doubles.rankings.map((r) => ({ ...r, key: r.teamId }))
    : singles.rankings.map((r) => ({
        ...r,
        key: r.userId,
        playerIds: [r.userId],
      }));
  const [showTiebreakers, setShowTiebreakers] = useState(false);

  // The callable decides for real (leader of this division, or admin).
  const canRecalculate = isPrivilegedRole(user?.role);
  const recalculate = useAsyncAction(
    () => recalculateDivisionRankings(divisionId),
    {
      successMessage: "Rankings recalculated",
      errorMessage: "Couldn't recalculate rankings. Check your connection and try again.",
    },
  );
  const [recalcDone, setRecalcDone] = useState(false);
  const runRecalculate = async () => {
    setRecalcDone(false);
    const result = await recalculate.run();
    if (result !== undefined) setRecalcDone(true);
  };

  const myIndex = user?.id
    ? rankings.findIndex((r) => r.playerIds.includes(user.id))
    : -1;
  const me = myIndex >= 0 ? rankings[myIndex] : null;
  const formatLabel = isDoubles ? "doubles" : "singles";
  const scopeLabel = levelName ?? `${seasonName} ${formatLabel}`;
  const goToMatches = () => router.push("/(tabs)/matches");

  const recalcControls = canRecalculate ? (
    <View style={styles.recalcBlock}>
      <Button
        label="Recalculate rankings"
        icon="arrow.clockwise"
        variant="secondary"
        size="compact"
        pending={recalculate.pending}
        pendingLabel="Recalculating rankings"
        style={styles.recalcBtn}
        onPress={() => void runRecalculate()}
      />
      {recalculate.error ? (
        <InlineAlert
          tone="error"
          message={recalculate.error}
          actionLabel="Try again"
          onAction={() => void runRecalculate()}
        />
      ) : recalcDone ? (
        <InlineAlert
          tone="success"
          message="Rankings recalculated from confirmed results."
        />
      ) : null}
    </View>
  ) : null;

  if (loading) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.stateScroll}
      >
        <View style={[styles.filtersOnly, contentWidth]}>
          {lead}
          {filters}
        </View>
        <LoadingState label={`Loading ${formatLabel} standings`} />
      </ScrollView>
    );
  }

  if (loadError) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.stateScroll}
      >
        <View style={[styles.filtersOnly, contentWidth]}>
          {lead}
          {filters}
        </View>
        <ErrorState title="Couldn't load standings" onRetry={onRetry} />
      </ScrollView>
    );
  }

  if (rankings.length === 0) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.stateScroll}
      >
        <View style={[styles.filtersOnly, contentWidth]}>
          {lead}
          {filters}
        </View>
        <EmptyState
          icon="trophy"
          title={
            levelName
              ? `No ${levelName} standings for ${seasonName} yet`
              : `No ${formatLabel} standings for ${seasonName} yet`
          }
          message={
            isDoubles
              ? "Team standings appear once a doubles result is reported and confirmed by the other team."
              : "Standings appear once a result is reported and confirmed by the opponent. Propose a match to get started."
          }
          action={
            <View style={styles.emptyActions}>
              <Button label="Go to Matches" onPress={goToMatches} />
              {recalcControls}
            </View>
          }
        />
      </ScrollView>
    );
  }

  const myStanding = (
    <Card style={styles.myCard}>
      {me ? (
        <>
          <Text style={styles.myHeadline} accessibilityRole="header">
            {isDoubles ? "Your team is" : "You're"} {ordinal(myIndex + 1)} of{" "}
            {rankings.length}
          </Text>
          <Text style={styles.myDetail}>
            {me.matchesWon}–{me.matchesLost} in {scopeLabel}
            {levelName ? `, ${seasonName}` : ""}
            {isDoubles ? ` as ${me.displayName}` : ""}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.myHeadline} accessibilityRole="header">
            You're not in these standings yet
          </Text>
          <Text style={styles.myDetail}>
            {levelName
              ? `These are the ${levelName} standings. Play a match in this level and have the result confirmed to appear here.`
              : `Play a ${formatLabel} match this season and have the result confirmed to appear here.`}
          </Text>
        </>
      )}
      <Button
        label="Find your next match"
        size="compact"
        // The "Needs you" card above holds the screen's primary action.
        variant={lead ? "secondary" : "primary"}
        style={styles.myAction}
        onPress={goToMatches}
      />
    </Card>
  );

  return (
    <FlatList
      data={rankings}
      keyExtractor={(item) => item.key}
      renderItem={({ item, index }) => (
        <RankingRow
          item={item}
          index={index}
          isCurrentUser={Boolean(user?.id && item.playerIds.includes(user.id))}
        />
      )}
      ListHeaderComponent={
        <View style={styles.tableHeader}>
          {lead}
          {myStanding}
          {filters}
          <SectionHeader
            style={styles.sectionHeader}
            title={isDoubles ? "Doubles team standings" : "Singles standings"}
            subtitle={`${seasonName} · ${levelName ?? "All levels"}`}
          />
          <Button
            label="How standings work"
            variant="quiet"
            size="compact"
            accessibilityState={{ expanded: showTiebreakers }}
            style={styles.infoButton}
            onPress={() => setShowTiebreakers((visible) => !visible)}
          />
          {showTiebreakers && (
            <Text style={styles.tiebreakerText}>
              Ranked by matches won. Ties are decided by sets won, games won, game
              differential, then head-to-head results. Only confirmed results count.
            </Text>
          )}
          {recalcControls}
          <View
            style={styles.columnHeader}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.rankHeader, { width: widths.rank }]}>#</Text>
            <Text style={styles.playerHeader}>{isDoubles ? "Team" : "Player"}</Text>
            <Text
              style={[styles.recordHeader, { width: widths.record }]}
              {...FIT_ONE_LINE}
            >
              W–L
            </Text>
            <Text
              style={[styles.diffHeader, { width: widths.diff }]}
              {...FIT_ONE_LINE}
            >
              Diff
            </Text>
          </View>
        </View>
      }
      contentContainerStyle={[styles.list, contentWidth]}
    />
  );
}

/**
 * What is waiting on this player, by the same rules as the web dashboard's
 * "For you" list: a live match, a finished match whose score nobody has
 * submitted yet, a result the other side reported, and a
 * proposal they received. Empty when nothing is waiting.
 */
function useNeedsYouItems(
  userId: string | undefined,
  divisionId: string | null,
): string[] {
  const { matches } = usePlayerMatches(userId ?? null);
  let live = 0;
  let toConfirm = 0;
  let toSubmit = 0;
  let proposals = 0;
  if (userId) {
    for (const m of matches) {
      // Only this division's matches, which is what the Matches tab lists.
      if (m.divisionId !== divisionId) continue;
      const side = sideOfPlayer(m, userId);
      if (!side) continue;
      if (m.status === "in_progress") live += 1;
      // Live scoring finished, but nobody has submitted the result yet.
      else if (m.status === "pending_report" && !m.reportSubmission) toSubmit += 1;
      else if (
        m.status === "pending_report" &&
        canRespondToReport(m, userId, m.reportSubmission?.submittedBy)
      )
        toConfirm += 1;
      else if (m.status === "proposed" && side === "player2") proposals += 1;
    }
  }
  return [
    live > 0
      ? `${live} live ${live === 1 ? "match" : "matches"} to keep scoring`
      : null,
    toSubmit > 0
      ? `${toSubmit} ${toSubmit === 1 ? "score" : "scores"} to submit`
      : null,
    toConfirm > 0
      ? `${toConfirm} ${toConfirm === 1 ? "result" : "results"} to confirm or dispute`
      : null,
    proposals > 0
      ? `${proposals} ${proposals === 1 ? "proposal" : "proposals"} to accept or decline`
      : null,
  ].filter((item): item is string => !!item);
}

function NeedsYouCard({ items }: { items: string[] }) {
  const styles = useStyles();
  const router = useRouter();
  return (
    <Card style={styles.needsCard}>
      <Text style={styles.needsTitle} accessibilityRole="header">
        Needs you
      </Text>
      {items.map((item) => (
        <Text key={item} style={styles.needsItem}>
          {item}
        </Text>
      ))}
      <Button
        label="Open Matches"
        accessibilityHint="Opens the Matches tab, where you can respond"
        size="compact"
        style={styles.myAction}
        onPress={() => router.push("/(tabs)/matches")}
      />
    </Card>
  );
}

export default function RankingsScreen() {
  const styles = useStyles();
  const divisionId = useAppStore((state) => state.divisionId);
  const userId = useAppStore((state) => state.user?.id);
  const needsItems = useNeedsYouItems(userId, divisionId);
  const router = useRouter();
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  // Matches web's dashboard: standings are scoped to one season at a time, since
  // matches from every season otherwise pool into a single all-time ranking.
  const [selectedSeasonId, setSelectedSeasonId] = useState(
    () => currentSeasonForDate().id,
  );
  // null follows the format of the player's own level until they pick one.
  const [matchTypeChoice, setMatchTypeFilter] =
    useState<DivisionMatchType | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // null follows the player's own level; "all" pools every level.
  const [levelChoice, setLevelChoice] = useState<string | null>(null);
  const seasonName =
    seasonOptions.find((s) => s.id === selectedSeasonId)?.name ?? "";
  const { levels } = useDivisionLevels(divisionId);
  const { memberships } = useDivisionMemberships(
    divisionId,
    selectedSeasonId,
    null,
    ROSTERED,
  );
  const myLevelFormat = levels.find(
    (level) =>
      level.seasonId === selectedSeasonId &&
      memberships.some(
        (m) => m.userId === userId && m.divisionLevelId === level.id,
      ),
  )?.matchType;
  const matchTypeFilter: DivisionMatchType =
    matchTypeChoice ?? myLevelFormat ?? "singles";
  // Standings are ranked per division level, so only levels of this season
  // and format can be picked.
  const seasonLevels = levels.filter(
    (level) =>
      level.seasonId === selectedSeasonId && level.matchType === matchTypeFilter,
  );
  const myLevelId = memberships.find(
    (m) =>
      m.userId === userId &&
      seasonLevels.some((level) => level.id === m.divisionLevelId),
  )?.divisionLevelId;
  const activeLevelId =
    levelChoice === "all"
      ? undefined
      : levelChoice && seasonLevels.some((level) => level.id === levelChoice)
        ? levelChoice
        : myLevelId;
  const activeLevelName =
    seasonLevels.find((level) => level.id === activeLevelId)?.name ?? null;

  const filters = (
    <View style={styles.filters}>
      <Text style={styles.filterLabel}>Format</Text>
      <View style={styles.chipRow}>
        {(["singles", "doubles"] as DivisionMatchType[]).map((option) => (
          <Chip
            key={option}
            accessibilityLabel={`Show ${option} standings`}
            label={option === "singles" ? "Singles" : "Doubles"}
            selected={matchTypeFilter === option}
            onPress={() => {
              setMatchTypeFilter(option);
              setLevelChoice(null);
            }}
          />
        ))}
      </View>
      <Text style={styles.filterLabel}>Season</Text>
      <View style={styles.chipRow}>
        {seasonOptions.map((season) => (
          <Chip
            key={season.id}
            accessibilityLabel={`Show standings for ${season.name}`}
            label={season.name}
            selected={selectedSeasonId === season.id}
            onPress={() => {
              setSelectedSeasonId(season.id);
              setLevelChoice(null);
            }}
          />
        ))}
      </View>
      {seasonLevels.length > 1 ? (
        <>
          <Text style={styles.filterLabel}>Division level</Text>
          <View style={styles.chipRow}>
            <Chip
              accessibilityLabel="Show all division levels together"
              label="All levels"
              selected={activeLevelId === undefined}
              onPress={() => setLevelChoice("all")}
            />
            {seasonLevels.map((level) => (
              <Chip
                key={level.id}
                accessibilityLabel={`Show ${level.name} standings${level.id === myLevelId ? ", your level" : ""}`}
                label={level.id === myLevelId ? `${level.name} (yours)` : level.name}
                selected={activeLevelId === level.id}
                onPress={() => setLevelChoice(level.id)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );

  if (!divisionId) {
    return (
      <Screen>
        <EmptyState
          icon="person.crop.rectangle.stack"
          title="Join a division to see standings"
          message="Standings belong to a division. Join one with an invite or a join code."
          actionLabel="Choose a division"
          onAction={() => router.push("/(onboarding)/division")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <StandingsContent
        key={`${matchTypeFilter}-${selectedSeasonId}-${activeLevelId ?? "all"}-${retryKey}`}
        divisionId={divisionId}
        seasonId={selectedSeasonId}
        seasonName={seasonName}
        divisionLevelId={activeLevelId}
        levelName={activeLevelName}
        matchType={matchTypeFilter}
        filters={filters}
        lead={needsItems.length > 0 ? <NeedsYouCard items={needsItems} /> : null}
        onRetry={() => setRetryKey((k) => k + 1)}
      />
    </Screen>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    // The filters, the Needs-you card, and a full empty state outgrow a small
    // phone at large text sizes, so these states scroll like the table does.
    stateScroll: { flexGrow: 1 },
    filtersOnly: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    filters: { marginBottom: spacing.md },
    filterLabel: {
      ...typography.caption,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
      textTransform: "uppercase",
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    list: { padding: spacing.lg },
    tableHeader: { marginBottom: spacing.md, gap: spacing.xs },
    sectionHeader: { marginTop: spacing.sm },
    needsCard: { gap: spacing.xs, marginBottom: spacing.sm },
    needsTitle: { ...typography.heading, color: colors.primary },
    needsItem: { ...typography.body, color: colors.text },
    myCard: { gap: spacing.xs, marginBottom: spacing.xs, ...elevations.low },
    myHeadline: { ...typography.heading, color: colors.primary },
    myDetail: { ...typography.bodySmall, color: colors.textMuted },
    myAction: { alignSelf: "flex-start", marginTop: spacing.sm },
    columnHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    rankHeader: { ...typography.caption, color: colors.textMuted },
    playerHeader: {
      flex: 1,
      ...typography.caption,
      color: colors.textMuted,
      textTransform: "uppercase",
    },
    recordHeader: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: "center",
    },
    diffHeader: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: "right",
    },
    row: {
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      overflow: "hidden",
    },
    // The tint plus the "You" label mark the row; no colored side stripe.
    rowCurrentUser: { backgroundColor: colors.primarySoft },
    primaryRow: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    // Sized by useColumnWidths(); minWidth/minHeight, never a fixed box.
    rankMarker: {
      paddingHorizontal: spacing.xxs,
      borderRadius: radii.pill,
      marginRight: spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    rankMarkerTop: { backgroundColor: colors.primary },
    rank: { ...typography.label, color: colors.textMuted },
    rankTop: { color: colors.onPrimary },
    playerCell: { flex: 1, minWidth: 0 },
    nameLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    name: { ...typography.subheading, color: colors.text, flexShrink: 1 },
    youLabel: {
      ...typography.caption,
      fontWeight: "700",
      color: colors.primary,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.xs,
      borderRadius: radii.sm,
      overflow: "hidden",
    },
    recordCell: {
      ...typography.label,
      color: colors.text,
      textAlign: "center",
    },
    diffCell: {
      ...typography.label,
      color: colors.textMuted,
      textAlign: "right",
    },
    positiveDiff: { color: colors.successText },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingRight: spacing.md,
      paddingBottom: spacing.sm,
    },
    detailLabel: { ...typography.caption, color: colors.textMuted },
    detailValue: { ...typography.caption, color: colors.text, fontWeight: "700" },
    infoButton: { alignSelf: "flex-start" },
    tiebreakerText: {
      ...typography.bodySmall,
      color: colors.textMuted,
      backgroundColor: colors.surfaceMuted,
      padding: spacing.md,
      borderRadius: radii.sm,
    },
    recalcBlock: { gap: spacing.sm, alignSelf: "stretch" },
    recalcBtn: { alignSelf: "flex-start" },
    emptyActions: { gap: spacing.md, alignItems: "stretch", alignSelf: "stretch" },
  }),
);
