import React, { useState, useEffect, useRef, useCallback } from "react";
import { colors } from "../../theme";
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
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import { IconLabel, ICON_COLOR } from "../../components/AppIcon";
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
} from "@tennis/firebase-client";
import {
  EMPTY_STATS,
  formatScoreDisplay,
  formatGameScore,
  getTipsForTriggers,
  isMatchParticipant,
  canRespondToReport,
  getMatchStatusMetadata,
} from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { ScoreboardSurface } from "../../components/live-scoring/ScoreboardSurface";
import { ScoreboardSetup } from "../../components/live-scoring/ScoreboardSetup";
import { PointTypeSheet } from "../../components/live-scoring/PointTypeSheet";
import {
  SB,
  font,
  useScoreboardFonts,
} from "../../components/live-scoring/scoreboardTheme";
import {
  KeyboardAwareBottomSheet,
  KeyboardAwareScrollView,
} from "../../components/KeyboardSafeView";
import {
  addWearScoreInputListener,
  addWearSyncRequestListener,
  isWatchAppInstalled,
  launchWatchApp,
  sendScoreToWear,
} from "../../modules/wear-os";
import type { Match, Player, TipTrigger, PublicProfile } from "@tennis/shared";

function formatFormatLabel(match: Match): string {
  if (match.format.setsToWin >= 3) return "Best of 5";
  if (!match.format.finalSetTiebreak) return "Best of 3 · play-out final set";
  return "Best of 3";
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
    // Pinned to the top and transparent to touches, so a tip never covers or
    // swallows a tap on the court or the hold-to-undo key.
    <Animated.View
      style={[styles.tipOverlay, { opacity }]}
      pointerEvents="none"
    >
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
      <KeyboardAwareBottomSheet style={styles.modalOverlay}>
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
      </KeyboardAwareBottomSheet>
    </Modal>
  );
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "—";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function statPercent(won: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((won / total) * 100)}%`;
}

function buildWearFeedback(
  match: Match,
  tipTriggers: TipTrigger[] = [],
): { feedbackTitle?: string; feedbackBody?: string; matchWinnerName?: string } {
  const p1Name = match.player1Name ?? "Player 1";
  const p2Name = match.player2Name ?? "Player 2";
  const winnerName =
    match.winner === "player1"
      ? p1Name
      : match.winner === "player2"
        ? p2Name
        : undefined;

  if (
    match.status === "pending_report" ||
    match.status === "completed" ||
    tipTriggers.includes("match_complete")
  ) {
    return {
      feedbackTitle: "Match complete",
      feedbackBody: "Check your phone to confirm the final match report.",
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
  function updateSet(i: number, side: "p1" | "p2", val: string) {
    onChangeSets(
      sets.map((s, idx) =>
        idx === i ? { ...s, [side]: val.replace(/[^0-9]/g, "") } : s,
      ),
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAwareScrollView
        keyboardViewStyle={styles.linkModalOverlay}
        contentContainerStyle={styles.linkModalCard}
      >
        <Text style={styles.linkModalTitle}>Edit Score</Text>
        {isCompleted && (
          <Text
            style={[
              styles.linkModalHint,
              { color: colors.warning, marginBottom: 12 },
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
              onChangeText={(v) => updateSet(i, "p1", v)}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="0"
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={editScoreStyles.setInput}
              value={s.p2}
              onChangeText={(v) => updateSet(i, "p2", v)}
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
              onPress={() => onChangeSets([...sets, { p1: "", p2: "" }])}
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
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.confirmBtnText}>Save Score</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkCancelBtn} onPress={onCancel}>
          <Text style={styles.linkCancelText}>Cancel</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </Modal>
  );
}

export default function MatchScreen() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380 || height < 700;
  const needsScrollableCourt = compact || fontScale > 1.2;
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
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
  const [setupServer, setSetupServer] = useState<Player>("player1");
  const [swapped, setSwapped] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<Player | null>(null);
  const fontsLoaded = useScoreboardFonts();
  const [managing, setManaging] = useState(false);
  const [showEditScore, setShowEditScore] = useState(false);
  const [editSets, setEditSets] = useState<{ p1: string; p2: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [watchAppInstalled, setWatchAppInstalled] = useState(false);
  const [launchingWatch, setLaunchingWatch] = useState(false);
  const [clockTick, setClockTick] = useState(Date.now());
  // Link opponent modal state
  const [showLinkOpponent, setShowLinkOpponent] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<PublicProfile[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const isParticipant = !!(user && match && isMatchParticipant(match, user.id));
  const isAdminOrLeader =
    user?.role === "division_leader" || user?.role === "admin";
  const canManage = isParticipant || isAdminOrLeader;

  // Derived report-submission state
  const submission = match?.reportSubmission;
  const iSubmitted = !!(submission && submission.submittedBy === user?.id);
  // Only the opposing side reviews a report — never the submitter's own partner.
  const opponentSubmitted = !!(
    submission &&
    match &&
    user &&
    canRespondToReport(match, user.id, submission.submittedBy)
  );
  const isPendingMyReview =
    opponentSubmitted && submission?.status === "pending_confirmation";

  const handleUndo = useCallback(async () => {
    if (!match || !id || scoring) return;
    setScoring(true);
    try {
      await undoLastPoint(id, match);
    } catch (err) {
      console.error("Failed to undo last point:", err);
    } finally {
      setScoring(false);
    }
  }, [match, id, scoring]);

  // Kept referentially stable so the Wear listener below is not torn down and
  // re-registered on every render; the match clock re-renders once a second.
  const handlePoint = useCallback(
    async (
      player: "player1" | "player2",
      pointAttribution?: PointAttribution,
    ) => {
      if (!match || !id || scoring) return;
      setScoring(true);
      try {
        const result = await scorePoint(id, match, player, pointAttribution);
        const p1 = match.player1Name ?? "Player 1";
        const p2 = match.player2Name ?? "Player 2";
        await sendScoreToWear(result.nextScore, {
          matchId: id,
          status: result.matchWinner ? "pending_report" : match.status,
          player1Name: p1,
          player2Name: p2,
          ...buildWearFeedback(
            {
              ...match,
              liveScore: result.nextScore,
              ...(result.matchWinner && {
                status: "pending_report" as const,
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
            "Match Over!",
            `${result.matchWinner === "player1" ? p1 : p2} wins!\n\nEither player can now submit the match report.`,
          );
        }
      } catch (err) {
        console.error("Failed to score point:", err);
      } finally {
        setScoring(false);
      }
    },
    [match, id, scoring],
  );

  // With advanced stats on, a tap asks for the point type first; see PointTypeSheet.
  function requestPoint(player: Player) {
    if (match?.advancedStatsEnabled) {
      setPendingPoint(player);
      return;
    }
    void handlePoint(player);
  }

  function openManage() {
    setShowPostponeOptions(false);
    setShowManage(true);
    void refreshWatchAppInstalled();
  }

  async function handleCancelMatch() {
    if (!id) return;
    Alert.alert("Cancel Match?", "This match will be marked as cancelled.", [
      { text: "Keep Playing", style: "cancel" },
      {
        text: "Cancel Match",
        style: "destructive",
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
    const isCompleted = match.status === "completed";
    Alert.alert(
      "Delete Match?",
      isCompleted
        ? "Deleting a completed match will not automatically reverse its effect on rankings. Continue?"
        : "This match and all its data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
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
    Alert.alert("Postpone Match?", `Reschedule to ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Postpone",
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
    setEditSets(existing.length > 0 ? existing : [{ p1: "", p2: "" }]);
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
        "Invalid Score",
        "Please enter a valid number of games for each set.",
      );
      return;
    }
    if (parsed.some((s) => s.p1 === s.p2)) {
      Alert.alert(
        "Invalid Score",
        "Each set must have a clear winner. Check the set scores.",
      );
      return;
    }
    if (!id) return;
    setEditSaving(true);
    try {
      await editMatchScore(id, parsed);
      setShowEditScore(false);
    } catch {
      Alert.alert("Error", "Could not save score. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSubmitReport() {
    if (!match || !id || !user) return;
    Alert.alert(
      "Submit Match Report?",
      `Submit the final score (${formatScoreDisplay(match.liveScore)}) for confirmation by your opponent?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
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
      "Confirm Match Report?",
      "Confirming will finalise the score, update rankings, and generate the match report.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
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
      "Finalize Match Result?",
      `Save the final score (${formatScoreDisplay(match.liveScore)})? Rankings will update immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finalize",
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
    } catch (err) {
      console.error("Failed to search division players:", err);
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
    }
  }

  async function handleLinkOpponent(opponent: PublicProfile) {
    if (!match || !id) return;
    setLinking(true);
    try {
      await linkGuestOpponent(
        id,
        opponent.id,
        opponent.displayName ?? "",
        match.playerIds ?? [match.player1Id],
      );
      setShowLinkOpponent(false);
      setLinkSearch("");
      setLinkResults([]);
      Alert.alert(
        "Opponent Linked!",
        `${opponent.displayName ?? "Player"} has been added to this match. Rankings will update after the next match is completed.`,
      );
    } catch (err) {
      console.error("Failed to link opponent:", err);
      Alert.alert("Error", "Could not link opponent. Please try again.");
    } finally {
      setLinking(false);
    }
  }

  async function handleShareReport() {
    if (!match?.reportUrl) {
      Alert.alert(
        "Report Not Ready",
        "The match report is being generated. Try again in a moment.",
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
    const { updateDoc } = await import("firebase/firestore");
    const { matchDoc } = await import("@tennis/firebase-client");
    await updateDoc(matchDoc(id), { tipsEnabled: !match.tipsEnabled });
  }

  useEffect(() => {
    if (match?.status !== "in_progress") return;
    const timer = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [match?.status]);

  const refreshWatchAppInstalled = useCallback(async () => {
    setWatchAppInstalled(await isWatchAppInstalled());
  }, []);

  // Resolves false on iOS and on Android without the native module, so the
  // controls below never render where they could not work.
  useEffect(() => {
    void refreshWatchAppInstalled();
  }, [refreshWatchAppInstalled]);

  const handleLaunchWatch = useCallback(async () => {
    setLaunchingWatch(true);
    try {
      if (await launchWatchApp()) return;
      Alert.alert(
        "Could not open the watch",
        "Check that your watch is nearby, paired, and still has Tennis Score installed.",
      );
      // The watch may have gone out of range since the last check.
      await refreshWatchAppInstalled();
    } finally {
      setLaunchingWatch(false);
    }
  }, [refreshWatchAppInstalled]);

  const syncWear = useCallback(() => {
    if (!match || !id) return;
    void sendScoreToWear(match.liveScore, {
      matchId: id,
      status: match.status,
      player1Name: match.player1Name ?? "Player 1",
      player2Name: match.player2Name ?? "Player 2",
      ...buildWearFeedback(match),
    });
  }, [match, id]);

  useEffect(() => {
    syncWear();
  }, [syncWear]);

  // The watch asks for a snapshot whenever it comes to the foreground. Without an
  // answer it shows whatever it last saw until the match document next changes.
  useEffect(() => {
    const subscription = addWearSyncRequestListener(syncWear);
    return () => subscription.remove();
  }, [syncWear]);

  useEffect(() => {
    if (!isParticipant || match?.status !== "in_progress") return;
    const subscription = addWearScoreInputListener((event) => {
      if (event.matchId !== id) return;
      if (event.action === "undo") {
        void handleUndo();
        return;
      }
      if (event.player) void handlePoint(event.player);
    });
    return () => subscription.remove();
  }, [isParticipant, match?.status, id, handlePoint, handleUndo]);

  if (loading || !match) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const scoreDisplay = formatScoreDisplay(match.liveScore);
  const gameDisplay = formatGameScore(match.liveScore);
  const p1Name = match.player1Name ?? "Player 1";
  const p2Name = match.player2Name ?? "Player 2";
  const p1Stats = { ...EMPTY_STATS, ...match.stats.player1 };
  const p2Stats = { ...EMPTY_STATS, ...match.stats.player2 };
  const canEditScore =
    canManage &&
    (match.status === "pending_report" || match.status === "completed");
  const elapsedMs =
    match.matchDurationMs ??
    (match.startedAt && match.status === "in_progress"
      ? clockTick - match.startedAt
      : undefined);
  const currentSetElapsedMs =
    match.status === "in_progress" && match.currentSetStartedAt
      ? clockTick - match.currentSetStartedAt
      : match.liveScore.sets[match.liveScore.currentSet]?.durationMs;
  const showCourtSurface = isParticipant && match.status === "in_progress";
  const showSetupSurface = isParticipant && match.status === "scheduled";
  const fillScreen = showCourtSurface || showSetupSurface;
  const names = { player1: p1Name, player2: p2Name };
  const headerTitle = showSetupSurface
    ? "NEW MATCH"
    : match.status === "in_progress"
      ? `SET ${match.liveScore.currentSet + 1} · ${formatFormatLabel(match).toUpperCase()}`
      : match.status === "pending_report" || match.status === "completed"
        ? "FINAL"
        : getMatchStatusMetadata(match.status).label.toUpperCase();
  const headerClock =
    match.status === "in_progress" || match.status === "pending_report"
      ? formatDuration(elapsedMs)
      : "";

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={[
          styles.sbHeader,
          { paddingTop: Platform.OS === "ios" ? 8 : insets.top },
        ]}
      >
        <Pressable
          style={styles.sbHeaderBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={4}
        >
          <Text style={styles.sbHeaderIcon}>←</Text>
        </Pressable>
        <Text
          style={[styles.sbHeaderTitle, font(fontsLoaded, "bold")]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {headerTitle}
        </Text>
        {headerClock !== "" && (
          <Text
            style={[styles.sbHeaderClock, font(fontsLoaded, "semibold")]}
            maxFontSizeMultiplier={1.3}
          >
            {headerClock}
          </Text>
        )}
        {canManage && match.status !== "cancelled" ? (
          <Pressable
            style={styles.sbHeaderBtn}
            onPress={openManage}
            accessibilityRole="button"
            accessibilityLabel="Match options"
            hitSlop={4}
          >
            <Text style={styles.sbHeaderIcon}>⋮</Text>
          </Pressable>
        ) : (
          <View style={styles.sbHeaderBtn} />
        )}
      </View>

      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            fillScreen ? styles.fillContent : styles.scrollContent,
            {
              paddingBottom: fillScreen
                ? insets.bottom
                : Math.max(insets.bottom, 12) + 36,
            },
          ]}
          scrollEnabled={!fillScreen || needsScrollableCourt}
          bounces={!fillScreen || needsScrollableCourt}
        >
          {showSetupSurface ? (
            <ScoreboardSetup
              names={names}
              server={setupServer}
              onPickServer={setSetupServer}
              formatLabel={formatFormatLabel(match)}
              advancedStats={advancedStatsEnabled}
              onToggleAdvancedStats={setAdvancedStatsEnabled}
              onStart={() =>
                startMatch(
                  id!,
                  setupServer,
                  advancedStatsEnabled,
                  match.liveScore,
                )
              }
              watchAppInstalled={watchAppInstalled}
              launchingWatch={launchingWatch}
              onLaunchWatch={() => void handleLaunchWatch()}
              fontsLoaded={fontsLoaded}
            />
          ) : (
            <ScoreboardSurface
              match={match}
              interactive={showCourtSurface}
              compact={compact}
              fontsLoaded={fontsLoaded}
              swapped={swapped}
              onSwap={() => setSwapped((value) => !value)}
              onPoint={requestPoint}
              scoring={scoring}
              onUndo={() => void handleUndo()}
              canUndo={!!match.undoSnapshot}
              undoHint={
                match.undoSnapshot
                  ? `Current score · ${gameDisplay}`
                  : "Last-point reversal unavailable"
              }
            />
          )}

          {!fillScreen && (
            <View style={styles.sections}>
              {/* Link opponent section — guest matches only */}
              {match.player2IsGuest && isParticipant && (
                <View style={styles.linkSection}>
                  <IconLabel
                    name="person.crop.circle.badge.plus"
                    textStyle={styles.linkHint}
                  >
                    Playing against a guest? Link their account once they join
                    the app.
                  </IconLabel>
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => setShowLinkOpponent(true)}
                  >
                    <Text style={styles.linkBtnText}>
                      Link Opponent Account
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── POST-MATCH REPORT FLOW ── */}

              {/* Guest match: one-tap finalize (no opponent confirmation needed) */}
              {isParticipant &&
                match.status === "pending_report" &&
                match.player2IsGuest &&
                !submission && (
                  <View style={styles.reportSection}>
                    <Text style={styles.reportTitle}>
                      {match.winner === "player1" ? p1Name : p2Name} wins!
                    </Text>
                    <Text style={styles.reportScore}>{scoreDisplay}</Text>
                    <Text style={styles.reportHint}>
                      Match time: {formatDuration(elapsedMs)}
                    </Text>
                    <Text style={styles.reportHint}>
                      No opponent account — tap below to finalize the result
                      instantly.
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        submitting && styles.btnDisabled,
                      ]}
                      onPress={handleSubmitGuestReport}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator color={colors.surface} />
                      ) : (
                        <IconLabel
                          name="checkmark.circle"
                          textStyle={styles.submitBtnText}
                        >
                          Finalize Result
                        </IconLabel>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

              {/* Game over, no report submitted yet */}
              {isParticipant &&
                match.status === "pending_report" &&
                !match.player2IsGuest &&
                !submission && (
                  <View style={styles.reportSection}>
                    <Text style={styles.reportTitle}>
                      {match.winner === "player1" ? p1Name : p2Name} wins!
                    </Text>
                    <Text style={styles.reportScore}>{scoreDisplay}</Text>
                    <Text style={styles.reportHint}>
                      Either player can submit the final score report. Your
                      opponent will be notified to confirm.
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        submitting && styles.btnDisabled,
                      ]}
                      onPress={handleSubmitReport}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator color={colors.surface} />
                      ) : (
                        <IconLabel
                          name="doc.text"
                          textStyle={styles.submitBtnText}
                        >
                          Submit Match Report
                        </IconLabel>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

              {/* My side submitted — waiting for the opposing side. In doubles this also
          covers the submitter's partner, who cannot confirm their own team's report. */}
              {isParticipant &&
                match.status === "pending_report" &&
                !isPendingMyReview &&
                submission?.status === "pending_confirmation" && (
                  <View style={styles.reportSection}>
                    <Text style={styles.reportTitle}>Report Submitted</Text>
                    <Text style={styles.reportScore}>{scoreDisplay}</Text>
                    <View style={styles.waitingBadge}>
                      <IconLabel
                        name="hourglass"
                        color="#ffdc60"
                        textStyle={styles.waitingText}
                      >
                        Waiting for the opposing side to confirm
                      </IconLabel>
                    </View>
                    <Text style={styles.reportHint}>
                      {iSubmitted
                        ? "The opposing side has been notified. Once they confirm, the report will be finalised and rankings updated."
                        : "Your partner submitted the report. Once the opposing side confirms, it will be finalised and rankings updated."}
                    </Text>
                  </View>
                )}

              {/* Opponent submitted — I need to review */}
              {isParticipant && isPendingMyReview && (
                <View style={styles.reportSection}>
                  <Text style={styles.reportTitle}>Review Match Report</Text>
                  <Text style={styles.reportScore}>{scoreDisplay}</Text>
                  <Text style={styles.reportHint}>
                    The opposing side submitted the final score above. Confirm
                    if it's correct, or dispute to escalate to your division
                    leader.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      submitting && styles.btnDisabled,
                    ]}
                    onPress={handleConfirmReport}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <IconLabel
                        name="checkmark.circle"
                        color={ICON_COLOR.inverse}
                        textStyle={styles.confirmBtnText}
                      >
                        Confirm Score
                      </IconLabel>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.disputeReportBtn}
                    onPress={handleDisputeReport}
                    disabled={submitting}
                  >
                    <IconLabel
                      name="exclamationmark.triangle"
                      color={ICON_COLOR.warning}
                      textStyle={styles.disputeReportBtnText}
                    >
                      Dispute Score
                    </IconLabel>
                  </TouchableOpacity>
                </View>
              )}

              {/* Disputed — awaiting leader */}
              {match.status === "disputed" && (
                <View style={styles.disputedSection}>
                  <IconLabel
                    name="exclamationmark.triangle.fill"
                    color={ICON_COLOR.warning}
                    textStyle={styles.disputedTitle}
                  >
                    Score Disputed
                  </IconLabel>
                  <Text style={styles.disputedBody}>
                    The match score has been escalated to your division leader
                    for resolution. You'll be notified once it's resolved.
                  </Text>
                </View>
              )}

              {/* Confirmed / completed */}
              {match.status === "completed" && (
                <View style={styles.reportSection}>
                  <Text style={styles.reportTitle}>
                    {match.winner === "player1" ? p1Name : p2Name} wins!
                  </Text>
                  <Text style={styles.reportScore}>{scoreDisplay}</Text>
                  <View style={styles.confirmedBadge}>
                    <IconLabel
                      name="checkmark.circle.fill"
                      color="#a8d5a2"
                      textStyle={styles.confirmedText}
                    >
                      Score confirmed · Rankings updated
                    </IconLabel>
                  </View>
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={handleShareReport}
                  >
                    <IconLabel
                      name="square.and.arrow.up"
                      textStyle={styles.shareBtnText}
                    >
                      Share Match Report
                    </IconLabel>
                  </TouchableOpacity>
                </View>
              )}

              {/* Match statistics — live-scored completed matches only */}
              {match.status === "completed" &&
                match.source !== "manual" &&
                match.stats && (
                  <View style={statsStyles.section}>
                    <Text style={statsStyles.title}>Match Statistics</Text>
                    <View style={statsStyles.headerRow}>
                      <Text style={statsStyles.headerStat} />
                      <Text
                        style={[
                          statsStyles.headerPlayer,
                          { textAlign: "right" },
                        ]}
                        numberOfLines={1}
                      >
                        {p1Name}
                      </Text>
                      <Text
                        style={[
                          statsStyles.headerPlayer,
                          { textAlign: "right" },
                        ]}
                        numberOfLines={1}
                      >
                        {p2Name}
                      </Text>
                    </View>
                    {[
                      {
                        label: "Receiving Points Won",
                        p1: statPercent(
                          p1Stats.receivingPointsWon,
                          p1Stats.receivingPointsTotal,
                        ),
                        p2: statPercent(
                          p2Stats.receivingPointsWon,
                          p2Stats.receivingPointsTotal,
                        ),
                      },
                      {
                        label: "Break Pts Won",
                        p1: `${p1Stats.breakPointsWon}/${p1Stats.breakPointsFaced}`,
                        p2: `${p2Stats.breakPointsWon}/${p2Stats.breakPointsFaced}`,
                      },
                      ...(match.advancedStatsEnabled
                        ? [
                            {
                              label: "Aces",
                              p1: String(p1Stats.aces),
                              p2: String(p2Stats.aces),
                            },
                            {
                              label: "Double Faults",
                              p1: String(p1Stats.doubleFaults),
                              p2: String(p2Stats.doubleFaults),
                            },
                            {
                              label: "Winners",
                              p1: String(p1Stats.winners),
                              p2: String(p2Stats.winners),
                            },
                            {
                              label: "Unforced Errors",
                              p1: String(p1Stats.unforcedErrors),
                              p2: String(p2Stats.unforcedErrors),
                            },
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
                      <Text style={statsStyles.durationTitle}>
                        Elapsed Time
                      </Text>
                      {match.liveScore.sets
                        .filter(
                          (set) =>
                            set.winner ||
                            set.setNumber === match.liveScore.currentSet,
                        )
                        .map((set) => (
                          <Text
                            key={set.setNumber}
                            style={statsStyles.durationText}
                          >
                            Set {set.setNumber + 1}:{" "}
                            {formatDuration(
                              set.durationMs ??
                                (set.setNumber === match.liveScore.currentSet
                                  ? currentSetElapsedMs
                                  : undefined),
                            )}
                          </Text>
                        ))}
                      <Text style={statsStyles.durationText}>
                        Match: {formatDuration(elapsedMs)}
                      </Text>
                    </View>
                  </View>
                )}
            </View>
          )}
        </ScrollView>
        <TipOverlay tip={currentTip} onDismiss={() => setCurrentTip(null)} />
      </View>

      <PointTypeSheet
        playerName={pendingPoint ? names[pendingPoint] : null}
        onPick={(attribution) => {
          const player = pendingPoint;
          setPendingPoint(null);
          if (player) void handlePoint(player, attribution);
        }}
        onCancel={() => setPendingPoint(null)}
        fontsLoaded={fontsLoaded}
      />

      {/* Manage Match Modal */}
      <Modal visible={showManage} transparent animationType="slide">
        <KeyboardAwareBottomSheet style={styles.manageOverlay}>
          <View
            style={styles.manageCard}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.manageTitle}>
              {showPostponeOptions ? "Postpone by…" : "Manage Match"}
            </Text>

            {managing && (
              <ActivityIndicator
                color={SB.yellow}
                style={{ marginVertical: 8 }}
              />
            )}

            {!managing && !showPostponeOptions && (
              <>
                {isParticipant && match.status === "in_progress" && (
                  <View style={[styles.manageOption, styles.manageToggleRow]}>
                    <View style={styles.manageToggleCopy}>
                      <Text style={styles.manageOptionText}>Rule tips</Text>
                      <Text style={styles.manageToggleHint}>
                        Explain deuce, tiebreaks, and changeovers
                      </Text>
                    </View>
                    <Switch
                      value={match.tipsEnabled}
                      onValueChange={toggleTips}
                      trackColor={{ true: SB.yellow, false: SB.ballOff }}
                      thumbColor={match.tipsEnabled ? SB.onYellow : SB.muted}
                      accessibilityLabel="Rule tips"
                    />
                  </View>
                )}
                {canEditScore && (
                  <TouchableOpacity
                    style={styles.manageOption}
                    onPress={handleOpenEditScore}
                  >
                    <IconLabel
                      name="pencil"
                      color={SB.muted}
                      textStyle={styles.manageOptionText}
                    >
                      Edit Score
                    </IconLabel>
                  </TouchableOpacity>
                )}
                {watchAppInstalled &&
                  isParticipant &&
                  (match.status === "scheduled" ||
                    match.status === "in_progress") && (
                    <TouchableOpacity
                      style={styles.manageOption}
                      onPress={() => void handleLaunchWatch()}
                      disabled={launchingWatch}
                    >
                      <IconLabel
                        name="applewatch"
                        color={SB.muted}
                        textStyle={styles.manageOptionText}
                      >
                        {launchingWatch ? "Opening on watch…" : "Open on watch"}
                      </IconLabel>
                    </TouchableOpacity>
                  )}
                {isParticipant && match.status === "scheduled" && (
                  <TouchableOpacity
                    style={styles.manageOption}
                    onPress={() => setShowPostponeOptions(true)}
                  >
                    <IconLabel
                      name="calendar"
                      color={SB.muted}
                      textStyle={styles.manageOptionText}
                    >
                      Postpone
                    </IconLabel>
                  </TouchableOpacity>
                )}
                {isParticipant &&
                  (match.status === "scheduled" ||
                    match.status === "in_progress") && (
                    <TouchableOpacity
                      style={styles.manageOption}
                      onPress={handleCancelMatch}
                    >
                      <IconLabel
                        name="xmark.circle"
                        color={SB.muted}
                        textStyle={styles.manageOptionText}
                      >
                        Cancel Match
                      </IconLabel>
                    </TouchableOpacity>
                  )}
                <TouchableOpacity
                  style={[styles.manageOption, styles.manageOptionDanger]}
                  onPress={handleDeleteMatch}
                >
                  <IconLabel
                    name="trash"
                    color={SB.danger}
                    textStyle={[
                      styles.manageOptionText,
                      styles.manageOptionDangerText,
                    ]}
                  >
                    Delete Match
                  </IconLabel>
                </TouchableOpacity>
              </>
            )}

            {!managing && showPostponeOptions && (
              <>
                {[
                  { label: "30 minutes", ms: 30 * 60 * 1000 },
                  { label: "1 hour", ms: 60 * 60 * 1000 },
                  { label: "2 hours", ms: 2 * 60 * 60 * 1000 },
                  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
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
        </KeyboardAwareBottomSheet>
      </Modal>

      <EditScoreModal
        visible={showEditScore}
        sets={editSets}
        onChangeSets={setEditSets}
        onSave={handleSaveEditScore}
        onCancel={() => setShowEditScore(false)}
        saving={editSaving}
        isCompleted={match.status === "completed"}
        p1Name={p1Name}
        p2Name={p2Name}
      />

      <DisputeModal
        visible={showDisputeConfirm}
        onConfirm={confirmDispute}
        onCancel={() => setShowDisputeConfirm(false)}
      />

      {/* Link Opponent Modal */}
      <Modal visible={showLinkOpponent} transparent animationType="slide">
        <KeyboardAwareBottomSheet style={styles.linkModalOverlay}>
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
                <ActivityIndicator
                  style={{ marginLeft: 8 }}
                  color={colors.primary}
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
                    <Text style={styles.linkResultName}>
                      {item.displayName}
                    </Text>
                    <Text style={styles.linkResultEmail}>Public profile</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  linkSearch.trim().length > 0 && !linkSearching ? (
                    <Text style={styles.linkNoResults}>No players found.</Text>
                  ) : null
                }
              />
            </View>
            <TouchableOpacity
              style={styles.linkCancelBtn}
              onPress={() => {
                setShowLinkOpponent(false);
                setLinkSearch("");
                setLinkResults([]);
              }}
            >
              <Text style={styles.linkCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareBottomSheet>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SB.bg },
  sbHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 4,
    backgroundColor: SB.bg,
  },
  sbHeaderBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  sbHeaderIcon: { color: SB.text, fontSize: 26, fontWeight: "800" },
  sbHeaderTitle: { flex: 1, color: SB.text, fontSize: 19, letterSpacing: 1.5 },
  sbHeaderClock: {
    color: SB.muted,
    fontSize: 19,
    letterSpacing: 1,
    marginRight: 4,
  },
  body: { flex: 1, position: "relative" },
  scroll: { flex: 1 },
  fillContent: { flexGrow: 1 },
  scrollContent: { flexGrow: 1 },
  sections: { padding: 18, gap: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Post-match report section
  reportSection: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  reportTitle: { color: "#ffdc60", fontSize: 24, fontWeight: "800" },
  reportScore: {
    color: colors.surface,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 1,
  },
  reportHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  submitBtn: {
    backgroundColor: "#ffdc60",
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 4,
    width: "100%",
    alignItems: "center",
  },
  submitBtnText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  confirmBtn: {
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  confirmBtnText: { color: colors.surface, fontWeight: "800", fontSize: 16 },
  disputeReportBtn: {
    paddingVertical: 12,
    alignItems: "center",
    width: "100%",
  },
  disputeReportBtnText: { color: "#ffa500", fontWeight: "600", fontSize: 14 },
  waitingBadge: {
    backgroundColor: "rgba(255,220,96,0.2)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  waitingText: { color: "#ffdc60", fontWeight: "600", fontSize: 13 },
  confirmedBadge: {
    backgroundColor: "rgba(39,174,96,0.3)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  confirmedText: { color: "#a8d5a2", fontWeight: "600", fontSize: 13 },

  shareBtn: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 4,
    width: "100%",
    alignItems: "center",
  },
  shareBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  // Disputed state
  disputedSection: {
    backgroundColor: "rgba(192,57,43,0.2)",
    borderRadius: 16,
    padding: 24,
    gap: 10,
  },
  disputedTitle: {
    color: "#ffa500",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  disputedBody: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  // Player names row

  // Link opponent section
  linkSection: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  linkHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
  },
  linkBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  linkBtnText: { color: "#ffdc60", fontWeight: "700", fontSize: 14 },

  // Manage match
  manageOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  manageCard: {
    backgroundColor: SB.panel,
    borderTopWidth: 2,
    borderTopColor: SB.yellow,
    padding: 16,
    paddingBottom: 24,
    gap: 4,
    width: "100%",
  },
  manageTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
    color: SB.text,
    marginBottom: 8,
  },
  manageOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: SB.line,
    minHeight: 56,
    justifyContent: "center",
  },
  manageOptionText: { fontSize: 17, color: SB.text, fontWeight: "600" },
  manageOptionDanger: { borderBottomWidth: 0, marginTop: 4 },
  manageOptionDangerText: { color: SB.danger },
  manageToggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  manageToggleCopy: { flex: 1, gap: 2 },
  manageToggleHint: { color: SB.muted, fontSize: 13 },
  manageBack: { paddingVertical: 12 },
  manageBackText: { fontSize: 15, color: SB.muted },
  manageCloseBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: 8,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: SB.controlFill,
  },
  manageCloseBtnText: { color: SB.text, fontSize: 16, fontWeight: "700" },

  // Tip overlay
  tipOverlay: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    backgroundColor: SB.text,
    borderRadius: 6,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  tipTitle: {
    color: SB.onYellow,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 2,
  },
  tipBody: { color: SB.onYellow, fontSize: 14, lineHeight: 19 },

  // Link opponent modal
  linkModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  linkModalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    width: "100%",
  },
  linkModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 8,
  },
  linkModalHint: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  linkSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  linkSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  linkResultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  linkResultName: { fontSize: 15, fontWeight: "600", color: "#222" },
  linkResultEmail: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
  linkNoResults: {
    fontSize: 14,
    color: colors.textSubtle,
    textAlign: "center",
    marginVertical: 12,
  },
  linkCancelBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  linkCancelText: { color: colors.textSubtle, fontSize: 15 },

  // Dispute confirm modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.destructive },
  modalBody: { fontSize: 14, color: "#555", lineHeight: 20 },
  disputeBtn: {
    backgroundColor: colors.destructive,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 44,
  },
  disputeBtnText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: colors.textSubtle, fontSize: 14 },
});

const statsStyles = StyleSheet.create({
  section: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  title: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  headerRow: { flexDirection: "row", marginBottom: 6 },
  headerStat: { flex: 2.5, fontSize: 12, color: "rgba(255,255,255,0.5)" },
  headerPlayer: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  label: { flex: 2.5, fontSize: 14, color: "rgba(255,255,255,0.8)" },
  val: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
    textAlign: "right",
  },
  valBold: { fontWeight: "800", color: "#ffdc60" },
  durationBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  durationTitle: {
    color: "#ffdc60",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 6,
  },
  durationText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    lineHeight: 20,
  },
});

const editScoreStyles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  headerSet: {
    flex: 1.5,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSubtle,
  },
  headerName: {
    flex: 2,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  setLabel: { flex: 1.5, fontSize: 15, fontWeight: "600", color: colors.text },
  setInput: {
    flex: 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    color: "#222",
  },
  setActionRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  addSetText: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  removeSetText: { fontSize: 14, color: colors.destructive, fontWeight: "600" },
});
