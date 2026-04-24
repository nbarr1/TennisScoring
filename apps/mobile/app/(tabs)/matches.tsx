import React, { useState, useEffect } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { onSnapshot } from 'firebase/firestore';
import { divisionMatchesQuery, createMatch, recordHistoricMatch, searchDivisionPlayers } from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';
import type { Match, User } from '@tennis/shared';

const STATUS_COLOR: Record<string, string> = {
  in_progress: '#27ae60',
  pending_report: '#e67e22',
  completed: '#555',
  disputed: '#c0392b',
  scheduled: '#aaa',
  cancelled: '#bbb',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: '● LIVE',
  pending_report: 'Pending Report',
  completed: 'Final',
  disputed: '⚠ Dispute',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
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
            {match.winner === 'player1'
              ? (match.player1Name ?? 'P1') + ' wins'
              : (match.player2Name ?? 'P2') + ' wins'}
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
          {match.player1Name ?? 'Player 1'}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <View style={styles.playerRight}>
          <Text style={[styles.playerName, match.winner === 'player2' && styles.winner]}>
            {match.player2Name ?? 'Player 2'}
          </Text>
          {match.player2IsGuest && <Text style={styles.guestBadge}>Guest</Text>}
        </View>
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
  const [createMode, setCreateMode] = useState<'live' | 'historic'>('live');
  const [opponentMode, setOpponentMode] = useState<'search' | 'guest'>('search');
  const [guestName, setGuestName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  // Historic match set scores: array of { p1, p2 } per set
  const [historicSets, setHistoricSets] = useState([{ p1: '', p2: '' }]);
  const router = useRouter();

  useEffect(() => {
    if (!divisionId) return;
    setLoading(true);
    const q = divisionMatchesQuery(divisionId);
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match));
      setLoading(false);
    });
    return unsub;
  }, [divisionId]);

  useEffect(() => {
    if (!divisionId || !searchText.trim() || selectedOpponent) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchDivisionPlayers(divisionId, searchText);
        setSearchResults(results.filter((u) => u.id !== user?.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, divisionId, selectedOpponent]);

  function resetCreateModal() {
    setShowCreate(false);
    setCreateMode('live');
    setOpponentMode('search');
    setGuestName('');
    setSearchText('');
    setSearchResults([]);
    setSelectedOpponent(null);
    setHistoricSets([{ p1: '', p2: '' }]);
  }

  async function handleCreateMatch() {
    if (!user || !divisionId) return;
    if (opponentMode === 'search' && !selectedOpponent) return;
    if (opponentMode === 'guest' && !guestName.trim()) return;
    setCreating(true);
    try {
      const matchId = await createMatch(
        opponentMode === 'guest'
          ? {
              player1Id: user.id,
              player2Id: 'guest',
              player1Name: user.displayName,
              player2Name: guestName.trim(),
              player2IsGuest: true,
              divisionId,
              createdBy: user.id,
            }
          : {
              player1Id: user.id,
              player2Id: selectedOpponent!.id,
              player1Name: user.displayName,
              player2Name: selectedOpponent!.displayName,
              divisionId,
              createdBy: user.id,
            }
      );
      resetCreateModal();
      router.push(`/match/${matchId}`);
    } catch (e) {
      console.error('[createMatch]', e);
      Alert.alert('Error', 'Could not create match. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRecordHistoric() {
    if (!user || !divisionId) return;
    if (opponentMode === 'search' && !selectedOpponent) return;
    if (opponentMode === 'guest' && !guestName.trim()) return;

    const parsed = historicSets.map((s) => ({ p1: parseInt(s.p1, 10), p2: parseInt(s.p2, 10) }));
    const invalid = parsed.some((s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0);
    if (invalid || parsed.length === 0) {
      Alert.alert('Invalid Score', 'Please enter a valid number of games for each set.');
      return;
    }
    const p1Sets = parsed.filter((s) => s.p1 > s.p2).length;
    const p2Sets = parsed.filter((s) => s.p2 > s.p1).length;
    if (p1Sets === p2Sets) {
      Alert.alert('Invalid Score', 'The match must have a clear winner. Check the set scores.');
      return;
    }
    setCreating(true);
    try {
      const isGuest = opponentMode === 'guest';
      await recordHistoricMatch(
        isGuest
          ? {
              player1Id: user.id,
              player2Id: 'guest',
              player1Name: user.displayName,
              player2Name: guestName.trim(),
              player2IsGuest: true,
              divisionId,
              createdBy: user.id,
              sets: parsed,
            }
          : {
              player1Id: user.id,
              player2Id: selectedOpponent!.id,
              player1Name: user.displayName,
              player2Name: selectedOpponent!.displayName,
              divisionId,
              createdBy: user.id,
              sets: parsed,
            }
      );
      resetCreateModal();
      Alert.alert(
        'Match Recorded',
        isGuest
          ? 'Match saved. You can link your opponent to their account later.'
          : 'Your opponent will be notified to confirm the score.',
      );
    } catch {
      Alert.alert('Error', 'Could not record match. Please try again.');
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

      <View style={styles.fabGroup}>
        <TouchableOpacity style={[styles.fab, styles.fabSecondary]} onPress={() => { setCreateMode('historic'); setShowCreate(true); }}>
          <Text style={styles.fabSecondaryText}>📋 Record Past</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => { setCreateMode('live'); setShowCreate(true); }}>
          <Text style={styles.fabText}>+ Live Match</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {createMode === 'historic' ? 'Record Past Match' : 'New Live Match'}
            </Text>

            {/* Opponent mode toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, opponentMode === 'search' && styles.modeBtnActive]}
                onPress={() => { setOpponentMode('search'); setGuestName(''); }}
              >
                <Text style={[styles.modeBtnText, opponentMode === 'search' && styles.modeBtnTextActive]}>
                  Search Player
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, opponentMode === 'guest' && styles.modeBtnActive]}
                onPress={() => { setOpponentMode('guest'); setSelectedOpponent(null); setSearchText(''); setSearchResults([]); }}
              >
                <Text style={[styles.modeBtnText, opponentMode === 'guest' && styles.modeBtnTextActive]}>
                  Guest / No Account
                </Text>
              </TouchableOpacity>
            </View>

            {/* Opponent picker */}
            {opponentMode === 'guest' ? (
              <TextInput
                style={styles.input}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Guest name..."
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : selectedOpponent ? (
              <View style={styles.selectedPlayer}>
                <View style={styles.playerChip}>
                  <Text style={styles.playerChipName}>{selectedOpponent.displayName}</Text>
                  <Text style={styles.playerChipEmail}>{selectedOpponent.email}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSelectedOpponent(null); setSearchText(''); }}>
                  <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.modalLabel}>Search for opponent</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.searchInput]}
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Name or email..."
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searching && <ActivityIndicator style={styles.searchSpinner} color="#1a472a" />}
                </View>
                {searchResults.length > 0 && (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(u) => u.id}
                    style={styles.resultsList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.resultRow}
                        onPress={() => { setSelectedOpponent(item); setSearchResults([]); }}
                      >
                        <Text style={styles.resultName}>{item.displayName}</Text>
                        <Text style={styles.resultEmail}>{item.email}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
                {searchText.trim().length > 0 && !searching && searchResults.length === 0 && (
                  <Text style={styles.noResults}>No players found.</Text>
                )}
              </>
            )}

            {/* Historic set-score entry */}
            {createMode === 'historic' && (opponentMode === 'guest' ? guestName.trim() : selectedOpponent) && (
              <View style={styles.setsContainer}>
                <Text style={styles.modalLabel}>Enter set scores (your games first)</Text>
                {historicSets.map((s, i) => (
                  <View key={i} style={styles.setRow}>
                    <Text style={styles.setLabel}>Set {i + 1}</Text>
                    <TextInput
                      style={styles.setInput}
                      value={s.p1}
                      onChangeText={(v) => {
                        const next = [...historicSets];
                        next[i] = { ...next[i], p1: v };
                        setHistoricSets(next);
                      }}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="You"
                    />
                    <Text style={styles.setDash}>–</Text>
                    <TextInput
                      style={styles.setInput}
                      value={s.p2}
                      onChangeText={(v) => {
                        const next = [...historicSets];
                        next[i] = { ...next[i], p2: v };
                        setHistoricSets(next);
                      }}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="Opp"
                    />
                    {historicSets.length > 1 && (
                      <TouchableOpacity onPress={() => setHistoricSets(historicSets.filter((_, j) => j !== i))}>
                        <Text style={styles.removeSet}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {historicSets.length < 5 && (
                  <TouchableOpacity onPress={() => setHistoricSets([...historicSets, { p1: '', p2: '' }])}>
                    <Text style={styles.addSet}>+ Add Set</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetCreateModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, (creating || (opponentMode === 'search' ? !selectedOpponent : !guestName.trim())) && styles.createBtnDisabled]}
                onPress={createMode === 'historic' ? handleRecordHistoric : handleCreateMatch}
                disabled={creating || (opponentMode === 'search' ? !selectedOpponent : !guestName.trim())}
              >
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.createText}>{createMode === 'historic' ? 'Record' : 'Create'}</Text>}
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
  playerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' },
  winner: { color: '#1a472a' },
  vs: { fontSize: 13, color: '#999', marginHorizontal: 12 },
  guestBadge: { fontSize: 10, fontWeight: '700', color: '#e67e22', backgroundColor: '#fff3e0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  serverLine: { fontSize: 12, color: '#888', marginTop: 6 },

  fabGroup: { position: 'absolute', bottom: 24, right: 16, flexDirection: 'row', gap: 10 },
  fab: { backgroundColor: '#1a472a', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fabSecondary: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1a472a' },
  fabSecondaryText: { color: '#1a472a', fontWeight: '700', fontSize: 15 },
  setsContainer: { marginBottom: 4, gap: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setLabel: { fontSize: 13, color: '#666', width: 40 },
  setInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16, fontWeight: '700', textAlign: 'center', width: 56, color: '#1a472a' },
  setDash: { fontSize: 18, color: '#888', fontWeight: '600' },
  removeSet: { fontSize: 18, color: '#c0392b', paddingHorizontal: 6 },
  addSet: { color: '#1a472a', fontWeight: '600', fontSize: 14, paddingVertical: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#666', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, marginBottom: 0 },
  searchSpinner: { marginLeft: 10 },
  resultsList: { maxHeight: 200, marginTop: 8, marginBottom: 12 },
  resultRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  resultName: { fontSize: 15, fontWeight: '600', color: '#222' },
  resultEmail: { fontSize: 13, color: '#888', marginTop: 2 },
  noResults: { fontSize: 14, color: '#999', textAlign: 'center', marginVertical: 12 },
  selectedPlayer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  playerChip: { flex: 1 },
  playerChipName: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  playerChipEmail: { fontSize: 13, color: '#666', marginTop: 2 },
  changeText: { fontSize: 14, color: '#1a472a', fontWeight: '600' },
  modeToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden', marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f9f9f9' },
  modeBtnActive: { backgroundColor: '#1a472a' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  modeBtnTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { color: '#333', fontWeight: '600' },
  createBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#1a472a', alignItems: 'center' },
  createBtnDisabled: { opacity: 0.6 },
  createText: { color: '#fff', fontWeight: '600' },
});
