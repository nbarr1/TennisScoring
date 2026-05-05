import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { onSnapshot, getDoc, query, where } from 'firebase/firestore';
import {
  divisionsCol,
  userDoc,
  createDivision,
  addDivisionMemberPlaceholder,
  mergeDivisionPlayerRecords,
} from '@tennis/firebase-client';
import { useAppStore } from '../../store/appStore';
import type { Division, User } from '@tennis/shared';

export default function AdminScreen() {
  const { user } = useAppStore();
  const [division, setDivision] = useState<Division | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [needsMergeForUserId, setNeedsMergeForUserId] = useState<string | null>(null);
  const [mergeSourceUserId, setMergeSourceUserId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'division_leader';

  useEffect(() => {
    if (!user?.id) return;
    const q = query(
      divisionsCol(),
      where('leaderIds', 'array-contains', user.id),
    );
    const unsub = onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const div: Division = {
          id: snap.docs[0].id,
          ...(snap.docs[0].data() as Omit<Division, 'id'>),
        };
        setDivision(div);
        if (div.playerIds.length > 0) {
          const profiles = await Promise.all(
            div.playerIds.map((id) => getDoc(userDoc(id))),
          );
          setPlayers(
            profiles
              .filter((d) => d.exists())
              .map((d) => ({ id: d.id, ...(d.data() as Omit<User, 'id'>) })),
          );
        } else {
          setPlayers([]);
        }
      } else {
        setDivision(null);
        setPlayers([]);
      }
      setLoading(false);
    });
    return unsub;
  }, [user?.id]);

  async function handleCreateDivision() {
    if (!user || !newDivisionName.trim()) return;
    setCreating(true);
    try {
      await createDivision(newDivisionName.trim(), user.id, {
        displayName: user.displayName,
        email: user.email,
      });
      setNewDivisionName('');
    } catch {
      Alert.alert('Error', 'Could not create division. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleAddPlayer() {
    if (!division || !newPlayerName.trim()) return;
    setAdding(true);
    setError('');
    try {
      const result = await addDivisionMemberPlaceholder(
        division.id,
        newPlayerName.trim(),
        newPlayerEmail.trim() || undefined,
        false,
      );
      setNeedsMergeForUserId(result.userId);
      setMergeSourceUserId(null);
      Alert.alert(
        'Player added',
        result.linkedHistoricalMatches > 0
          ? `Automatically linked ${result.linkedHistoricalMatches} historical match${
              result.linkedHistoricalMatches === 1 ? '' : 'es'
            } by player name. If anything is still missing, use link records below.`
          : 'If existing recorded matches belong to this player, select an existing player below and link records.',
      );
      setNewPlayerName('');
      setNewPlayerEmail('');
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          'Failed to add player. Please try again.',
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleMergeRecords() {
    if (!division || !mergeSourceUserId || !needsMergeForUserId) return;
    setMerging(true);
    setError('');
    try {
      const updatedMatches = await mergeDivisionPlayerRecords(
        division.id,
        needsMergeForUserId,
        { sourceUserId: mergeSourceUserId },
      );
      Alert.alert('Records linked', `Updated ${updatedMatches} historical matches.`);
      setNeedsMergeForUserId(null);
      setMergeSourceUserId(null);
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          'Failed to link historical records. Please try again.',
      );
    } finally {
      setMerging(false);
    }
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.accessDenied}>⚠ Admin access only</Text>
        <Text style={styles.accessHint}>
          This screen is only available to division leaders and admins.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Division Admin</Text>

      {!division ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create Your Division</Text>
          <Text style={styles.hint}>
            You are not currently managing a division. Create one to get
            started.
          </Text>
          <TextInput
            style={styles.input}
            value={newDivisionName}
            onChangeText={setNewDivisionName}
            placeholder="Division name (e.g. Office A)"
            placeholderTextColor="#aaa"
            autoCapitalize="words"
          />
          <TouchableOpacity
            style={[
              styles.btn,
              (!newDivisionName.trim() || creating) && styles.btnDisabled,
            ]}
            onPress={handleCreateDivision}
            disabled={!newDivisionName.trim() || creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Create Division</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{division.name}</Text>
            <Text style={styles.hint}>
              {players.length} player{players.length !== 1 ? 's' : ''} enrolled
            </Text>

            <Text style={styles.subTitle}>Add Player</Text>
            <TextInput
              style={styles.input}
              value={newPlayerName}
              onChangeText={setNewPlayerName}
              placeholder="Full name"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              value={newPlayerEmail}
              onChangeText={(t) => {
                setNewPlayerEmail(t);
                setError('');
              }}
              placeholder="player@company.com"
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity
              style={[
                styles.btn,
                (!newPlayerName.trim() || adding) && styles.btnDisabled,
              ]}
              onPress={handleAddPlayer}
              disabled={!newPlayerName.trim() || adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Add Player</Text>
              )}
            </TouchableOpacity>
            {needsMergeForUserId ? (
              <View style={styles.mergeBox}>
                <Text style={styles.subTitle}>Link Historical Matches (Optional)</Text>
                <Text style={styles.hint}>
                  Pick an existing player record if historical matches should be reassigned to this newly added player.
                </Text>
                {players
                  .filter((p) => p.id !== needsMergeForUserId)
                  .map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.mergeCandidate,
                        mergeSourceUserId === p.id && styles.mergeCandidateActive,
                      ]}
                      onPress={() => setMergeSourceUserId(p.id)}
                    >
                      <Text style={styles.playerName}>{p.displayName}</Text>
                    </TouchableOpacity>
                  ))}
                <TouchableOpacity
                  style={[
                    styles.btn,
                    (!mergeSourceUserId || merging) && styles.btnDisabled,
                  ]}
                  onPress={handleMergeRecords}
                  disabled={!mergeSourceUserId || merging}
                >
                  {merging ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Link Records</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Players</Text>
            {players.length === 0 ? (
              <Text style={styles.hint}>
                No players yet. Add players above.
              </Text>
            ) : (
              <FlatList
                data={players}
                keyExtractor={(p) => p.id}
                scrollEnabled={false}
                renderItem={({ item: p }) => (
                  <View style={styles.playerRow}>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{p.displayName}</Text>
                      {p.contactPreferences?.allowEmail !== false && p.email ? (
                        <Text style={styles.playerContact}>{p.email}</Text>
                      ) : null}
                      {p.phone && p.contactPreferences?.allowSMS ? (
                        <Text style={styles.playerContact}>{p.phone}</Text>
                      ) : null}
                    </View>
                    <View
                      style={
                        division.leaderIds.includes(p.id)
                          ? styles.leaderBadge
                          : styles.playerBadge
                      }
                    >
                      <Text
                        style={
                          division.leaderIds.includes(p.id)
                            ? styles.leaderBadgeText
                            : styles.playerBadgeText
                        }
                      >
                        {division.leaderIds.includes(p.id)
                          ? 'Leader'
                          : 'Player'}
                      </Text>
                    </View>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20, paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessDenied: {
    fontSize: 20,
    fontWeight: '700',
    color: '#c0392b',
    marginBottom: 8,
  },
  accessHint: { fontSize: 14, color: '#888', textAlign: 'center' },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a472a',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444',
    marginTop: 16,
    marginBottom: 8,
  },
  hint: { fontSize: 13, color: '#888', marginBottom: 12 },
  mergeBox: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 },
  mergeCandidate: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  mergeCandidateActive: { borderColor: '#1a472a', backgroundColor: '#e8f5e9' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    marginBottom: 10,
  },
  btn: {
    backgroundColor: '#1a472a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorText: { color: '#c0392b', fontSize: 13, marginBottom: 8 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  playerInfo: { flex: 1, gap: 2 },
  playerName: { fontSize: 15, fontWeight: '600', color: '#222' },
  playerContact: { fontSize: 13, color: '#555' },
  leaderBadge: {
    backgroundColor: '#fff3cd',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  leaderBadgeText: { color: '#856404', fontWeight: '700', fontSize: 12 },
  playerBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  playerBadgeText: { color: '#555', fontWeight: '600', fontSize: 12 },
  separator: { height: 1, backgroundColor: '#f5f5f5' },
});
