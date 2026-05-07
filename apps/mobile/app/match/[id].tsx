import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  ScrollView,
  Switch,
  Animated,
  TextInput,
  FlatList,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import {
  useMatch,
  scorePoint,
  startMatch,
  undoLastPoint,
  cancelMatch,
  deleteMatch,
  postponeMatch,
  editMatchScore,
  submitMatchReport,
  confirmMatchReport,
  disputeMatchReport,
  submitGuestReport,
  linkGuestOpponent,
  searchDivisionPlayers,
  type PointAttribution,
} from '@tennis/firebase-client';
import {
  EMPTY_STATS,
  formatScoreDisplay,
  formatGameScore,
  getTipsForTriggers,
} from '@tennis/shared';
import { useAppStore } from '../../store/appStore';
import {
  addWearScoreInputListener,
  sendScoreToWear,
} from '../../modules/wear-os';
import type { Match, TipTrigger, User } from '@tennis/shared';


const COURT = {
  court: '#2A6F7E',
  courtDark: '#1F525C',
  scoreboard: '#0E1418',
  line: '#F2EFE6',
  amber: '#FFB44A',
  pA: '#1E88FF',
  pB: '#FF5A4E',
  ad: '#FFD23F',
  bp: '#FF7A47',
  mp: '#FF3B5C',
  ok: '#4ADE80',
};

function formatFormatLabel(match: Match): string {
  if (match.format.setsToWin >= 3) return 'Best of 5';
  if (!match.format.finalSetTiebreak) return 'Best of 3 · play-out final set';
  return 'Best of 3';
}

function getPointValue(match: Match, player: 'player1' | 'player2'): string {
  if (match.liveScore.isTiebreak && match.liveScore.tiebreakScore) {
    return String(
      player === 'player1'
        ? match.liveScore.tiebreakScore.player1Points
        : match.liveScore.tiebreakScore.player2Points,
    );
  }
  return match.liveScore.currentGame[player] === 'Ad'
    ? 'AD'
    : match.liveScore.currentGame[player] === '0'
      ? '0'
      : match.liveScore.currentGame[player];
}

function getStatusState(match: Match): { label: string; player?: 'player1' | 'player2'; color: string; tone: string; sideChange: boolean; flags: Partial<Record<'player1' | 'player2', string>> } {
  const score = match.liveScore;
  const currentSet = score.sets[score.currentSet];
  const p1Point = score.currentGame.player1;
  const p2Point = score.currentGame.player2;
  const isP1Ad = p1Point === 'Ad';
  const isP2Ad = p2Point === 'Ad';
  const isDeuce = !score.isTiebreak && p1Point === '40' && p2Point === '40';
  const leader = isP1Ad ? 'player1' : isP2Ad ? 'player2' : undefined;
  const p1CanWinGame = score.isTiebreak
    ? false
    : p1Point === '40' || p1Point === 'Ad';
  const p2CanWinGame = score.isTiebreak
    ? false
    : p2Point === '40' || p2Point === 'Ad';
  const p1Break = p1CanWinGame && score.server === 'player2';
  const p2Break = p2CanWinGame && score.server === 'player1';
  const p1SetPoint = p1CanWinGame && currentSet.player1Games + 1 >= match.format.gamesPerSet && currentSet.player1Games + 1 - currentSet.player2Games >= 2;
  const p2SetPoint = p2CanWinGame && currentSet.player2Games + 1 >= match.format.gamesPerSet && currentSet.player2Games + 1 - currentSet.player1Games >= 2;
  const p1MatchPoint = p1SetPoint && score.player1SetsWon === match.format.setsToWin - 1;
  const p2MatchPoint = p2SetPoint && score.player2SetsWon === match.format.setsToWin - 1;
  const totalGames = score.sets.reduce((sum, set) => sum + set.player1Games + set.player2Games, 0);
  const sideChange = totalGames > 0 && totalGames % 2 === 1;

  if (score.isTiebreak) {
    return { label: 'Tiebreak · First to 7', player: undefined, color: COURT.amber, tone: 'tb', sideChange, flags: {} as Partial<Record<'player1' | 'player2', string>> };
  }
  if (p1MatchPoint || p2MatchPoint) {
    const player = p1MatchPoint ? 'player1' : 'player2';
    return { label: 'Match point', player, color: COURT.mp, tone: 'mp', sideChange, flags: { [player]: 'MP' } };
  }
  if (p1SetPoint || p2SetPoint) {
    const player = p1SetPoint ? 'player1' : 'player2';
    return { label: 'Set point', player, color: COURT.ad, tone: 'sp', sideChange, flags: { [player]: 'SP' } };
  }
  if (p1Break || p2Break) {
    const player = p1Break ? 'player1' : 'player2';
    return { label: 'Break point', player, color: COURT.bp, tone: 'bp', sideChange, flags: { [player]: 'BP' } };
  }
  if (leader) {
    return { label: 'Advantage', player: leader, color: COURT.ad, tone: 'ad', sideChange, flags: {} as Partial<Record<'player1' | 'player2', string>> };
  }
  if (isDeuce) {
    return { label: 'Deuce', player: undefined, color: COURT.line, tone: 'deuce', sideChange, flags: {} as Partial<Record<'player1' | 'player2', string>> };
  }
  if (sideChange) {
    return { label: 'Side change', player: undefined, color: COURT.ok, tone: 'ok', sideChange, flags: {} as Partial<Record<'player1' | 'player2', string>> };
  }
  return { label: 'Live', player: undefined, color: COURT.line, tone: 'live', sideChange, flags: {} as Partial<Record<'player1' | 'player2', string>> };
}

