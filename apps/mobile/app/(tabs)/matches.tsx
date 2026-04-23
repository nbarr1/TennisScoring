import React, { useState } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { onSnapshot } from 'firebase/firestore';
import { divisionMatchesQuery, createMatch } from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';
import type { Match } from '@tennis/shared';

const STATUS_COLOR: Record<string, string> = {
  in_progress: '#27ae60',
  pending_report: '#e67e22',
  completed: '#555',
  disputed: '#c0392b',
  scheduled: '#aaa',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: '● LIVE',
  pending_report: 'Pending Report',
  completed: 'Final',
  disputed: '⚠ Dispute',
  scheduled: 'Scheduled',
};

function MatchCard({ match, onPress }: { match: Match; onPress: () => void }) {
  const isLive = match.status === 'in_progress';
  const hasScore = match.status !== 'scheduled';

  return (
    <TouchableOpacity style={[styles.card, isLive && styles.cardLive]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={[styles.status, { color: STATUS_COLOR[match.status] ?? '#888' }]}>
          {STATUS_LABEL[match.status] ?? match.status}
        </Text>
        {match.winner && (
          <Text style={styles.winnerBadge}>
            {match.winner === 'player1' ? 'P1 wins' : 'P2 wins'}
          </Text>
        )}
      </View>

      {hasScore && (
        <View style={styles.scoreRow}>
          <Text style={styles.setScore}>{formatScoreDisplay(match.liveScore)}</Text>
          {isLive && (
            <Text style={styles.gameScore}>{formatGameScore(match.liveScore)}</Text>
          )}
        </View>
      )}

      <View style={styles.players}>
        <Text style={[styles.playerName, match.winner === 'player1' && styles.winner]}>
          Player 1
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.playerName, match.winner === 'player2' && styles.winner]}>
          Player 2
        </Text>
      </View>

      {isLive && (
        <Text style={styles.serverLine}>
          {match.liveScore.server === 'player1' ? 'P1' : 'P2'} serves · {match.liveScore.serviceSide} side
        </Text>
      )}
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

  const liveMatches = matches.filter((m) => m.status === 'in_progress');
  const otherMatches = matches.filter((m) => m.status !== 'in_progress');

  const sections = [
    ...(liveMatches.length > 0 ? [{ title: 'Now Live', data: liveMatches }] : []),
    ...(otherMatches.length > 0 ? [{ title: liveMatches.length > 0 ? 'All Matches' : 'Matches', data: otherMatches }] : []),
  ];

  return (
    <View style={styles.container}>
      {matches.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No Matches</Text>
          <Text style={styles.emptyBody}>Create a new match to get started.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MatchCard match={item} onPress={() => router.push(`/match/${item.id}`)} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              {section.title === 'Now Live' && <View style={styles.liveDot} />}
              <Text style={[styles.sectionTitle, section.title === 'Now Live' && styles.sectionTitleLive]}>
                {section.title}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.list}
        />
      )}

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

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitleLive: { color: '#27ae60' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#27ae60' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardLive: { borderLeftWidth: 4, borderLeftColor: '#27ae60' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  status: { fontWeight: '700', fontSize: 13 },
  winnerBadge: { fontSize: 11, fontWeight: '600', color: '#1a472a', backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 },
  setScore: { fontSize: 20, fontWeight: '700', color: '#222', letterSpacing: 1 },
  gameScore: { fontSize: 15, fontWeight: '600', color: '#27ae60' },

  players: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerName: { fontSize: 15, fontWeight: '600', color: '#333', flex: 1 },
  winner: { color: '#1a472a' },
  vs: { fontSize: 13, color: '#999', marginHorizontal: 12 },
  serverLine: { fontSize: 12, color: '#888', marginTop: 6 },

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
