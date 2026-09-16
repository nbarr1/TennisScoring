import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
  Card,
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

function RankingRow({ item, index }: { item: StandingsRow; index: number }) {
  const medalEmoji =
    index === 0
      ? "🥇"
      : index === 1
        ? "🥈"
        : index === 2
          ? "🥉"
          : `${index + 1}.`;
  return (
    <Card style={[styles.row, index === 0 && styles.rowFirst]}>
      <Text style={styles.rank}>{medalEmoji}</Text>
      <View style={styles.playerInfo}>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.stats}>
          {item.matchesWon}W – {item.matchesLost}L · {item.setsWon}/
          {item.setsWon + item.setsLost} sets ·{" "}
          {item.gameDifferential > 0 ? "+" : ""}
          {item.gameDifferential} games
        </Text>
      </View>
    </Card>
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
    : singlesRankings.map((r) => ({ ...r, key: r.userId, playerIds: [r.userId] }));
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
            <RankingRow item={item} index={index} />
          )}
          ListHeaderComponent={
            <View style={styles.tableHeader}>
              <SectionHeader
                title={
                  isDoubles ? "Doubles Team Standings" : "Division Standings"
                }
                subtitle="Sorted: W · Sets · Games · Diff · H2H"
              />
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
                <Text style={styles.playerHeader}>{isDoubles ? 'Team' : 'Player'}</Text>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    ...elevations.low,
  },
  rowFirst: { borderWidth: 2, borderColor: "#f0c040" },
  rank: { fontSize: 22, marginRight: 14, minWidth: 36 },
  playerInfo: { flex: 1 },
  name: { ...typography.subheading, color: colors.text },
  stats: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  recalcBtn: { marginTop: spacing.sm, alignSelf: "flex-start" },
  emptyActions: { gap: spacing.md, alignItems: "stretch" },
});
