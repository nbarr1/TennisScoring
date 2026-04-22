import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { onSnapshot } from 'firebase/firestore';
import { divisionMatchesQuery, createMatch } from '@tennis/firebase-client';
import { useAppStore } from '../../store/appStore';
import type { Match } from '@tennis/shared';

function MatchCard({ match, onPress }: { match: Match; onPress: () => void }) {
  const statusColor = match.status === 'in_progress' ? '#1a472a' :
    match.status === 'completed' ? '#555' : '#888';

  const statusLabel = {
    scheduled: 'Scheduled',
    in_progress: '● LIVE',
    completed: 'Final',
    disputed: '⚠ Dispute',
  }[match.status];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <View style={styles.players}>
        <Text style={[styles.playerName, match.winner === 'player1' && styles.winner]}>
          Player 1
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.playerName, match.winner === 'player2' && styles.winner]}>
          Player 2
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MatchesScreen() {
  const { user, divisionId } = useAppStore();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (!divisionId) return;
    setLoading(true);
    const q = divisionMatchesQuery(divisionId);
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match));
      setLoading(false);
    });
    return unsub;
  }, [divisionId]);

  async function handleCreateMatch() {
    if (!user || !divisionId || !opponent.trim()) return;
    setCreating(true);
    try {
      const matchId = await createMatch({
        player1Id: user.id,
        player2Id: opponent.trim(),
        divisionId,
        createdBy: user.id,
      });
      setShowCreate(false);
      setOpponent('');
      router.push(`/match/${matchId}`);
    } catch {
      Alert.alert('Error', 'Could not create match. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a472a" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MatchCard match={item} onPress={() => router.push(`/match/${item.id}`)} />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No Matches</Text>
            <Text style={styles.emptyBody}>Create a new match to get started.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+ New Match</Text>
      </TouchableOpacity>

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Match</Text>
            <Text style={styles.modalLabel}>Opponent's User ID</Text>
            <TextInput
              style={styles.input}
              value={opponent}
              onChangeText={setOpponent}
              placeholder="Enter opponent's ID"
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, creating && styles.createBtnDisabled]}
                onPress={handleCreateMatch}
                disabled={creating}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  list: { padding: 16, paddingBottom: 80 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  status: { fontWeight: '700', fontSize: 13 },
  players: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerName: { fontSize: 16, fontWeight: '600', color: '#333', flex: 1 },
  winner: { color: '#1a472a' },
  vs: { fontSize: 13, color: '#999', marginHorizontal: 12 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#1a472a', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#666', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { color: '#333', fontWeight: '600' },
  createBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#1a472a', alignItems: 'center' },
  createBtnDisabled: { opacity: 0.6 },
  createText: { color: '#fff', fontWeight: '600' },
});
