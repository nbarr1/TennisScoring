import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal,
  ActivityIndicator, ScrollView, Switch, Animated
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import {
  useMatch, scorePoint, startMatch,
  submitMatchReport, confirmMatchReport, disputeMatchReport,
} from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore, getTipsForTriggers } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';

function TipOverlay({ tip, onDismiss }: { tip: { title: string; body: string } | null; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!tip) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(4000),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [tip]);

  if (!tip) return null;
  return (
    <Animated.View style={[styles.tipOverlay, { opacity }]}>
      <Text style={styles.tipTitle}>{tip.title}</Text>
      <Text style={styles.tipBody}>{tip.body}</Text>
    </Animated.View>
  );
}

function DisputeModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Dispute Match Report?</Text>
          <Text style={styles.modalBody}>
            Disputing will notify your division leader to review the final score and resolve the disagreement.
          </Text>
          <TouchableOpacity style={styles.disputeBtn} onPress={onConfirm}>
            <Text style={styles.disputeBtnText}>Yes, Dispute Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
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
  const [currentTip, setCurrentTip] = useState<{ title: string; body: string } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);

  const isParticipant = !!(user && match && (match.player1Id === user.id || match.player2Id === user.id));
  const myPlayerKey = user && match ? (match.player1Id === user.id ? 'player1' : 'player2') : null;

  // Derived report-submission state
  const submission = match?.reportSubmission;
  const iSubmitted = !!(submission && submission.submittedBy === user?.id);
  const opponentSubmitted = !!(submission && submission.submittedBy !== user?.id);
  const isPendingMyReview = opponentSubmitted && submission?.status === 'pending_confirmation';

  async function handlePoint(player: 'player1' | 'player2') {
    if (!match || !id || scoring) return;
    setScoring(true);
    try {
      const result = await scorePoint(id, match, player);
      if (match.tipsEnabled && result.tips.length > 0) {
        const tips = getTipsForTriggers(result.tips);
        if (tips.length > 0) setCurrentTip(tips[0]);
      }
      if (result.matchWinner) {
        const p1 = match.player1Name ?? 'Player 1';
        const p2 = match.player2Name ?? 'Player 2';
        Alert.alert(
          'Match Over!',
          `${result.matchWinner === 'player1' ? p1 : p2} wins!\n\nEither player can now submit the match report.`
        );
      }
    } finally {
      setScoring(false);
    }
  }

  async function handleSubmitReport() {
    if (!match || !id || !user) return;
    Alert.alert(
      'Submit Match Report?',
      `Submit the final score (${formatScoreDisplay(match.liveScore)}) for confirmation by your opponent?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitMatchReport(id, user.id);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }

  async function handleConfirmReport() {
    if (!match || !id || !user) return;
    Alert.alert(
      'Confirm Match Report?',
      'Confirming will finalise the score, update rankings, and generate the match report.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSubmitting(true);
            try {
              await confirmMatchReport(id, user.id);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }

  async function handleDisputeReport() {
    setShowDisputeConfirm(true);
  }

  async function confirmDispute() {
    if (!match || !id || !user) return;
    setShowDisputeConfirm(false);
    setSubmitting(true);
    try {
      await disputeMatchReport(id, user.id);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShareReport() {
    if (!match?.reportUrl) {
      Alert.alert('Report Not Ready', 'The match report is being generated. Try again in a moment.');
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(match.reportUrl);
    } else {
      Linking.openURL(match.reportUrl);
    }
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
  const p1Name = match.player1Name ?? 'Player 1';
  const p2Name = match.player2Name ?? 'Player 2';
  const serverLabel = match.liveScore.server === 'player1' ? `● ${p1Name} Serves` : `● ${p2Name} Serves`;

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
        {match.status === 'in_progress' && (
          <>
            <Text style={styles.serverLabel}>{serverLabel}</Text>
            <Text style={styles.serviceSide}>{match.liveScore.serviceSide} court</Text>
          </>
        )}
      </View>

      {/* Status badge */}
      {match.status === 'in_progress' && (
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>● LIVE</Text>
        </View>
      )}

      {/* Start button */}
      {isParticipant && match.status === 'scheduled' && (
        <TouchableOpacity style={styles.startBtn} onPress={() => startMatch(id!)}>
          <Text style={styles.startBtnText}>Start Match</Text>
        </TouchableOpacity>
      )}

      {/* Score input buttons */}
      {isParticipant && match.status === 'in_progress' && (
        <>
          <View style={styles.scoreButtons}>
            <TouchableOpacity
              style={[styles.pointBtn, styles.pointBtnP1, scoring && styles.pointBtnDisabled]}
              onPress={() => handlePoint('player1')}
              disabled={scoring}
            >
              <Text style={styles.pointBtnText}>{p1Name}{'\n'}Point</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pointBtn, styles.pointBtnP2, scoring && styles.pointBtnDisabled]}
              onPress={() => handlePoint('player2')}
              disabled={scoring}
            >
              <Text style={styles.pointBtnText}>{p2Name}{'\n'}Point</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tipsRow}>
            <Text style={styles.tipsLabel}>Live Tips</Text>
            <Switch
              value={match.tipsEnabled}
              onValueChange={toggleTips}
              trackColor={{ true: '#1a472a', false: '#ccc' }}
            />
          </View>
        </>
      )}

      {/* ── POST-MATCH REPORT FLOW ── */}

      {/* Game over, no report submitted yet */}
      {isParticipant && match.status === 'pending_report' && !submission && (
        <View style={styles.reportSection}>
          <Text style={styles.reportTitle}>
            {match.winner === 'player1' ? p1Name : p2Name} wins!
          </Text>
          <Text style={styles.reportScore}>{scoreDisplay}</Text>
          <Text style={styles.reportHint}>
            Either player can submit the final score report. Your opponent will be notified to confirm.
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmitReport}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>📋 Submit Match Report</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* I submitted — waiting for opponent */}
      {isParticipant && match.status === 'pending_report' && iSubmitted && submission?.status === 'pending_confirmation' && (
        <View style={styles.reportSection}>
          <Text style={styles.reportTitle}>Report Submitted</Text>
          <Text style={styles.reportScore}>{scoreDisplay}</Text>
          <View style={styles.waitingBadge}>
            <Text style={styles.waitingText}>⏳ Waiting for opponent to confirm</Text>
          </View>
          <Text style={styles.reportHint}>
            Your opponent has been notified. Once they confirm, the report will be finalised and rankings updated.
          </Text>
        </View>
      )}

      {/* Opponent submitted — I need to review */}
      {isParticipant && isPendingMyReview && (
        <View style={styles.reportSection}>
          <Text style={styles.reportTitle}>Review Match Report</Text>
          <Text style={styles.reportScore}>{scoreDisplay}</Text>
          <Text style={styles.reportHint}>
            Your opponent submitted the final score above. Confirm if it's correct, or dispute to escalate to your division leader.
          </Text>
          <TouchableOpacity
            style={[styles.confirmBtn, submitting && styles.btnDisabled]}
            onPress={handleConfirmReport}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.confirmBtnText}>✓ Confirm Score</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.disputeReportBtn}
            onPress={handleDisputeReport}
            disabled={submitting}
          >
            <Text style={styles.disputeReportBtnText}>⚠ Dispute Score</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Disputed — awaiting leader */}
      {match.status === 'disputed' && (
        <View style={styles.disputedSection}>
          <Text style={styles.disputedTitle}>⚠ Score Disputed</Text>
          <Text style={styles.disputedBody}>
            The match score has been escalated to your division leader for resolution. You'll be notified once it's resolved.
          </Text>
        </View>
      )}

      {/* Confirmed / completed */}
      {match.status === 'completed' && (
        <View style={styles.reportSection}>
          <Text style={styles.reportTitle}>
            {match.winner === 'player1' ? p1Name : p2Name} wins!
          </Text>
          <Text style={styles.reportScore}>{scoreDisplay}</Text>
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>✓ Score confirmed · Rankings updated</Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareReport}>
            <Text style={styles.shareBtnText}>📊 Share Match Report</Text>
          </TouchableOpacity>
        </View>
      )}

      <TipOverlay tip={currentTip} onDismiss={() => setCurrentTip(null)} />

      <DisputeModal
        visible={showDisputeConfirm}
        onConfirm={confirmDispute}
        onCancel={() => setShowDisputeConfirm(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a472a' },
  content: { padding: 24, paddingBottom: 48 },
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
  startBtn: { backgroundColor: '#ffdc60', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 20 },
  startBtnText: { color: '#1a472a', fontWeight: '800', fontSize: 17 },
  scoreButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  pointBtn: { flex: 1, paddingVertical: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pointBtnP1: { backgroundColor: '#2d6a4f' },
  pointBtnP2: { backgroundColor: '#1b4332' },
  pointBtnDisabled: { opacity: 0.5 },
  pointBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  tipsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  tipsLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Post-match report section
  reportSection: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 16, padding: 24, alignItems: 'center', gap: 12 },
  reportTitle: { color: '#ffdc60', fontSize: 24, fontWeight: '800' },
  reportScore: { color: '#fff', fontSize: 20, fontWeight: '600', letterSpacing: 1 },
  reportHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  submitBtn: { backgroundColor: '#ffdc60', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 4, width: '100%', alignItems: 'center' },
  submitBtnText: { color: '#1a472a', fontWeight: '800', fontSize: 16 },
  confirmBtn: { backgroundColor: '#27ae60', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, width: '100%', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disputeReportBtn: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  disputeReportBtnText: { color: '#ffa500', fontWeight: '600', fontSize: 14 },
  waitingBadge: { backgroundColor: 'rgba(255,220,96,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  waitingText: { color: '#ffdc60', fontWeight: '600', fontSize: 13 },
  confirmedBadge: { backgroundColor: 'rgba(39,174,96,0.3)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  confirmedText: { color: '#a8d5a2', fontWeight: '600', fontSize: 13 },
  shareBtn: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 4, width: '100%', alignItems: 'center' },
  shareBtnText: { color: '#1a472a', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  // Disputed state
  disputedSection: { backgroundColor: 'rgba(192,57,43,0.2)', borderRadius: 16, padding: 24, gap: 10 },
  disputedTitle: { color: '#ffa500', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  disputedBody: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Tip overlay
  tipOverlay: { position: 'absolute', bottom: 20, left: 0, right: 0, margin: 16, backgroundColor: '#ffdc60', borderRadius: 14, padding: 16 },
  tipTitle: { color: '#1a472a', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  tipBody: { color: '#1a472a', fontSize: 13 },

  // Dispute confirm modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#c0392b' },
  modalBody: { fontSize: 14, color: '#555', lineHeight: 20 },
  disputeBtn: { backgroundColor: '#c0392b', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  disputeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#888', fontSize: 14 },
});
