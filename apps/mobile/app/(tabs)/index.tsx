import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useRankings, useDoublesRankings, recalculateDivisionRankings } from '@tennis/firebase-client';
import { currentSeasonForDate, defaultSeasonOptions } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';
import type { DivisionMatchType } from '@tennis/shared';

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

function RankingRow({ item, index, isCurrentUser }: { item: StandingsRow; index: number; isCurrentUser: boolean }) {
  const [showDetails, setShowDetails] = useState(false);
  const podiumStyle = [styles.rowTop1, styles.rowTop2, styles.rowTop3][index];
  const differential = `${item.gameDifferential > 0 ? '+' : ''}${item.gameDifferential}`;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName}, rank ${index + 1}, ${item.matchesWon} wins and ${item.matchesLost} losses, game differential ${differential}`}
      accessibilityHint="Shows set record"
      accessibilityState={{ expanded: showDetails }}
      activeOpacity={0.7}
      onPress={() => setShowDetails((visible) => !visible)}
      style={[styles.row, podiumStyle, isCurrentUser && styles.rowCurrentUser]}
    >
      <View style={styles.primaryRow}>
        <View style={[styles.rankMarker, index < 3 && styles.rankMarkerTop]}>
          <Text style={[styles.rank, index < 3 && styles.rankTop]}>{index + 1}</Text>
        </View>
        <View style={styles.playerCell}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
            {isCurrentUser && <Text style={styles.youLabel}>You</Text>}
          </View>
        </View>
        <Text style={styles.recordCell}>{item.matchesWon}–{item.matchesLost}</Text>
        <Text style={[styles.diffCell, item.gameDifferential > 0 && styles.positiveDiff]}>{differential}</Text>
      </View>
      {showDetails && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Set record</Text>
          <Text style={styles.detailValue}>{item.setsWon}–{item.setsLost}</Text>
        </View>
      )}
    </TouchableOpacity>
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
  const [matchTypeFilter, setMatchTypeFilter] = useState<DivisionMatchType>('singles');
  const { rankings: singlesRankings, loading: singlesLoading } = useRankings(
    matchTypeFilter === 'singles' ? divisionId : null,
    { seasonId: selectedSeasonId },
  );
  const { rankings: doublesRankings, loading: doublesLoading } = useDoublesRankings(
    matchTypeFilter === 'doubles' ? divisionId : null,
    { seasonId: selectedSeasonId },
  );
  const isDoubles = matchTypeFilter === 'doubles';
  const loading = isDoubles ? doublesLoading : singlesLoading;
  const rankings: StandingsRow[] = isDoubles
    ? doublesRankings.map((r) => ({ ...r, key: r.teamId }))
    : singlesRankings.map((r) => ({ ...r, key: r.userId, playerIds: [r.userId] }));
  const router = useRouter();
  const [recalculating, setRecalculating] = useState(false);
  const [showTiebreakers, setShowTiebreakers] = useState(false);

  const canRecalculate = user?.role === 'division_leader' || user?.role === 'admin';

  async function handleRecalculate() {
    if (!divisionId) return;
    setRecalculating(true);
    try {
      await recalculateDivisionRankings(divisionId);
      Alert.alert('Done', 'Rankings have been recalculated.');
    } catch {
      Alert.alert('Error', 'Could not recalculate rankings. Please try again.');
    } finally {
      setRecalculating(false);
    }
  }

  const seasonSelector = (
    <View style={styles.seasonSection}>
      <Text style={styles.seasonLabel}>Format</Text>
      <View style={styles.chipRow}>
        {(['singles', 'doubles'] as DivisionMatchType[]).map((option) => (
          <TouchableOpacity
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`Show ${option} standings`}
            accessibilityState={{ selected: matchTypeFilter === option }}
            style={[styles.chip, matchTypeFilter === option && styles.chipActive]}
            onPress={() => setMatchTypeFilter(option)}
          >
            <Text
              style={[styles.chipText, matchTypeFilter === option && styles.chipTextActive]}
            >
              {option === 'singles' ? 'Singles' : 'Doubles'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.seasonLabel}>Season</Text>
      <View style={styles.chipRow}>
        {seasonOptions.map((season) => (
          <TouchableOpacity
            key={season.id}
            accessibilityRole="button"
            accessibilityLabel={`Show standings for ${season.name}`}
            accessibilityState={{ selected: selectedSeasonId === season.id }}
            style={[styles.chip, selectedSeasonId === season.id && styles.chipActive]}
            onPress={() => setSelectedSeasonId(season.id)}
          >
            <Text
              style={[
                styles.chipText,
                selectedSeasonId === season.id && styles.chipTextActive,
              ]}
            >
              {season.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {seasonSelector}
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a472a" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {seasonSelector}
      {rankings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No Rankings Yet</Text>
          <Text style={styles.emptyBody}>
            {isDoubles
              ? 'Complete doubles matches to see team standings.'
              : 'Complete matches to see the standings.'}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Start a match"
            style={styles.ctaButton}
            onPress={() => router.push('/(tabs)/matches')}
          >
            <Text style={styles.ctaText}>Start a Match</Text>
          </TouchableOpacity>
          {canRecalculate && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Recalculate rankings"
              accessibilityState={{ disabled: recalculating, busy: recalculating }}
              style={[styles.recalcBtn, recalculating && styles.recalcBtnDisabled]}
              onPress={handleRecalculate}
              disabled={recalculating}
            >
              {recalculating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.recalcBtnText}>↺  Recalculate Rankings</Text>}
            </TouchableOpacity>
          )}
        </View>
      ) : (
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
              <Text style={styles.tableHeaderText}>
                {isDoubles ? 'Doubles Team Standings' : 'Division Standings'}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="About standings tie-breakers"
                accessibilityState={{ expanded: showTiebreakers }}
                onPress={() => setShowTiebreakers((visible) => !visible)}
                style={styles.infoButton}
              >
                <Text style={styles.infoButtonText}>ⓘ How standings work</Text>
              </TouchableOpacity>
              {showTiebreakers && (
                <Text style={styles.tiebreakerText}>
                  Ties are decided by sets won, games won, game differential, then head-to-head results.
                </Text>
              )}
              {canRecalculate && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Recalculate rankings"
                  accessibilityState={{ disabled: recalculating, busy: recalculating }}
                  style={[styles.recalcBtn, recalculating && styles.recalcBtnDisabled]}
                  onPress={handleRecalculate}
                  disabled={recalculating}
                >
                  {recalculating
                    ? <ActivityIndicator color="#1a472a" size="small" />
                    : <Text style={styles.recalcBtnText}>↺  Recalculate Rankings</Text>}
                </TouchableOpacity>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  seasonSection: { paddingHorizontal: 16, paddingTop: 16 },
  seasonLabel: { fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 8, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: '#1a472a', backgroundColor: '#e8f5e9' },
  chipText: { color: '#555', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1a472a' },
  list: { padding: 16 },
  tableHeader: { marginBottom: 12 },
  tableHeaderText: { fontSize: 20, fontWeight: '700', color: '#1a472a' },
  infoButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  infoButtonText: { fontSize: 13, color: '#356747', fontWeight: '600' },
  tiebreakerText: { fontSize: 12, lineHeight: 18, color: '#66706a', backgroundColor: '#eef3ef', padding: 10, borderRadius: 8, marginBottom: 8 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 7 },
  rankHeader: { width: 38, color: '#737973', fontSize: 11, fontWeight: '700' },
  playerHeader: { flex: 1, color: '#737973', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  recordHeader: { width: 58, color: '#737973', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  diffHeader: { width: 48, color: '#737973', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  row: { backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dce2dc', borderLeftWidth: 3, borderLeftColor: 'transparent' },
  rowTop1: { backgroundColor: '#fff9e8', borderLeftColor: '#c99616' },
  rowTop2: { backgroundColor: '#f5f7f7', borderLeftColor: '#899391' },
  rowTop3: { backgroundColor: '#fff4ec', borderLeftColor: '#af7047' },
  rowCurrentUser: { backgroundColor: '#e7f3ea', borderLeftColor: '#1a472a' },
  primaryRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  rankMarker: { width: 27, height: 27, borderRadius: 14, marginRight: 11, alignItems: 'center', justifyContent: 'center' },
  rankMarkerTop: { backgroundColor: '#1a472a' },
  rank: { fontSize: 14, fontWeight: '700', color: '#59615b' },
  rankTop: { color: '#fff' },
  playerCell: { flex: 1, minWidth: 0, paddingRight: 8 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  youLabel: { marginLeft: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a472a', color: '#fff', fontSize: 10, fontWeight: '700' },
  recordCell: { width: 58, textAlign: 'center', color: '#303630', fontSize: 14, fontVariant: ['tabular-nums'] },
  diffCell: { width: 48, textAlign: 'right', color: '#4c554e', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  positiveDiff: { color: '#1a6b39' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 50, paddingRight: 12, paddingBottom: 10 },
  detailLabel: { color: '#7a817b', fontSize: 12 },
  detailValue: { color: '#4c554e', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' },
  ctaButton: { backgroundColor: '#1a472a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  ctaText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  recalcBtn: { marginTop: 14, backgroundColor: '#1a472a', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start' },
  recalcBtnDisabled: { opacity: 0.5 },
  recalcBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
