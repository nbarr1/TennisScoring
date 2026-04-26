import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useRankings, recalculateDivisionRankings } from '@tennis/firebase-client';
import { useAppStore } from '../../store/appStore';
import type { PlayerRanking } from '@tennis/shared';

function RankingRow({ item, index }: { item: PlayerRanking; index: number }) {
  const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
  return (
    <View style={[styles.row, index === 0 && styles.rowFirst]}>
      <Text style={styles.rank}>{medalEmoji}</Text>
      <View style={styles.playerInfo}>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.stats}>
          {item.matchesWon}W – {item.matchesLost}L · {item.setsWon}/{item.setsWon + item.setsLost} sets · {item.gameDifferential > 0 ? '+' : ''}{item.gameDifferential} games
        </Text>
      </View>
    </View>
  );
}

export default function RankingsScreen() {
  const { divisionId, user } = useAppStore();
  const { rankings, loading } = useRankings(divisionId);
  const router = useRouter();
  const [recalculating, setRecalculating] = useState(false);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rankings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No Rankings Yet</Text>
          <Text style={styles.emptyBody}>Complete matches to see the standings.</Text>
          <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/(tabs)/matches')}>
            <Text style={styles.ctaText}>Start a Match</Text>
          </TouchableOpacity>
          {canRecalculate && (
            <TouchableOpacity
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
          keyExtractor={(item) => item.userId}
          renderItem={({ item, index }) => <RankingRow item={item} index={index} />}
          ListHeaderComponent={
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Division Standings</Text>
              <Text style={styles.tableSubHeader}>Sorted: W · Sets · Games · Diff · H2H</Text>
              {canRecalculate && (
                <TouchableOpacity
                  style={[styles.recalcBtn, recalculating && styles.recalcBtnDisabled]}
                  onPress={handleRecalculate}
                  disabled={recalculating}
                >
                  {recalculating
                    ? <ActivityIndicator color="#1a472a" size="small" />
                    : <Text style={styles.recalcBtnText}>↺  Recalculate Rankings</Text>}
                </TouchableOpacity>
              )}
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
  list: { padding: 16 },
  tableHeader: { marginBottom: 12 },
  tableHeaderText: { fontSize: 20, fontWeight: '700', color: '#1a472a' },
  tableSubHeader: { fontSize: 12, color: '#888', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  rowFirst: { borderWidth: 2, borderColor: '#f0c040' },
  rank: { fontSize: 22, marginRight: 14, minWidth: 36 },
  playerInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  stats: { fontSize: 12, color: '#666', marginTop: 3 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' },
  ctaButton: { backgroundColor: '#1a472a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  ctaText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  recalcBtn: { marginTop: 14, backgroundColor: '#1a472a', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start' },
  recalcBtnDisabled: { opacity: 0.5 },
  recalcBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
