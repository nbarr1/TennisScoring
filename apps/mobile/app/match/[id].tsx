import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal,
  ActivityIndicator, ScrollView, Switch, Animated, TextInput, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import {
  useMatch, scorePoint, startMatch, undoLastPoint,
  cancelMatch, deleteMatch, postponeMatch, editMatchScore,
  submitMatchReport, confirmMatchReport, disputeMatchReport,
  submitGuestReport, linkGuestOpponent, searchDivisionPlayers,
} from '@tennis/firebase-client';
import { formatScoreDisplay, formatGameScore, getTipsForTriggers } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';
import type { User } from '@tennis/shared';

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

function EditScoreModal({
  visible, sets, onChangeSets, onSave, onCancel, saving, isCompleted, p1Name, p2Name,
}: {
  visible: boolean;
  sets: { p1: string; p2: string }[];
  onChangeSets: (s: { p1: string; p2: string }[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isCompleted: boolean;
  p1Name: string;
  p2Name: string;
}) {
  function updateSet(i: number, side: 'p1' | 'p2', val: string) {
    onChangeSets(sets.map((s, idx) => idx === i ? { ...s, [side]: val.replace(/[^0-9]/g, '') } : s));
  }
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.linkModalOverlay}>
        <ScrollView contentContainerStyle={styles.linkModalCard} keyboardShouldPersistTaps="handled">
          <Text style={styles.linkModalTitle}>Edit Score</Text>
          {isCompleted && (
            <Text style={[styles.linkModalHint, { color: '#e67e22', marginBottom: 12 }]}>
              Editing a confirmed match resets the score for re-confirmation by both players.
            </Text>
          )}
          <View style={editScoreStyles.headerRow}>
            <Text style={editScoreStyles.headerSet}>Set</Text>
            <Text style={editScoreStyles.headerName} numberOfLines={1}>{p1Name}</Text>
            <Text style={editScoreStyles.headerName} numberOfLines={1}>{p2Name}</Text>
          </View>
          {sets.map((s, i) => (
            <View key={i} style={editScoreStyles.setRow}>
              <Text style={editScoreStyles.setLabel}>Set {i + 1}</Text>
              <TextInput
                style={editScoreStyles.setInput}
                value={s.p1}
                onChangeText={(v) => updateSet(i, 'p1', v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor="#aaa"
              />
              <TextInput
                style={editScoreStyles.setInput}
                value={s.p2}
                onChangeText={(v) => updateSet(i, 'p2', v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor="#aaa"
              />
            </View>
          ))}
          <View style={editScoreStyles.setActionRow}>
            {sets.length < 5 && (
              <TouchableOpacity onPress={() => onChangeSets([...sets, { p1: '', p2: '' }])}>
                <Text style={editScoreStyles.addSetText}>+ Add Set</Text>
              </TouchableOpacity>
            )}
            {sets.length > 1 && (
              <TouchableOpacity onPress={() => onChangeSets(sets.slice(0, -1))}>
                <Text style={editScoreStyles.removeSetText}>− Remove Set</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, { marginTop: 16 }, saving && styles.btnDisabled]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Save Score</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkCancelBtn} onPress={onCancel}>
            <Text style={styles.linkCancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { match, loading } = useMatch(id ?? null);
  const { user, divisionId } = useAppStore();
  const [currentTip, setCurrentTip] = useState<{ title: string; body: string } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [managing, setManaging] = useState(false);
  const [showEditScore, setShowEditScore] = useState(false);
  const [editSets, setEditSets] = useState<{ p1: string; p2: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  // Link opponent modal state
  const [showLinkOpponent, setShowLinkOpponent] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<User[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const isParticipant = !!(user && match && (match.player1Id === user.id || match.player2Id === user.id));
  const myPlayerKey = user && match ? (match.player1Id === user.id ? 'player1' : 'player2') : null;
  const isAdminOrLeader = user?.role === 'division_leader' || user?.role === 'admin';
  const canManage = isParticipant || isAdminOrLeader;

  // Derived report-submission state
  const submission = match?.reportSubmission;
  const iSubmitted = !!(submission && submission.submittedBy === user?.id);
  const opponentSubmitted = !!(submission && submission.submittedBy !== user?.id);
  const isPendingMyReview = opponentSubmitted && submission?.status === 'pending_confirmation';

  async function handleUndo() {
    if (!match || !id || scoring) return;
    setScoring(true);
    try {
      await undoLastPoint(id, match);
    } finally {
      setScoring(false);
    }
  }

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

  function openManage() {
    setShowPostponeOptions(false);
    setShowManage(true);
  }

  async function handleCancelMatch() {
    if (!id) return;
    Alert.alert('Cancel Match?', 'This match will be marked as cancelled.', [
      { text: 'Keep Playing', style: 'cancel' },
      {
        text: 'Cancel Match', style: 'destructive', onPress: async () => {
          setManaging(true);
          try { await cancelMatch(id); setShowManage(false); }
          finally { setManaging(false); }
        },
      },
    ]);
  }

  async function handleDeleteMatch() {
    if (!id || !match) return;
    const isCompleted = match.status === 'completed';
    Alert.alert(
      'Delete Match?',
      isCompleted
        ? 'Deleting a completed match will not automatically reverse its effect on rankings. Continue?'
        : 'This match and all its data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setManaging(true);
            try { await deleteMatch(id); setShowManage(false); router.back(); }
            finally { setManaging(false); }
          },
        },
      ]
    );
  }

  async function handlePostponeBy(ms: number) {
    if (!id || !match) return;
    const base = match.scheduledAt ?? Date.now();
    const newTime = base + ms;
    const label = new Date(newTime).toLocaleString();
    Alert.alert('Postpone Match?', `Reschedule to ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Postpone', onPress: async () => {
          setManaging(true);
          try { await postponeMatch(id, newTime); setShowManage(false); }
          finally { setManaging(false); }
        },
      },
    ]);
  }

  function handleOpenEditScore() {
    const existing = (match?.liveScore.sets ?? []).map((s) => ({
      p1: String(s.player1Games),
      p2: String(s.player2Games),
    }));
    setEditSets(existing.length > 0 ? existing : [{ p1: '', p2: '' }]);
    setShowManage(false);
    setShowEditScore(true);
  }

  async function handleSaveEditScore() {
    const parsed = editSets.map((s) => ({ p1: parseInt(s.p1, 10), p2: parseInt(s.p2, 10) }));
    if (parsed.some((s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0)) {
      Alert.alert('Invalid Score', 'Please enter a valid number of games for each set.');
      return;
    }
    if (!id) return;
    setEditSaving(true);
    try {
      await editMatchScore(id, parsed);
      setShowEditScore(false);
    } catch {
      Alert.alert('Error', 'Could not save score. Please try again.');
    } finally {
      setEditSaving(false);
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

  async function handleSubmitGuestReport() {
    if (!match || !id || !user) return;
    Alert.alert(
      'Finalize Match Result?',
      `Save the final score (${formatScoreDisplay(match.liveScore)})? Rankings will update immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize',
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitGuestReport(id, user.id);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }

  async function handleLinkSearch(text: string) {
    setLinkSearch(text);
    if (!divisionId || !text.trim()) { setLinkResults([]); return; }
    setLinkSearching(true);
    try {
      const results = await searchDivisionPlayers(divisionId, text);
      setLinkResults(results.filter((u) => u.id !== user?.id));
    } catch {
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
    }
  }

  async function handleLinkOpponent(opponent: User) {
    if (!match || !id) return;
    setLinking(true);
    try {
      await linkGuestOpponent(id, opponent.id, opponent.displayName ?? opponent.email ?? '', match.playerIds ?? [match.player1Id]);
      setShowLinkOpponent(false);
      setLinkSearch('');
      setLinkResults([]);
      Alert.alert('Opponent Linked!', `${opponent.displayName ?? 'Player'} has been added to this match. Rankings will update after the next match is completed.`);
    } catch {
      Alert.alert('Error', 'Could not link opponent. Please try again.');
    } finally {
      setLinking(false);
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
  const canEditScore = canManage && (match.status === 'pending_report' || match.status === 'completed');
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

      {/* Player names row */}
      <View style={styles.playerNamesRow}>
        <Text style={styles.playerNameLabel}>{p1Name}</Text>
        <Text style={styles.playerVsLabel}>vs</Text>
        <View style={styles.playerNameRight}>
          <Text style={styles.playerNameLabel}>{p2Name}</Text>
          {match.player2IsGuest && <Text style={styles.guestBadge}>Guest</Text>}
        </View>
      </View>

      {/* Match management */}
      {canManage && match.status !== 'cancelled' && (
        <TouchableOpacity style={styles.manageBtn} onPress={openManage}>
          <Text style={styles.manageBtnText}>⋯  Options</Text>
        </TouchableOpacity>
      )}

      {/* Status badge */}
      {match.status === 'in_progress' && (
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>● LIVE</Text>
        </View>
      )}

      {/* Server selection — shown before match starts */}
      {isParticipant && match.status === 'scheduled' && (
        <View style={styles.serverSelectSection}>
          <Text style={styles.serverSelectTitle}>Who is serving first?</Text>
          <View style={styles.serverSelectBtns}>
            <TouchableOpacity style={styles.serverSelectBtn} onPress={() => startMatch(id!, 'player1')}>
              <Text style={styles.serverSelectBtnText}>{p1Name}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.serverSelectBtn} onPress={() => startMatch(id!, 'player2')}>
              <Text style={styles.serverSelectBtnText}>{p2Name}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
          <TouchableOpacity
            style={[styles.undoBtn, (!match.undoSnapshot || scoring) && styles.undoBtnDisabled]}
            onPress={handleUndo}
            disabled={!match.undoSnapshot || scoring}
          >
            <Text style={styles.undoBtnText}>↩  Undo Last Point</Text>
          </TouchableOpacity>

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

      {/* Link opponent section — guest matches only */}
      {match.player2IsGuest && isParticipant && (
        <View style={styles.linkSection}>
          <Text style={styles.linkHint}>
            👤 Playing against a guest? Link their account once they join the app.
          </Text>
          <TouchableOpacity style={styles.linkBtn} onPress={() => setShowLinkOpponent(true)}>
            <Text style={styles.linkBtnText}>Link Opponent Account</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── POST-MATCH REPORT FLOW ── */}

      {/* Guest match: one-tap finalize (no opponent confirmation needed) */}
      {isParticipant && match.status === 'pending_report' && match.player2IsGuest && !submission && (
        <View style={styles.reportSection}>
          <Text style={styles.reportTitle}>
            {match.winner === 'player1' ? p1Name : p2Name} wins!
          </Text>
          <Text style={styles.reportScore}>{scoreDisplay}</Text>
          <Text style={styles.reportHint}>
            No opponent account — tap below to finalize the result instantly.
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmitGuestReport}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>✓ Finalize Result</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Game over, no report submitted yet */}
      {isParticipant && match.status === 'pending_report' && !match.player2IsGuest && !submission && (
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

      {/* Manage Match Modal */}
      <Modal visible={showManage} transparent animationType="slide">
        <TouchableOpacity style={styles.manageOverlay} activeOpacity={1} onPress={() => setShowManage(false)}>
          <View style={styles.manageCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.manageTitle}>
              {showPostponeOptions ? 'Postpone by…' : 'Manage Match'}
            </Text>

            {managing && <ActivityIndicator color="#1a472a" style={{ marginVertical: 8 }} />}

            {!managing && !showPostponeOptions && (
              <>
                {canEditScore && (
                  <TouchableOpacity style={styles.manageOption} onPress={handleOpenEditScore}>
                    <Text style={styles.manageOptionText}>✏  Edit Score</Text>
                  </TouchableOpacity>
                )}
                {isParticipant && match.status === 'scheduled' && (
                  <TouchableOpacity style={styles.manageOption} onPress={() => setShowPostponeOptions(true)}>
                    <Text style={styles.manageOptionText}>📅  Postpone</Text>
                  </TouchableOpacity>
                )}
                {isParticipant && (match.status === 'scheduled' || match.status === 'in_progress') && (
                  <TouchableOpacity style={styles.manageOption} onPress={handleCancelMatch}>
                    <Text style={styles.manageOptionText}>✕  Cancel Match</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.manageOption, styles.manageOptionDanger]} onPress={handleDeleteMatch}>
                  <Text style={[styles.manageOptionText, styles.manageOptionDangerText]}>🗑  Delete Match</Text>
                </TouchableOpacity>
              </>
            )}

            {!managing && showPostponeOptions && (
              <>
                {[
                  { label: '30 minutes', ms: 30 * 60 * 1000 },
                  { label: '1 hour',     ms: 60 * 60 * 1000 },
                  { label: '2 hours',    ms: 2 * 60 * 60 * 1000 },
                  { label: '1 day',      ms: 24 * 60 * 60 * 1000 },
                ].map(({ label, ms }) => (
                  <TouchableOpacity key={label} style={styles.manageOption} onPress={() => handlePostponeBy(ms)}>
                    <Text style={styles.manageOptionText}>+{label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.manageBack} onPress={() => setShowPostponeOptions(false)}>
                  <Text style={styles.manageBackText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.manageCloseBtn} onPress={() => setShowManage(false)}>
              <Text style={styles.manageCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <EditScoreModal
        visible={showEditScore}
        sets={editSets}
        onChangeSets={setEditSets}
        onSave={handleSaveEditScore}
        onCancel={() => setShowEditScore(false)}
        saving={editSaving}
        isCompleted={match.status === 'completed'}
        p1Name={p1Name}
        p2Name={p2Name}
      />

      <TipOverlay tip={currentTip} onDismiss={() => setCurrentTip(null)} />

      <DisputeModal
        visible={showDisputeConfirm}
        onConfirm={confirmDispute}
        onCancel={() => setShowDisputeConfirm(false)}
      />

      {/* Link Opponent Modal */}
      <Modal visible={showLinkOpponent} transparent animationType="slide">
        <View style={styles.linkModalOverlay}>
          <View style={styles.linkModalCard}>
            <Text style={styles.linkModalTitle}>Link Opponent Account</Text>
            <Text style={styles.linkModalHint}>
              Search for your opponent in the division and link them to this match.
            </Text>
            <View style={styles.linkSearchRow}>
              <TextInput
                style={styles.linkSearchInput}
                value={linkSearch}
                onChangeText={handleLinkSearch}
                placeholder="Search by name or email..."
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {linkSearching && <ActivityIndicator style={{ marginLeft: 8 }} color="#1a472a" />}
            </View>
            {linking && <ActivityIndicator color="#1a472a" style={{ marginVertical: 8 }} />}
            <FlatList
              data={linkResults}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 240 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.linkResultRow} onPress={() => handleLinkOpponent(item)} disabled={linking}>
                  <Text style={styles.linkResultName}>{item.displayName}</Text>
                  <Text style={styles.linkResultEmail}>{item.email}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                linkSearch.trim().length > 0 && !linkSearching
                  ? <Text style={styles.linkNoResults}>No players found.</Text>
                  : null
              }
            />
            <TouchableOpacity
              style={styles.linkCancelBtn}
              onPress={() => { setShowLinkOpponent(false); setLinkSearch(''); setLinkResults([]); }}
            >
              <Text style={styles.linkCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  serverSelectSection: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, marginBottom: 20, alignItems: 'center', gap: 14 },
  serverSelectTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  serverSelectBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  serverSelectBtn: { flex: 1, backgroundColor: '#ffdc60', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  serverSelectBtnText: { color: '#1a472a', fontWeight: '800', fontSize: 15 },
  scoreButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  pointBtn: { flex: 1, paddingVertical: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pointBtnP1: { backgroundColor: '#2d6a4f' },
  pointBtnP2: { backgroundColor: '#1b4332' },
  pointBtnDisabled: { opacity: 0.5 },
  pointBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  undoBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  undoBtnDisabled: { opacity: 0.3 },
  undoBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
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

  // Player names row
  playerNamesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 },
  playerNameLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
  playerVsLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  playerNameRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestBadge: { fontSize: 10, fontWeight: '700', color: '#ffdc60', backgroundColor: 'rgba(255,220,96,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },

  // Link opponent section
  linkSection: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, marginBottom: 16, gap: 10 },
  linkHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center' },
  linkBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  linkBtnText: { color: '#ffdc60', fontWeight: '700', fontSize: 14 },

  // Manage match
  manageBtn: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 7, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
  manageBtnText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  manageOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  manageCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 4 },
  manageTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 8 },
  manageOption: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  manageOptionText: { fontSize: 16, color: '#222', fontWeight: '500' },
  manageOptionDanger: { borderBottomWidth: 0, marginTop: 4 },
  manageOptionDangerText: { color: '#c0392b' },
  manageBack: { paddingVertical: 12 },
  manageBackText: { fontSize: 14, color: '#888' },
  manageCloseBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  manageCloseBtnText: { color: '#888', fontSize: 15 },

  // Tip overlay
  tipOverlay: { position: 'absolute', bottom: 20, left: 0, right: 0, margin: 16, backgroundColor: '#ffdc60', borderRadius: 14, padding: 16 },
  tipTitle: { color: '#1a472a', fontWeight: '800', fontSize: 15, marginBottom: 4 },
  tipBody: { color: '#1a472a', fontSize: 13 },

  // Link opponent modal
  linkModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  linkModalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '75%' },
  linkModalTitle: { fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 8 },
  linkModalHint: { fontSize: 13, color: '#666', marginBottom: 16 },
  linkSearchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  linkSearchInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15 },
  linkResultRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  linkResultName: { fontSize: 15, fontWeight: '600', color: '#222' },
  linkResultEmail: { fontSize: 13, color: '#888', marginTop: 2 },
  linkNoResults: { fontSize: 14, color: '#999', textAlign: 'center', marginVertical: 12 },
  linkCancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  linkCancelText: { color: '#888', fontSize: 15 },

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

const editScoreStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  headerSet: { flex: 1.5, fontSize: 13, fontWeight: '700', color: '#888' },
  headerName: { flex: 2, fontSize: 13, fontWeight: '700', color: '#1a472a', textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  setLabel: { flex: 1.5, fontSize: 15, fontWeight: '600', color: '#333' },
  setInput: { flex: 2, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, fontSize: 18, fontWeight: '700', textAlign: 'center', color: '#222' },
  setActionRow: { flexDirection: 'row', gap: 20, marginTop: 4, marginBottom: 8 },
  addSetText: { fontSize: 14, color: '#1a472a', fontWeight: '600' },
  removeSetText: { fontSize: 14, color: '#c0392b', fontWeight: '600' },
});
