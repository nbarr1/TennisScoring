import React, { useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  useRankings,
  useDoublesRankings,
  recalculateDivisionRankings,
} from "@tennis/firebase-client";
import {
  currentSeasonForDate,
  defaultSeasonOptions,
  isPrivilegedRole,
  type DivisionMatchType,
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
  colors,
  elevations,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";

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

function RankingRow({
  item,
  index,
  isCurrentUser,
}: {
  item: StandingsRow;
  index: number;
  isCurrentUser: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
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
        <View style={[styles.rankMarker, index < 3 && styles.rankMarkerTop]}>
          <Text style={[styles.rank, index < 3 && styles.rankTop]}>
            {index + 1}
          </Text>
        </View>
        <View style={styles.playerCell}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {item.displayName}
            </Text>
            {isCurrentUser && <Text style={styles.youLabel}>You</Text>}
          </View>
        </View>
        <Text style={styles.recordCell}>
          {item.matchesWon}–{item.matchesLost}
        </Text>
        <Text
          style={[
            styles.diffCell,
            item.gameDifferential > 0 && styles.positiveDiff,
          ]}
        >
          {differential}
        </Text>
      </View>
      {showDetails && (
        <View style={styles.detailRow}>
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
  matchType,
  filters,
  onRetry,
}: {
  divisionId: string;
  seasonId: string;
  seasonName: string;
  matchType: DivisionMatchType;
  filters: React.ReactNode;
  onRetry: () => void;
}) {
  const { user } = useAppStore();
  const router = useRouter();
  const isDoubles = matchType === "doubles";
  const singles = useRankings(isDoubles ? null : divisionId, { seasonId });
  const doubles = useDoublesRankings(isDoubles ? divisionId : null, { seasonId });
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
      <View style={styles.flex}>
        <View style={styles.filtersOnly}>{filters}</View>
        <LoadingState label={`Loading ${formatLabel} standings`} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.flex}>
        <View style={styles.filtersOnly}>{filters}</View>
        <ErrorState title="Couldn't load standings" onRetry={onRetry} />
      </View>
    );
  }

  if (rankings.length === 0) {
    return (
      <View style={styles.flex}>
        <View style={styles.filtersOnly}>{filters}</View>
        <EmptyState
          icon="trophy"
          title={`No ${formatLabel} standings for ${seasonName} yet`}
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
      </View>
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
            {me.matchesWon}–{me.matchesLost} in {seasonName} {formatLabel}
            {isDoubles ? ` as ${me.displayName}` : ""}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.myHeadline} accessibilityRole="header">
            You're not in these standings yet
          </Text>
          <Text style={styles.myDetail}>
            Play a {formatLabel} match this season and have the result confirmed to
            appear here.
          </Text>
        </>
      )}
      <Button
        label="Find your next match"
        size="compact"
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
          {myStanding}
          {filters}
          <SectionHeader
            style={styles.sectionHeader}
            title={isDoubles ? "Doubles team standings" : "Division standings"}
            subtitle={seasonName}
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
            <Text style={styles.rankHeader}>#</Text>
            <Text style={styles.playerHeader}>{isDoubles ? "Team" : "Player"}</Text>
            <Text style={styles.recordHeader}>W–L</Text>
            <Text style={styles.diffHeader}>Diff</Text>
          </View>
        </View>
      }
      contentContainerStyle={styles.list}
    />
  );
}

export default function RankingsScreen() {
  const { divisionId } = useAppStore();
  const router = useRouter();
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  // Matches web's dashboard: standings are scoped to one season at a time, since
  // matches from every season otherwise pool into a single all-time ranking.
  const [selectedSeasonId, setSelectedSeasonId] = useState(
    () => currentSeasonForDate().id,
  );
  const [matchTypeFilter, setMatchTypeFilter] =
    useState<DivisionMatchType>("singles");
  const [retryKey, setRetryKey] = useState(0);
  const seasonName =
    seasonOptions.find((s) => s.id === selectedSeasonId)?.name ?? "";

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
            onPress={() => setMatchTypeFilter(option)}
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
            onPress={() => setSelectedSeasonId(season.id)}
          />
        ))}
      </View>
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
        key={`${matchTypeFilter}-${selectedSeasonId}-${retryKey}`}
        divisionId={divisionId}
        seasonId={selectedSeasonId}
        seasonName={seasonName}
        matchType={matchTypeFilter}
        filters={filters}
        onRetry={() => setRetryKey((k) => k + 1)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  rankHeader: { width: 38, ...typography.caption, color: colors.textMuted },
  playerHeader: {
    flex: 1,
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  recordHeader: {
    width: 58,
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
  diffHeader: {
    width: 48,
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "right",
  },
  row: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.transparent,
    overflow: "hidden",
  },
  rowCurrentUser: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
  },
  primaryRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rankMarker: {
    width: 28,
    height: 28,
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
    width: 58,
    ...typography.label,
    color: colors.text,
    textAlign: "center",
  },
  diffCell: {
    width: 48,
    ...typography.label,
    color: colors.textMuted,
    textAlign: "right",
  },
  positiveDiff: { color: colors.successText },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 52,
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
});