function TipOverlay({
  tip,
  onDismiss,
}: {
  tip: { title: string; body: string } | null;
  onDismiss: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!tip) return;
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(4000),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
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
            Disputing will notify your division leader to review the final score
            and resolve the disagreement.
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

function formatDuration(ms?: number): string {
  if (ms === undefined) return '—';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function statPercent(won: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((won / total) * 100)}%`;
}

function buildWearFeedback(
  match: Match,
  tipTriggers: TipTrigger[] = [],
): { feedbackTitle?: string; feedbackBody?: string; matchWinnerName?: string } {
  const p1Name = match.player1Name ?? 'Player 1';
  const p2Name = match.player2Name ?? 'Player 2';
  const winnerName =
    match.winner === 'player1'
      ? p1Name
      : match.winner === 'player2'
        ? p2Name
        : undefined;

  if (
    match.status === 'pending_report' ||
    match.status === 'completed' ||
    tipTriggers.includes('match_complete')
  ) {
    return {
      feedbackTitle: 'Match complete',
      feedbackBody: 'Check your phone to confirm the final match report.',
      ...(winnerName && { matchWinnerName: winnerName }),
    };
  }

  const tip = getTipsForTriggers(tipTriggers)[0];
  if (!tip) return {};
  return { feedbackTitle: tip.title, feedbackBody: tip.body };
}

function EditScoreModal({
  visible,
  sets,
  onChangeSets,
  onSave,
  onCancel,
  saving,
  isCompleted,
  p1Name,
  p2Name,
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
    onChangeSets(
      sets.map((s, idx) =>
        idx === i ? { ...s, [side]: val.replace(/[^0-9]/g, '') } : s,
      ),
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.linkModalOverlay}>
        <ScrollView
          contentContainerStyle={styles.linkModalCard}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.linkModalTitle}>Edit Score</Text>
          {isCompleted && (
            <Text
              style={[
                styles.linkModalHint,
                { color: '#e67e22', marginBottom: 12 },
              ]}
            >
              Editing a confirmed match resets the score for re-confirmation by
              both players.
            </Text>
          )}
          <View style={editScoreStyles.headerRow}>
            <Text style={editScoreStyles.headerSet}>Set</Text>
            <Text style={editScoreStyles.headerName} numberOfLines={1}>
              {p1Name}
            </Text>
            <Text style={editScoreStyles.headerName} numberOfLines={1}>
              {p2Name}
            </Text>
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
              <TouchableOpacity
                onPress={() => onChangeSets([...sets, { p1: '', p2: '' }])}
              >
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
            style={[
              styles.confirmBtn,
              { marginTop: 16 },
              saving && styles.btnDisabled,
            ]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>Save Score</Text>
            )}
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
  const [currentTip, setCurrentTip] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [managing, setManaging] = useState(false);
  const [showEditScore, setShowEditScore] = useState(false);
  const [editSets, setEditSets] = useState<{ p1: string; p2: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [clockTick, setClockTick] = useState(Date.now());
  // Link opponent modal state
  const [showLinkOpponent, setShowLinkOpponent] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<User[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const isParticipant = !!(
    user &&
    match &&
    (match.player1Id === user.id || match.player2Id === user.id)
  );
  const isAdminOrLeader =
    user?.role === 'division_leader' || user?.role === 'admin';
  const canManage = isParticipant || isAdminOrLeader;

  // Derived report-submission state
  const submission = match?.reportSubmission;
  const iSubmitted = !!(submission && submission.submittedBy === user?.id);
  const opponentSubmitted = !!(
    submission && submission.submittedBy !== user?.id
  );
  const isPendingMyReview =
    opponentSubmitted && submission?.status === 'pending_confirmation';

  async function handleUndo() {
    if (!match || !id || scoring) return;
    setScoring(true);
    try {
      await undoLastPoint(id, match);
    } finally {
      setScoring(false);
    }
  }

  async function handlePoint(player: 'player1' | 'player2', pointAttribution?: PointAttribution) {
    if (!match || !id || scoring) return;
    setScoring(true);
    try {
      const result = await scorePoint(id, match, player, pointAttribution);
      const p1 = match.player1Name ?? 'Player 1';
      const p2 = match.player2Name ?? 'Player 2';
      await sendScoreToWear(result.nextScore, {
        status: result.matchWinner ? 'pending_report' : match.status,
        player1Name: p1,
        player2Name: p2,
        ...buildWearFeedback(
          {
            ...match,
            liveScore: result.nextScore,
            ...(result.matchWinner && {
              status: 'pending_report' as const,
              winner: result.matchWinner,
            }),
          },
          result.tips,
        ),
      });
      if (match.tipsEnabled && result.tips.length > 0) {
        const tips = getTipsForTriggers(result.tips);
        if (tips.length > 0) setCurrentTip(tips[0]);
      }
      if (result.matchWinner) {
        Alert.alert(
          'Match Over!',
          `${result.matchWinner === 'player1' ? p1 : p2} wins!\n\nEither player can now submit the match report.`,
        );
      }
    } finally {
      setScoring(false);
    }
  }


  function showPointTypeMenu(player: 'player1' | 'player2') {
    if (!match?.advancedStatsEnabled) {
      void handlePoint(player);
      return;
    }

    Alert.alert('Point type', 'Attribute this point for advanced stats.', [
      { text: 'Ace', onPress: () => void handlePoint(player, 'ace') },
      { text: 'Winner', onPress: () => void handlePoint(player, 'winner') },
      {
        text: 'Opponent error',
        onPress: () => void handlePoint(player, 'opponent_error'),
      },
    ]);
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
        text: 'Cancel Match',
        style: 'destructive',
        onPress: async () => {
          setManaging(true);
          try {
            await cancelMatch(id);
            setShowManage(false);
          } finally {
            setManaging(false);
          }
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
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setManaging(true);
            try {
              await deleteMatch(id);
              setShowManage(false);
              router.back();
            } finally {
              setManaging(false);
            }
          },
        },
      ],
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
        text: 'Postpone',
        onPress: async () => {
          setManaging(true);
          try {
            await postponeMatch(id, newTime);
            setShowManage(false);
          } finally {
            setManaging(false);
          }
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
    const parsed = editSets.map((s) => ({
      p1: parseInt(s.p1, 10),
      p2: parseInt(s.p2, 10),
    }));
    if (
      parsed.some((s) => isNaN(s.p1) || isNaN(s.p2) || s.p1 < 0 || s.p2 < 0)
    ) {
      Alert.alert(
        'Invalid Score',
        'Please enter a valid number of games for each set.',
      );
      return;
    }
    if (parsed.some((s) => s.p1 === s.p2)) {
      Alert.alert(
        'Invalid Score',
        'Each set must have a clear winner. Check the set scores.',
      );
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
      ],
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
      ],
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
      ],
    );
  }

  async function handleLinkSearch(text: string) {
    setLinkSearch(text);
    if (!divisionId || !text.trim()) {
      setLinkResults([]);
      return;
    }
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
      await linkGuestOpponent(
        id,
        opponent.id,
        opponent.displayName ?? opponent.email ?? '',
        match.playerIds ?? [match.player1Id],
      );
      setShowLinkOpponent(false);
      setLinkSearch('');
      setLinkResults([]);
      Alert.alert(
        'Opponent Linked!',
        `${opponent.displayName ?? 'Player'} has been added to this match. Rankings will update after the next match is completed.`,
      );
    } catch {
      Alert.alert('Error', 'Could not link opponent. Please try again.');
    } finally {
      setLinking(false);
    }
  }

  async function handleShareReport() {
    if (!match?.reportUrl) {
      Alert.alert(
        'Report Not Ready',
        'The match report is being generated. Try again in a moment.',
      );
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

  useEffect(() => {
    if (match?.status !== 'in_progress') return;
    const timer = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [match?.status]);

  useEffect(() => {
    if (!match) return;
    const p1Name = match.player1Name ?? 'Player 1';
    const p2Name = match.player2Name ?? 'Player 2';
    void sendScoreToWear(match.liveScore, {
      status: match.status,
      player1Name: p1Name,
      player2Name: p2Name,
      ...buildWearFeedback(match),
    });
  }, [match]);

  useEffect(() => {
    if (!isParticipant || match?.status !== 'in_progress') return;
    const subscription = addWearScoreInputListener((event) => {
      if (event.action === 'undo') {
        void handleUndo();
        return;
      }
      if (event.player) void handlePoint(event.player);
    });
    return () => subscription.remove();
  }, [isParticipant, match?.status, handlePoint]);

  if (loading || !match) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    );
  }

  const scoreDisplay = formatScoreDisplay(match.liveScore);
  const gameDisplay = formatGameScore(match.liveScore);
  const p1Name = match.player1Name ?? 'Player 1';
  const p2Name = match.player2Name ?? 'Player 2';
  const p1Stats = { ...EMPTY_STATS, ...match.stats.player1 };
  const p2Stats = { ...EMPTY_STATS, ...match.stats.player2 };
  const canEditScore =
    canManage &&
    (match.status === 'pending_report' || match.status === 'completed');
  const currentSetLabel = `Set ${match.liveScore.currentSet + 1} · ${formatFormatLabel(match)}`;
  const p1Point = getPointValue(match, 'player1');
  const p2Point = getPointValue(match, 'player2');
  const statusState = getStatusState(match);
  const statusPlayerName =
    statusState.player === 'player1'
      ? p1Name
      : statusState.player === 'player2'
        ? p2Name
        : undefined;
  const p1ServeState =
    match.liveScore.server === 'player1'
      ? `Serving · ${match.liveScore.serviceSide === 'advantage' ? 'Ad' : 'Deuce'} court`
      : 'Receiving';
  const p2ServeState =
    match.liveScore.server === 'player2'
      ? `Serving · ${match.liveScore.serviceSide === 'advantage' ? 'Ad' : 'Deuce'} court`
      : 'Receiving';
  const elapsedMs =
    match.matchDurationMs ??
    (match.startedAt && match.status === 'in_progress'
      ? clockTick - match.startedAt
      : undefined);
  const currentSetElapsedMs =
    match.status === 'in_progress' && match.currentSetStartedAt
      ? clockTick - match.currentSetStartedAt
      : match.liveScore.sets[match.liveScore.currentSet]?.durationMs;
  const totalPoints = p1Stats.servicePointsTotal + p1Stats.receivingPointsTotal;
  const winnerName = match.winner === 'player1' ? p1Name : match.winner === 'player2' ? p2Name : undefined;
  const scoreRows = match.liveScore.sets
    .filter((set) => set.winner !== undefined || set.setNumber === match.liveScore.currentSet)
    .slice(0, 3);
  const showCourtSurface = isParticipant && match.status === 'in_progress';
  const showSetupSurface = isParticipant && match.status === 'scheduled';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {showSetupSurface ? (
        <View style={styles.setupSurface}>
          <View style={styles.setupTopRow}>
            <Text style={styles.setupEyebrow}>NEW MATCH</Text>
            <Text style={styles.setupNoLogin}>No login required</Text>
          </View>
          <Text style={styles.setupHero}>{`Score first.\nSave later.`}</Text>
          <Text style={styles.setupSectionLabel}>PLAYERS</Text>
          <View style={styles.setupPlayersRow}>
            <Pressable
              style={[styles.setupPlayerCard, styles.setupPlayerCardP1]}
              onPress={() => startMatch(id!, 'player1', advancedStatsEnabled, match.liveScore)}
              accessibilityRole="button"
              accessibilityLabel={`${p1Name} serves first`}
            >
              <Text style={styles.setupPlayerRole}>SERVES FIRST</Text>
              <Text style={styles.setupPlayerName}>{p1Name}</Text>
              <View style={[styles.setupPlayerLine, { backgroundColor: COURT.pA }]} />
            </Pressable>
            <Text style={styles.setupVs}>VS</Text>
            <Pressable
              style={styles.setupPlayerCard}
              onPress={() => startMatch(id!, 'player2', advancedStatsEnabled, match.liveScore)}
              accessibilityRole="button"
              accessibilityLabel={`${p2Name} serves first`}
            >
              <Text style={styles.setupPlayerRole}>PLAYER</Text>
              <Text style={styles.setupPlayerName}>{p2Name}</Text>
              <View style={[styles.setupPlayerLine, { backgroundColor: COURT.pB }]} />
            </Pressable>
          </View>
          <Text style={styles.setupHint}>TAP A NAME TO PICK SERVER</Text>
          <Text style={styles.setupSectionLabel}>FORMAT</Text>
          <View style={styles.formatRow}>
            <View style={[styles.formatCard, styles.formatCardActive]}>
              <Text style={styles.formatTitle}>{formatFormatLabel(match)}</Text>
              <Text style={styles.formatSubtitle}>Standard</Text>
            </View>
            <View style={styles.formatCard}>
              <Text style={styles.formatTitleMuted}>Best of 5</Text>
              <Text style={styles.formatSubtitleMuted}>Long match</Text>
            </View>
            <View style={styles.formatCard}>
              <Text style={styles.formatTitleMuted}>Bo3 + MTB</Text>
              <Text style={styles.formatSubtitleMuted}>10-pt 3rd set</Text>
            </View>
          </View>
          <Text style={styles.setupSectionLabel}>OPTIONS</Text>
          <View style={styles.courtOptionRow}>
            <View style={styles.statToggleCopy}>
              <Text style={styles.statToggleTitle}>Track advanced stats</Text>
              <Text style={styles.statToggleHint}>Adds aces, winners, and errors to the report.</Text>
            </View>
            <Switch
              value={advancedStatsEnabled}
              onValueChange={setAdvancedStatsEnabled}
              trackColor={{ true: COURT.ok, false: '#2B3338' }}
              thumbColor="#F2EFE6"
            />
          </View>
          <TouchableOpacity
            style={styles.startMatchKey}
            onPress={() => startMatch(id!, 'player1', advancedStatsEnabled, match.liveScore)}
          >
            <Text style={styles.startMatchKeyText}>START MATCH</Text>
          </TouchableOpacity>
          <Text style={styles.setupFooter}>1 tap · 0 navigation · Live in &lt; 5 sec</Text>
        </View>
      ) : (
        <>
          <View style={styles.courtHeaderRow}>
            <View>
              <Text style={styles.courtTitle}>Live scoring</Text>
              <Text style={styles.courtSubtitle}>{match.status === 'pending_report' ? 'Final' : currentSetLabel}</Text>
            </View>
            {canManage && match.status !== 'cancelled' && (
              <TouchableOpacity style={styles.courtOptionsBtn} onPress={openManage}>
                <Text style={styles.courtOptionsText}>⋮</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.scoreboardPanel}>
            <View style={styles.scoreboardMetaRow}>
              <Text style={styles.livePanelLabel}>● LIVE</Text>
              <Text style={styles.panelTimer}>{formatDuration(elapsedMs)}</Text>
            </View>
            {['player1', 'player2'].map((player) => {
              const isP1 = player === 'player1';
              return (
                <View key={player} style={[styles.panelScoreRow, !isP1 && styles.panelScoreRowDivider]}>
                  <View style={styles.panelNameCell}>
                    {match.liveScore.server === player && <Text style={styles.serverDot}>●</Text>}
                    <View style={[styles.panelColorBar, { backgroundColor: isP1 ? COURT.pA : COURT.pB }]} />
                    <Text style={styles.panelNameText} numberOfLines={1}>{isP1 ? p1Name : p2Name}</Text>
                  </View>
                  <View style={styles.panelSetsCell}>
                    {scoreRows.map((set) => (
                      <Text key={set.setNumber} style={styles.panelSetNumber}>
                        {isP1 ? set.player1Games : set.player2Games}
                      </Text>
                    ))}
                  </View>
                  <Text
                    style={[styles.panelPointNumber, (isP1 ? p1Point : p2Point) === 'AD' && styles.panelAdNumber]}
                    accessibilityLabel={`${isP1 ? p1Name : p2Name} score ${isP1 ? p1Point : p2Point}`}
                  >
                    {isP1 ? p1Point : p2Point}
                  </Text>
                </View>
              );
            })}
          </View>

          {showCourtSurface && (
            <View style={styles.courtSurface}>
              <View style={styles.courtLineVerticalLeft} />
              <View style={styles.courtLineVerticalCenter} />
              <View style={styles.courtLineVerticalRight} />
              <View style={styles.courtLineHorizontal} />
              <View style={[styles.statusPill, { borderColor: statusState.color, backgroundColor: `${statusState.color}22` }]}>
                <Text style={[styles.statusPillText, { color: statusState.color }]}>• {statusState.label}{statusPlayerName ? ` · ${statusPlayerName}` : ''}</Text>
              </View>
              <View style={styles.tapZonesRow}>
                <Pressable
                  style={({ pressed }) => [styles.tapZone, styles.tapZoneP1, pressed && styles.tapZonePressed]}
                  onPress={() => handlePoint('player1')}
                  onLongPress={() => showPointTypeMenu('player1')}
                  disabled={scoring}
                  accessibilityRole="button"
                  accessibilityLabel={`Log point for ${p1Name}`}
                >
                  {statusState.flags.player1 && <Text style={[styles.flagPill, { backgroundColor: statusState.color }]}>{statusState.flags.player1}</Text>}
                  <Text style={styles.tapZoneName}>{p1Name}</Text>
                  <Text style={styles.tapZoneScore}>{p1Point}</Text>
                  <Text style={styles.tapZoneSub}>{p1ServeState}</Text>
                  <Text style={styles.tapZoneFooter}>Tap · won point</Text>
                </Pressable>
                <View style={styles.netCord}><Text style={styles.vsKnot}>VS</Text></View>
                <Pressable
                  style={({ pressed }) => [styles.tapZone, styles.tapZoneP2, pressed && styles.tapZonePressed]}
                  onPress={() => handlePoint('player2')}
                  onLongPress={() => showPointTypeMenu('player2')}
                  disabled={scoring}
                  accessibilityRole="button"
                  accessibilityLabel={`Log point for ${p2Name}`}
                >
                  {statusState.flags.player2 && <Text style={[styles.flagPill, styles.flagPillRight, { backgroundColor: statusState.color }]}>{statusState.flags.player2}</Text>}
                  <Text style={styles.tapZoneName}>{p2Name}</Text>
                  <Text style={styles.tapZoneScore}>{p2Point}</Text>
                  <Text style={styles.tapZoneSub}>{p2ServeState}</Text>
                  <Text style={styles.tapZoneFooter}>Tap · won point</Text>
                </Pressable>
              </View>
              <View style={styles.bottomCourtBar}>
                <Text style={styles.bottomIcon}>↺</Text>
                <Text style={styles.bottomIcon}>⇄</Text>
                <TouchableOpacity
                  style={[styles.holdUndoKey, (!match.undoSnapshot || scoring) && styles.holdUndoDisabled]}
                  onLongPress={handleUndo}
                  delayLongPress={1000}
                  disabled={!match.undoSnapshot || scoring}
                  accessibilityRole="button"
                  accessibilityLabel="Hold to undo the last point"
                >
                  <Text style={styles.holdUndoTitle}>↩  {match.undoSnapshot ? 'Hold to undo' : 'Nothing to undo'}</Text>
                  <Text style={styles.holdUndoHint}>{match.undoSnapshot ? `Current score · ${gameDisplay}` : 'Last-point reversal unavailable'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tipsRowCourt}>
                <Text style={styles.tipsLabel}>Live tips</Text>
                <Switch
                  value={match.tipsEnabled}
                  onValueChange={toggleTips}
                  trackColor={{ true: COURT.amber, false: '#2B3338' }}
                  thumbColor="#F2EFE6"
                />
              </View>
            </View>
          )}

          {match.status === 'pending_report' && winnerName && (
            <View style={styles.matchCompleteCard}>
              <Text style={styles.matchCompleteIcon}>✓</Text>
              <Text style={styles.matchCompleteLabel}>MATCH COMPLETE</Text>
              <Text style={styles.matchCompleteWinner}>{winnerName}</Text>
              <Text style={styles.matchCompleteScore}>{scoreDisplay}</Text>
              <Text style={styles.matchCompleteMeta}>{formatDuration(elapsedMs)} · {totalPoints || '—'} points</Text>
              <View style={styles.matchCompleteActions}>
                <TouchableOpacity style={styles.summaryShareBtn} onPress={handleShareReport}>
                  <Text style={styles.summaryShareText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryNewBtn} onPress={() => router.back()}>
                  <Text style={styles.summaryNewText}>New match</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* Link opponent section — guest matches only */}
      {match.player2IsGuest && isParticipant && (
        <View style={styles.linkSection}>
          <Text style={styles.linkHint}>
            👤 Playing against a guest? Link their account once they join the
            app.
          </Text>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => setShowLinkOpponent(true)}
          >
            <Text style={styles.linkBtnText}>Link Opponent Account</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── POST-MATCH REPORT FLOW ── */}

      {/* Guest match: one-tap finalize (no opponent confirmation needed) */}
      {isParticipant &&
        match.status === 'pending_report' &&
        match.player2IsGuest &&
        !submission && (
          <View style={styles.reportSection}>
            <Text style={styles.reportTitle}>
              {match.winner === 'player1' ? p1Name : p2Name} wins!
            </Text>
            <Text style={styles.reportScore}>{scoreDisplay}</Text>
            <Text style={styles.reportHint}>Match time: {formatDuration(elapsedMs)}</Text>
            <Text style={styles.reportHint}>
              No opponent account — tap below to finalize the result instantly.
            </Text>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
              onPress={handleSubmitGuestReport}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>✓ Finalize Result</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      {/* Game over, no report submitted yet */}
      {isParticipant &&
        match.status === 'pending_report' &&
        !match.player2IsGuest &&
        !submission && (
          <View style={styles.reportSection}>
            <Text style={styles.reportTitle}>
              {match.winner === 'player1' ? p1Name : p2Name} wins!
            </Text>
            <Text style={styles.reportScore}>{scoreDisplay}</Text>
            <Text style={styles.reportHint}>
              Either player can submit the final score report. Your opponent
              will be notified to confirm.
            </Text>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
              onPress={handleSubmitReport}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>📋 Submit Match Report</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      {/* I submitted — waiting for opponent */}
      {isParticipant &&
        match.status === 'pending_report' &&
        iSubmitted &&
        submission?.status === 'pending_confirmation' && (
          <View style={styles.reportSection}>
            <Text style={styles.reportTitle}>Report Submitted</Text>
            <Text style={styles.reportScore}>{scoreDisplay}</Text>
            <View style={styles.waitingBadge}>
              <Text style={styles.waitingText}>
                ⏳ Waiting for opponent to confirm
              </Text>
            </View>
            <Text style={styles.reportHint}>
              Your opponent has been notified. Once they confirm, the report
              will be finalised and rankings updated.
            </Text>
          </View>
        )}

      {/* Opponent submitted — I need to review */}
      {isParticipant && isPendingMyReview && (
        <View style={styles.reportSection}>
          <Text style={styles.reportTitle}>Review Match Report</Text>
          <Text style={styles.reportScore}>{scoreDisplay}</Text>
          <Text style={styles.reportHint}>
            Your opponent submitted the final score above. Confirm if it's
            correct, or dispute to escalate to your division leader.
          </Text>
          <TouchableOpacity
            style={[styles.confirmBtn, submitting && styles.btnDisabled]}
            onPress={handleConfirmReport}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>✓ Confirm Score</Text>
            )}
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
            The match score has been escalated to your division leader for
            resolution. You'll be notified once it's resolved.
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
            <Text style={styles.confirmedText}>
              ✓ Score confirmed · Rankings updated
            </Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareReport}>
            <Text style={styles.shareBtnText}>📊 Share Match Report</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Match statistics — live-scored completed matches only */}
      {match.status === 'completed' &&
        match.source !== 'manual' &&
        match.stats && (
          <View style={statsStyles.section}>
            <Text style={statsStyles.title}>Match Statistics</Text>
            <View style={statsStyles.headerRow}>
              <Text style={statsStyles.headerStat} />
              <Text
                style={[statsStyles.headerPlayer, { textAlign: 'right' }]}
                numberOfLines={1}
              >
                {p1Name}
              </Text>
              <Text
                style={[statsStyles.headerPlayer, { textAlign: 'right' }]}
                numberOfLines={1}
              >
                {p2Name}
              </Text>
            </View>
            {[
              {
                label: 'Receiving Points Won',
                p1: statPercent(p1Stats.receivingPointsWon, p1Stats.receivingPointsTotal),
                p2: statPercent(p2Stats.receivingPointsWon, p2Stats.receivingPointsTotal),
              },
              {
                label: 'Break Pts Won',
                p1: `${p1Stats.breakPointsWon}/${p1Stats.breakPointsFaced}`,
                p2: `${p2Stats.breakPointsWon}/${p2Stats.breakPointsFaced}`,
              },
              ...(match.advancedStatsEnabled
                ? [
                    { label: 'Aces', p1: String(p1Stats.aces), p2: String(p2Stats.aces) },
                    { label: 'Double Faults', p1: String(p1Stats.doubleFaults), p2: String(p2Stats.doubleFaults) },
                    { label: 'Winners', p1: String(p1Stats.winners), p2: String(p2Stats.winners) },
                    { label: 'Unforced Errors', p1: String(p1Stats.unforcedErrors), p2: String(p2Stats.unforcedErrors) },
                  ]
                : []),
            ].map(({ label, p1, p2 }) => (
              <View key={label} style={statsStyles.row}>
                <Text style={statsStyles.label}>{label}</Text>
                <Text style={statsStyles.val}>{p1}</Text>
                <Text style={statsStyles.val}>{p2}</Text>
              </View>
            ))}
            <View style={statsStyles.durationBlock}>
              <Text style={statsStyles.durationTitle}>Elapsed Time</Text>
              {match.liveScore.sets
                .filter((set) => set.winner || set.setNumber === match.liveScore.currentSet)
                .map((set) => (
                  <Text key={set.setNumber} style={statsStyles.durationText}>
                    Set {set.setNumber + 1}: {formatDuration(set.durationMs ?? (set.setNumber === match.liveScore.currentSet ? currentSetElapsedMs : undefined))}
                  </Text>
                ))}
              <Text style={statsStyles.durationText}>Match: {formatDuration(elapsedMs)}</Text>
            </View>
          </View>
        )}

      {/* Manage Match Modal */}
      <Modal visible={showManage} transparent animationType="slide">
        <TouchableOpacity
          style={styles.manageOverlay}
          activeOpacity={1}
          onPress={() => setShowManage(false)}
        >
          <View
            style={styles.manageCard}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.manageTitle}>
              {showPostponeOptions ? 'Postpone by…' : 'Manage Match'}
            </Text>

            {managing && (
              <ActivityIndicator
                color="#1a472a"
                style={{ marginVertical: 8 }}
              />
            )}

            {!managing && !showPostponeOptions && (
              <>
                {canEditScore && (
                  <TouchableOpacity
                    style={styles.manageOption}
                    onPress={handleOpenEditScore}
                  >
                    <Text style={styles.manageOptionText}>✏ Edit Score</Text>
                  </TouchableOpacity>
                )}
                {isParticipant && match.status === 'scheduled' && (
                  <TouchableOpacity
                    style={styles.manageOption}
                    onPress={() => setShowPostponeOptions(true)}
                  >
                    <Text style={styles.manageOptionText}>📅 Postpone</Text>
                  </TouchableOpacity>
                )}
                {isParticipant &&
                  (match.status === 'scheduled' ||
                    match.status === 'in_progress') && (
                    <TouchableOpacity
                      style={styles.manageOption}
                      onPress={handleCancelMatch}
                    >
                      <Text style={styles.manageOptionText}>
                        ✕ Cancel Match
                      </Text>
                    </TouchableOpacity>
                  )}
                <TouchableOpacity
                  style={[styles.manageOption, styles.manageOptionDanger]}
                  onPress={handleDeleteMatch}
                >
                  <Text
                    style={[
                      styles.manageOptionText,
                      styles.manageOptionDangerText,
                    ]}
                  >
                    🗑 Delete Match
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {!managing && showPostponeOptions && (
              <>
                {[
                  { label: '30 minutes', ms: 30 * 60 * 1000 },
                  { label: '1 hour', ms: 60 * 60 * 1000 },
                  { label: '2 hours', ms: 2 * 60 * 60 * 1000 },
                  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
                ].map(({ label, ms }) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.manageOption}
                    onPress={() => handlePostponeBy(ms)}
                  >
                    <Text style={styles.manageOptionText}>+{label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.manageBack}
                  onPress={() => setShowPostponeOptions(false)}
                >
                  <Text style={styles.manageBackText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.manageCloseBtn}
              onPress={() => setShowManage(false)}
            >
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
              Search for your opponent in the division and link them to this
              match.
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
              {linkSearching && (
                <ActivityIndicator style={{ marginLeft: 8 }} color="#1a472a" />
              )}
            </View>
            {linking && (
              <ActivityIndicator
                color="#1a472a"
                style={{ marginVertical: 8 }}
              />
            )}
            <FlatList
              data={linkResults}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 240 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.linkResultRow}
                  onPress={() => handleLinkOpponent(item)}
                  disabled={linking}
                >
                  <Text style={styles.linkResultName}>{item.displayName}</Text>
                  <Text style={styles.linkResultEmail}>{item.email}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                linkSearch.trim().length > 0 && !linkSearching ? (
                  <Text style={styles.linkNoResults}>No players found.</Text>
                ) : null
              }
            />
            <TouchableOpacity
              style={styles.linkCancelBtn}
              onPress={() => {
                setShowLinkOpponent(false);
                setLinkSearch('');
                setLinkResults([]);
              }}
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
  container: { flex: 1, backgroundColor: '#081014' },
  content: { padding: 18, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  setupSurface: { gap: 18, paddingBottom: 24 },
  setupTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setupEyebrow: { color: COURT.amber, fontSize: 13, fontWeight: '900', letterSpacing: 5 },
  setupNoLogin: { color: 'rgba(242,239,230,0.74)', fontSize: 14, fontWeight: '700' },
  setupHero: { color: COURT.line, fontSize: 48, lineHeight: 54, fontWeight: '900', letterSpacing: -2 },
  setupSectionLabel: { color: 'rgba(242,239,230,0.72)', fontSize: 13, fontWeight: '900', letterSpacing: 5, marginTop: 8 },
  setupPlayersRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setupPlayerCard: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(242,239,230,0.16)', backgroundColor: '#0B1114', padding: 18, justifyContent: 'space-between' },
  setupPlayerCardP1: { backgroundColor: '#061A2B', borderColor: COURT.pA },
  setupPlayerRole: { color: 'rgba(255,180,74,0.7)', fontSize: 12, fontWeight: '900', letterSpacing: 4 },
  setupPlayerName: { color: COURT.line, fontSize: 25, fontWeight: '900' },
  setupPlayerLine: { height: 5, borderRadius: 999 },
  setupVs: { color: 'rgba(242,239,230,0.55)', fontSize: 21, fontWeight: '900' },
  setupHint: { color: 'rgba(242,239,230,0.52)', textAlign: 'center', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  formatRow: { flexDirection: 'row', gap: 10 },
  formatCard: { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(242,239,230,0.14)', padding: 14, minHeight: 76, justifyContent: 'center' },
  formatCardActive: { backgroundColor: 'rgba(255,180,74,0.22)', borderColor: 'rgba(255,180,74,0.5)' },
  formatTitle: { color: COURT.line, fontWeight: '900', fontSize: 15 },
  formatSubtitle: { color: 'rgba(242,239,230,0.65)', fontWeight: '700', marginTop: 6 },
  formatTitleMuted: { color: 'rgba(242,239,230,0.42)', fontWeight: '900', fontSize: 15 },
  formatSubtitleMuted: { color: 'rgba(242,239,230,0.35)', fontWeight: '700', marginTop: 6 },
  courtOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(242,239,230,0.13)', borderRadius: 16, padding: 16, backgroundColor: '#0B1114' },
  startMatchKey: { marginTop: 140, backgroundColor: COURT.line, borderRadius: 18, paddingVertical: 24, alignItems: 'center', shadowColor: COURT.amber, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  startMatchKeyText: { color: '#081014', fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  setupFooter: { textAlign: 'center', color: 'rgba(242,239,230,0.45)', fontWeight: '700' },
  courtHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  courtTitle: { color: COURT.line, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  courtSubtitle: { color: 'rgba(242,239,230,0.72)', fontSize: 17, fontWeight: '700' },
  courtOptionsBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  courtOptionsText: { color: COURT.line, fontSize: 32, fontWeight: '900' },
  scoreboardPanel: { backgroundColor: COURT.scoreboard, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(242,239,230,0.16)', padding: 14, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  scoreboardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  livePanelLabel: { color: 'rgba(242,239,230,0.76)', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  panelTimer: { color: 'rgba(242,239,230,0.7)', fontSize: 14, fontWeight: '800', fontFamily: 'monospace' },
  panelScoreRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  panelScoreRowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(242,239,230,0.09)' },
  panelNameCell: { flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  serverDot: { color: COURT.amber, textShadowColor: COURT.amber, textShadowRadius: 10, fontSize: 18 },
  panelColorBar: { width: 5, height: 32, borderRadius: 999 },
  panelNameText: { flex: 1, color: COURT.line, fontSize: 19, fontWeight: '900' },
  panelSetsCell: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  panelSetNumber: { minWidth: 28, textAlign: 'center', color: COURT.line, fontSize: 28, fontWeight: '800', fontFamily: 'monospace' },
  panelPointNumber: { minWidth: 64, textAlign: 'right', color: COURT.line, fontSize: 36, fontWeight: '900', fontFamily: 'monospace' },
  panelAdNumber: { color: COURT.ad },
  courtSurface: { position: 'relative', minHeight: 620, paddingTop: 48, marginBottom: 18 },
  courtLineVerticalLeft: { position: 'absolute', top: 0, bottom: 92, left: '24%', width: 2, backgroundColor: 'rgba(242,239,230,0.07)' },
  courtLineVerticalCenter: { position: 'absolute', top: 0, bottom: 92, left: '50%', width: 2, backgroundColor: 'rgba(242,239,230,0.07)' },
  courtLineVerticalRight: { position: 'absolute', top: 0, bottom: 92, right: '24%', width: 2, backgroundColor: 'rgba(242,239,230,0.07)' },
  courtLineHorizontal: { position: 'absolute', left: 8, right: 8, top: '54%', height: 2, backgroundColor: 'rgba(242,239,230,0.07)' },
  statusPill: { alignSelf: 'center', borderWidth: 2, borderRadius: 13, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 24, minHeight: 34 },
  statusPillText: { fontSize: 18, fontWeight: '900' },
  tapZonesRow: { flexDirection: 'row', flex: 1, minHeight: 470 },
  tapZone: { flex: 1, borderRadius: 26, padding: 22, justifyContent: 'space-between', alignItems: 'center', minHeight: 470, shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  tapZoneP1: { backgroundColor: COURT.pA, borderTopColor: COURT.amber, borderTopWidth: 5 },
  tapZoneP2: { backgroundColor: COURT.pB, borderTopColor: COURT.amber, borderTopWidth: 5 },
  tapZonePressed: { transform: [{ translateY: 2 }, { scale: 0.99 }], opacity: 0.92 },
  tapZoneName: { alignSelf: 'flex-end', color: COURT.line, fontSize: 18, fontWeight: '900' },
  tapZoneScore: { color: '#FFFFFF', fontSize: 116, fontWeight: '900', fontFamily: 'monospace', letterSpacing: -4, textShadowColor: 'rgba(0,0,0,0.22)', textShadowRadius: 10, minWidth: 150, textAlign: 'center' },
  tapZoneSub: { color: 'rgba(255,255,255,0.72)', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  tapZoneFooter: { color: 'rgba(255,255,255,0.58)', fontSize: 15, fontWeight: '900' },
  netCord: { width: 8, backgroundColor: 'rgba(242,239,230,0.82)', marginHorizontal: 4, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  vsKnot: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', backgroundColor: 'rgba(14,20,24,0.62)', color: 'rgba(242,239,230,0.72)', fontSize: 12, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  flagPill: { position: 'absolute', top: 22, left: 18, overflow: 'hidden', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  flagPillRight: { left: undefined, right: 18 },
  bottomCourtBar: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 18 },
  bottomIcon: { color: COURT.line, fontSize: 34, fontWeight: '800', width: 48, textAlign: 'center' },
  holdUndoKey: { flex: 1, backgroundColor: '#FFD9A3', borderRadius: 20, minHeight: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  holdUndoDisabled: { opacity: 0.48 },
  holdUndoTitle: { color: '#14100B', fontSize: 22, fontWeight: '900' },
  holdUndoHint: { color: 'rgba(20,16,11,0.62)', fontSize: 14, fontWeight: '700', marginTop: 4 },
  tipsRowCourt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 12 },
  matchCompleteCard: { backgroundColor: '#202B30', borderRadius: 28, padding: 26, alignItems: 'center', gap: 12, marginBottom: 18, borderLeftWidth: 5, borderLeftColor: COURT.pA, borderRightWidth: 5, borderRightColor: COURT.pB },
  matchCompleteIcon: { width: 76, height: 76, borderRadius: 38, overflow: 'hidden', backgroundColor: 'rgba(74,222,128,0.18)', color: '#8BF0AC', textAlign: 'center', textAlignVertical: 'center', fontSize: 46, fontWeight: '900' },
  matchCompleteLabel: { color: '#8BF0AC', fontSize: 14, fontWeight: '900', letterSpacing: 3 },
  matchCompleteWinner: { color: COURT.line, fontSize: 42, fontWeight: '900' },
  matchCompleteScore: { color: COURT.line, fontSize: 28, fontWeight: '800', fontFamily: 'monospace' },
  matchCompleteMeta: { color: 'rgba(242,239,230,0.72)', fontSize: 16, fontWeight: '700' },
  matchCompleteActions: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  summaryShareBtn: { flex: 1, borderWidth: 2, borderColor: 'rgba(242,239,230,0.28)', borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  summaryShareText: { color: COURT.amber, fontSize: 18, fontWeight: '900' },
  summaryNewBtn: { flex: 1, backgroundColor: COURT.amber, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  summaryNewText: { color: '#2B1A00', fontSize: 18, fontWeight: '900' },
  scoreBoard: { alignItems: 'center', paddingVertical: 32 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginRight: 12 },
  setsScore: { color: '#fff', fontSize: 24, fontWeight: '700' },
  scoreMain: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  gameScore: {
    color: '#a8d5a2',
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 16,
  },
  serverLabel: { color: '#ffdc60', fontSize: 14, fontWeight: '600' },
  serviceSide: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
  liveBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'center',
    marginBottom: 20,
  },
  liveBadgeText: { color: '#ff6b6b', fontWeight: '700', fontSize: 13 },
  serverSelectSection: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    gap: 14,
  },
  serverSelectTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  serverSelectBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  serverSelectBtn: {
    flex: 1,
    backgroundColor: '#ffdc60',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  serverSelectBtnText: { color: '#1a472a', fontWeight: '800', fontSize: 15 },
  scoreButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  pointBtn: {
    flex: 1,
    paddingVertical: 28,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointBtnP1: { backgroundColor: '#2d6a4f' },
  pointBtnP2: { backgroundColor: '#1b4332' },
  pointBtnDisabled: { opacity: 0.5 },
  pointBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  undoBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  undoBtnDisabled: { opacity: 0.3 },
  undoBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  tipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tipsLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  statToggleCopy: { flex: 1, gap: 4 },
  statToggleTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statToggleHint: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 16 },

  // Post-match report section
  reportSection: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  reportTitle: { color: '#ffdc60', fontSize: 24, fontWeight: '800' },
  reportScore: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 1,
  },
  reportHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  submitBtn: {
    backgroundColor: '#ffdc60',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  submitBtnText: { color: '#1a472a', fontWeight: '800', fontSize: 16 },
  confirmBtn: {
    backgroundColor: '#27ae60',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disputeReportBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  disputeReportBtnText: { color: '#ffa500', fontWeight: '600', fontSize: 14 },
  waitingBadge: {
    backgroundColor: 'rgba(255,220,96,0.2)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  waitingText: { color: '#ffdc60', fontWeight: '600', fontSize: 13 },
  confirmedBadge: {
    backgroundColor: 'rgba(39,174,96,0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  confirmedText: { color: '#a8d5a2', fontWeight: '600', fontSize: 13 },
  shareBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  shareBtnText: { color: '#1a472a', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  // Disputed state
  disputedSection: {
    backgroundColor: 'rgba(192,57,43,0.2)',
    borderRadius: 16,
    padding: 24,
    gap: 10,
  },
  disputedTitle: {
    color: '#ffa500',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  disputedBody: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Player names row
  playerNamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  playerNameLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  playerVsLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  playerNameRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffdc60',
    backgroundColor: 'rgba(255,220,96,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // Link opponent section
  linkSection: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  linkHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  linkBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  linkBtnText: { color: '#ffdc60', fontWeight: '700', fontSize: 14 },

  // Manage match
  manageBtn: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  manageBtnText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  manageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  manageCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  manageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 8,
  },
  manageOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  manageOptionText: { fontSize: 16, color: '#222', fontWeight: '500' },
  manageOptionDanger: { borderBottomWidth: 0, marginTop: 4 },
  manageOptionDangerText: { color: '#c0392b' },
  manageBack: { paddingVertical: 12 },
  manageBackText: { fontSize: 14, color: '#888' },
  manageCloseBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  manageCloseBtnText: { color: '#888', fontSize: 15 },

  // Tip overlay
  tipOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    margin: 16,
    backgroundColor: '#ffdc60',
    borderRadius: 14,
    padding: 16,
  },
  tipTitle: {
    color: '#1a472a',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 4,
  },
  tipBody: { color: '#1a472a', fontSize: 13 },

  // Link opponent modal
  linkModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  linkModalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '75%',
  },
  linkModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a472a',
    marginBottom: 8,
  },
  linkModalHint: { fontSize: 13, color: '#666', marginBottom: 16 },
  linkSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  linkResultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  linkResultName: { fontSize: 15, fontWeight: '600', color: '#222' },
  linkResultEmail: { fontSize: 13, color: '#888', marginTop: 2 },
  linkNoResults: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginVertical: 12,
  },
  linkCancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  linkCancelText: { color: '#888', fontSize: 15 },

  // Dispute confirm modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#c0392b' },
  modalBody: { fontSize: 14, color: '#555', lineHeight: 20 },
  disputeBtn: {
    backgroundColor: '#c0392b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disputeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#888', fontSize: 14 },
});

const statsStyles = StyleSheet.create({
  section: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  headerStat: { flex: 2.5, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerPlayer: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  label: { flex: 2.5, fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  val: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
  },
  valBold: { fontWeight: '800', color: '#ffdc60' },
  durationBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  durationTitle: { color: '#ffdc60', fontWeight: '700', fontSize: 13, marginBottom: 6 },
  durationText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 20 },
});

const editScoreStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  headerSet: { flex: 1.5, fontSize: 13, fontWeight: '700', color: '#888' },
  headerName: {
    flex: 2,
    fontSize: 13,
    fontWeight: '700',
    color: '#1a472a',
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  setLabel: { flex: 1.5, fontSize: 15, fontWeight: '600', color: '#333' },
  setInput: {
    flex: 2,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: '#222',
  },
  setActionRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  addSetText: { fontSize: 14, color: '#1a472a', fontWeight: '600' },
  removeSetText: { fontSize: 14, color: '#c0392b', fontWeight: '600' },
});
