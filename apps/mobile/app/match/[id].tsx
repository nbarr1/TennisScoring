import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal,
  ActivityIndicator, ScrollView, Switch, Animated
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import {
  useMatch, scorePoint, startMatch, triggerConflict, submitConflictVote,
  updateUserProfile
} from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore, getTipsForTriggers } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';
import type { LiveScore } from '@tennis/shared';

function TipOverlay({ tip, onDismiss }: { tip: { title: string; body: string } | null; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (tip) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(4000),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }
  }, [tip]);

  if (!tip) return null;
  return (
    <Animated.View style={[styles.tipOverlay, { opacity }]}>
      <Text style={styles.tipTitle}>{tip.title}</Text>
      <Text style={styles.tipBody}>{tip.body}</Text>
    </Animated.View>
  );
}

function ConflictModal({
  visible, match, onVote, onClose
}: {
  visible: boolean;
  match: ReturnType<typeof useMatch>['match'];
  onVote: (score: LiveScore) => void;
  onClose: () => void;
}) {
  if (!match) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.conflictOverlay}>
        <View style={styles.conflictCard}>
          <Text style={styles.conflictTitle}>⚠ Score Dispute</Text>
          <Text style={styles.conflictBody}>
            A score disagreement has been flagged. Both players must confirm the current score.
          </Text>
          <Text style={styles.conflictQuestion}>What is the current set score?</Text>
          {/* Show the current score as the consensus option */}
          <TouchableOpacity style={styles.conflictOption} onPress={() => onVote(match.liveScore)}>
            <Text style={styles.conflictOptionText}>{formatScoreDisplay(match.liveScore)}</Text>
            <Text style={styles.conflictOptionSub}>(current recorded score)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.conflictCancel} onPress={onClose}>
            <Text style={styles.conflictCancelText}>Escalate to Division Leader</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { match, loading } = useMatch(id ?? null);
  const { user } = useAppStore();
  const router = useRouter();
  const [currentTip, setCurrentTip] = useState<{ title: string; body: string } | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [scoring, setScoring] = useState(false);

  const isParticipant = user && match && (match.player1Id === user.id || match.player2Id === user.id);
  const myPlayerKey = user && match ? (match.player1Id === user.id ? 'player1' : 'player2') : null;

  useEffect(() => {
    if (match?.status === 'disputed') setShowConflict(true);
    else setShowConflict(false);
  }, [match?.status]);

  async function handlePoint(player: 'player1' | 'player2') {
    if (!match || !id || scoring) return;
    setScoring(true);
    try {
      const result = await scorePoint(id, match, player);
      if (result.matchWinner) {
        Alert.alert('Match Complete!', `${result.matchWinner === 'player1' ? 'Player 1' : 'Player 2'} wins!`);
      }
    } finally {
      setScoring(false);
    }
  }

  async function handleDispute() {
    if (!match || !id || !user) return;
    await triggerConflict(id, user.id, match.liveScore);
  }

  async function handleVote(score: LiveScore) {
    if (!match || !id || !user) return;
    await submitConflictVote(id, user.id, score);
    setShowConflict(false);
  }

  async function handleShareReport() {
    if (!match?.reportUrl) {
      Alert.alert('Report Not Ready', 'The match report is still being generated.');
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(match.reportUrl);
    } else {
      await Linking.openURL(match.reportUrl);
    }
  }

  async function handleStartMatch() {
    if (!id) return;
    await startMatch(id);
  }

  async function toggleTips() {
    if (!id || !match) return;
    const { updateDoc } = await import('firebase/firestore');
    const { matchDoc } = await import('@tennis/firebase-client');
    await updateDoc(matchDoc(id), { tipsEnabled: !match.tipsEnabled });
  }

  if (loading || !match) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a472a" /></View>;
  }

  const scoreDisplay = formatScoreDisplay(match.liveScore);
  const gameDisplay = formatGameScore(match.liveScore);
  const setsDisplay = `${match.liveScore.player1SetsWon} – ${match.liveScore.player2SetsWon}`;
  const serverLabel = match.liveScore.server === 'player1' ? '● P1 Serves' : '● P2 Serves';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Score board */}
      <View style={styles.scoreBoard}>
        <View style={styles.setRow}>
          <Text style={styles.setsLabel}>Sets</Text>
          <Text style={styles.setsScore}>{setsDisplay}</Text>
        </View>
        <Text style={styles.scoreMain}>{scoreDisplay}</Text>
        <Text style={styles.gameScore}>{gameDisplay}</Text>
        <Text style={styles.serverLabel}>{serverLabel}</Text>
        <Text style={styles.serviceSide}>{match.liveScore.serviceSide} court</Text>
      </View>

      {/* Status badge */}
      {match.status === 'in_progress' && (
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>● LIVE</Text>
        </View>
      )}

      {/* Score buttons — only for participants */}
      {isParticipant && match.status === 'scheduled' && (
        <TouchableOpacity style={styles.startBtn} onPress={handleStartMatch}>
          <Text style={styles.startBtnText}>Start Match</Text>
        </TouchableOpacity>
      )}

      {isParticipant && match.status === 'in_progress' && (
        <View style={styles.scoreButtons}>
          <TouchableOpacity
            style={[styles.pointBtn, styles.pointBtnP1, scoring && styles.pointBtnDisabled]}
            onPress={() => handlePoint('player1')}
            disabled={scoring}
          >
            <Text style={styles.pointBtnText}>Player 1{'\n'}Point</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pointBtn, styles.pointBtnP2, scoring && styles.pointBtnDisabled]}
            onPress={() => handlePoint('player2')}
            disabled={scoring}
          >
            <Text style={styles.pointBtnText}>Player 2{'\n'}Point</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Controls */}
      {isParticipant && match.status === 'in_progress' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={handleDispute}>
            <Text style={styles.controlBtnText}>⚠ Dispute Score</Text>
          </TouchableOpacity>
          <View style={styles.tipsRow}>
            <Text style={styles.tipsLabel}>Live Tips</Text>
            <Switch
              value={match.tipsEnabled}
              onValueChange={toggleTips}
              trackColor={{ true: '#1a472a', false: '#ccc' }}
            />
          </View>
        </View>
      )}

      {/* Completed match actions */}
      {match.status === 'completed' && (
        <View style={styles.completedSection}>
          <Text style={styles.completedTitle}>
            {match.winner === 'player1' ? 'Player 1' : 'Player 2'} wins!
          </Text>
          <Text style={styles.completedScore}>{scoreDisplay}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareReport}>
            <Text style={styles.shareBtnText}>📊 Share Match Report</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tip overlay */}
      <TipOverlay tip={currentTip} onDismiss={() => setCurrentTip(null)} />

      {/* Conflict modal */}
      <ConflictModal
        visible={showConflict}
        match={match}
        onVote={handleVote}
        onClose={() => setShowConflict(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a472a' },
  content: { padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scoreBoard: { alignItems: 'center', paddingVertical: 32 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginRight: 12 },
  setsScore: { color: '#fff', fontSize: 24, fontWeight: '700' },
  scoreMain: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  gameScore: { color: '#a8d5a2', fontSize: 28, fontWeight: '600', marginBottom: 16 },
  serverLabel: { color: '#ffdc60', fontSize: 14, fontWeight: '600' },
  serviceSide: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
  liveBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'center', marginBottom: 20 },
  liveBadgeText: { color: '#ff6b6b', fontWeight: '700', fontSize: 13 },
  scoreButtons: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  pointBtn: { flex: 1, paddingVertical: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pointBtnP1: { backgroundColor: '#2d6a4f' },
  pointBtnP2: { backgroundColor: '#1b4332' },
  pointBtnDisabled: { opacity: 0.5 },
  pointBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  startBtn: { backgroundColor: '#ffdc60', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 20 },
  startBtnText: { color: '#1a472a', fontWeight: '800', fontSize: 17 },
  controls: { gap: 12 },
  controlBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  controlBtnText: { color: '#ffa500', fontWeight: '600', fontSize: 14 },
  tipsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  tipsLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
  completedSection: { alignItems: 'center', gap: 12 },
  completedTitle: { color: '#ffdc60', fontSize: 24, fontWeight: '800' },
  completedScore: { color: '#fff', fontSize: 18, fontWeight: '600' },
  shareBtn: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  shareBtnText: { color: '#1a472a', fontWeight: '700', fontSize: 15 },
  tipOverlay: { position: 'absolute', bottom: 20, left: 0, right: 0, margin: 16, backgroundColor: '#ffdc60', borderRadius: 14, padding: 16 },
  tipTitle: { color: '#1a472a', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  tipBody: { color: '#1a472a', fontSize: 13 },
  conflictOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  conflictCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  conflictTitle: { fontSize: 20, fontWeight: '800', color: '#c0392b', marginBottom: 12 },
  conflictBody: { fontSize: 14, color: '#555', marginBottom: 20 },
  conflictQuestion: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  conflictOption: { backgroundColor: '#f0f9f0', borderWidth: 2, borderColor: '#1a472a', borderRadius: 12, padding: 16, marginBottom: 8 },
  conflictOptionText: { fontSize: 18, fontWeight: '700', color: '#1a472a', textAlign: 'center' },
  conflictOptionSub: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 4 },
  conflictCancel: { paddingVertical: 14, alignItems: 'center' },
  conflictCancelText: { color: '#888', fontSize: 14 },
});
