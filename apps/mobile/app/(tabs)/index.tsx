import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useRankings,
  useDoublesRankings,
  recalculateDivisionRankings,
} from "@tennis/firebase-client";
import { currentSeasonForDate, defaultSeasonOptions } from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import type { DivisionMatchType } from "@tennis/shared";
import {
  Button,
  Chip,
  EmptyState,
  Screen,
  SectionHeader,
  colors,
  elevations,
  radii,
  spacing,
  typography,
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
  const podiumStyle = [styles.rowTop1, styles.rowTop2, styles.rowTop3][index];
  const differential = `${item.gameDifferential > 0 ? "+" : ""}${item.gameDifferential}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName}, rank ${index + 1}, ${item.matchesWon} wins and ${item.matchesLost} losses, game differential ${differential}`}
      accessibilityHint="Shows set record"
      accessibilityState={{ expanded: showDetails }}
      onPress={() => setShowDetails((visible) => !visible)}
      style={[styles.row, podiumStyle, isCurrentUser && styles.rowCurrentUser]}
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

export default function RankingsScreen() {
  const { divisionId, user } = useAppStore();
  const seasonOptions = useMemo(() => defaultSeasonOptions(), []);
  const [selectedSeasonId, setSelectedSeasonId] = useState(
    () => currentSeasonForDate().id,
  );
  // Matches web's dashboard: standings are scoped to one season at a time, since
  // matches from every season otherwise pool into a single all-time ranking.
  const [matchTypeFilter, setMatchTypeFilter] =
    useState<DivisionMatchType>("singles");
  const { rankings: singlesRankings, loading: singlesLoading } = useRankings(
    matchTypeFilter === "singles" ? divisionId : null,
    { seasonId: selectedSeasonId },
  );
  const { rankings: doublesRankings, loading: doublesLoading } =
    useDoublesRankings(matchTypeFilter === "doubles" ? divisionId : null, {
      seasonId: selectedSeasonId,
    });
  const isDoubles = matchTypeFilter === "doubles";
  const loading = isDoubles ? doublesLoading : singlesLoading;
  const rankings: StandingsRow[] = isDoubles
    ? doublesRankings.map((r) => ({ ...r, key: r.teamId }))
    : singlesRankings.map((r) => ({
        ...r,
        key: r.userId,
        playerIds: [r.userId],
      }));
  const router = useRouter();
  const [recalculating, setRecalculating] = useState(false);
  const [showTiebreakers, setShowTiebreakers] = useState(false);

  const canRecalculate =
    user?.role === "division_leader" || user?.role === "admin";

  async function handleRecalculate() {
    if (!divisionId) return;
    setRecalculating(true);
    try {
      await recalculateDivisionRankings(divisionId);
      Alert.alert("Done", "Rankings have been recalculated.");
    } catch {
      Alert.alert("Error", "Could not recalculate rankings. Please try again.");
    } finally {
      setRecalculating(false);
    }
  }

  const seasonSelector = (
    <View style={styles.seasonSection}>
      <Text style={styles.seasonLabel}>Format</Text>
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
      <Text style={styles.seasonLabel}>Season</Text>
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

  if (loading) {
    return (
      <Screen>
        {seasonSelector}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {seasonSelector}
      {rankings.length === 0 ? (
        <EmptyState
          title="No Rankings Yet"
          message={
            isDoubles
              ? "Complete doubles matches to see team standings."
              : "Complete matches to see the standings."
          }
          action={
            <View style={styles.emptyActions}>
              <Button
                label="Start a Match"
                onPress={() => router.push("/(tabs)/matches")}
              />
              {canRecalculate && (
                <Button
                  label="↺  Recalculate Rankings"
                  variant="secondary"
                  loading={recalculating}
                  onPress={handleRecalculate}
                />
              )}
            </View>
          }
        />
      ) : (
        <FlatList
          data={rankings}
          keyExtractor={(item) => item.key}
          renderItem={({ item, index }) => (
            <RankingRow
              item={item}
              index={index}
              isCurrentUser={Boolean(
                user?.id && item.playerIds.includes(user.id),
              )}
            />
          )}
          ListHeaderComponent={
            <View style={styles.tableHeader}>
              <SectionHeader
                title={
                  isDoubles ? "Doubles Team Standings" : "Division Standings"
                }
              />
              <Button
                label="How standings work"
                variant="text"
                accessibilityState={{ expanded: showTiebreakers }}
                style={styles.infoButton}
                onPress={() => setShowTiebreakers((visible) => !visible)}
              />
              {showTiebreakers && (
                <Text style={styles.tiebreakerText}>
                  Ties are decided by sets won, games won, game differential,
                  then head-to-head results.
                </Text>
              )}
              {canRecalculate && (
                <Button
                  label="↺  Recalculate Rankings"
                  variant="secondary"
                  loading={recalculating}
                  style={styles.recalcBtn}
                  onPress={handleRecalculate}
                />
              )}
              <View style={styles.columnHeader} accessibilityRole="header">
                <Text style={styles.rankHeader}>#</Text>
                <Text style={styles.playerHeader}>
                  {isDoubles ? "Team" : "Player"}
                </Text>
                <Text style={styles.recordHeader}>W–L</Text>
                <Text style={styles.diffHeader}>Diff</Text>
              </View>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  seasonSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  seasonLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  list: { padding: spacing.lg },
  tableHeader: { marginBottom: 12 },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 7,
  },
  rankHeader: {
    width: 38,
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
  },
  playerHeader: {
    flex: 1,
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  recordHeader: {
    width: 58,
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  diffHeader: {
    width: 48,
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  row: {
    padding: 0,
    borderRadius: 0,
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.transparent,
    ...elevations.none,
  },
  rowTop1: { backgroundColor: "#fff9e8", borderLeftColor: "#c99616" },
  rowTop2: { backgroundColor: "#f5f7f7", borderLeftColor: "#899391" },
  rowTop3: { backgroundColor: "#fff4ec", borderLeftColor: "#af7047" },
  rowCurrentUser: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
  },
  primaryRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  rankMarker: {
    width: 27,
    height: 27,
    borderRadius: 14,
    marginRight: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rankMarkerTop: { backgroundColor: colors.primary },
  rank: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  rankTop: { color: colors.onPrimary },
  playerCell: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { ...typography.subheading, color: colors.text },
  youLabel: {
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recordCell: {
    width: 58,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  diffCell: {
    width: 48,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  positiveDiff: { color: colors.success },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 50,
    paddingBottom: 10,
  },
  detailLabel: { ...typography.caption, color: colors.textMuted },
  detailValue: { ...typography.caption, color: colors.text, fontWeight: "700" },
  infoButton: { alignSelf: "flex-start", paddingHorizontal: 0 },
  tiebreakerText: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    borderRadius: radii.sm,
    marginBottom: 8,
  },
  recalcBtn: { marginTop: spacing.sm, alignSelf: "flex-start" },
  emptyActions: { gap: spacing.md, alignItems: "stretch" },
});
