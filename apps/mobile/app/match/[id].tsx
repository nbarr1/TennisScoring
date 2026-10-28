import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Animated,
  TextInput,
  Pressable,
  Vibration,
  useWindowDimensions,
  Platform,
} from "react-native";
import type { SymbolViewProps } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import { AppIcon, IconLabel, ICON_SIZE } from "../../components/AppIcon";
import { FormField } from "../../components/FormField";
import {
  announce,
  Button,
  Card,
  confirmAction as askToConfirm,
  confirmDestructive,
  describeError,
  ErrorState,
  InlineAlert,
  LoadingState,
  MIN_TOUCH_TARGET,
  SHOWS_PRESSED_FILL,
  radii,
  spacing,
  typography,
  useAsyncAction,
  useColors,
  makeStyles,
  useContentWidth,
} from "../../theme";
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
  resolveDisputedReport,
  submitGuestReport,
  linkGuestOpponent,
  setMatchTipsEnabled,
  searchDivisionPlayers,
  acceptMatchProposal,
  declineMatchProposal,
  requestMatchAppeal,
  decideMatchAppeal,
  type PointAttribution,
} from "@tennis/firebase-client";
import {
  EMPTY_STATS,
  formatScoreDisplay,
  getTipsForTriggers,
  isMatchParticipant,
  canRespondToReport,
  canDecideMatchAppeal,
  canRequestMatchAppeal,
  formatRecordedScoreLine,
  getMatchStatusMetadata,
  isAdminRole,
  isReportWindowClosed,
  MAX_APPEAL_NOTE_LENGTH,
  MAX_APPEAL_REASON_LENGTH,
  opposingSide,
  parseRecordedScoreLine,
  recordedSetsFromScore,
  reportConfirmationDeadline,
  sideDisplayName,
  sideOfPlayer,
  validateRecordedSets,
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
  describePoint,
  spokenSets,
  spokenUndoTarget,
  undoTargetLabel,
} from "../../components/live-scoring/scoreSpeech";
import { BottomSheetModal } from "../../components/BottomSheetModal";
import {
  addWearScoreInputListener,
  addWearSyncRequestListener,
  isWatchAppInstalled,
  launchWatchApp,
  sendScoreToWear,
  type WearScorePayload,
} from "../../modules/wear-os";
import type {
  LiveScore,
  Match,
  Player,
  TipTrigger,
  PublicProfile,
  RecordedSetInput,
} from "@tennis/shared";
import {
  MatchTiebreakToggle,
  withEligibleTiebreaks,
  type SetDraft,
} from "../../components/MatchTiebreakToggle";

type SymbolName = SymbolViewProps["name"];

/** Platform-native glyphs for the top bar: a back chevron/arrow and a menu. */
const BACK_ICON: SymbolName = { ios: "chevron.backward", android: "arrow_back" };
const MENU_ICON: SymbolName = { ios: "ellipsis.circle", android: "more_vert" };
/**
 * The screen is presented as a modal: a sheet on iOS, which is closed rather
 * than gone back from, and a full-screen push on Android, which keeps Back.
 */
const IS_IOS = Platform.OS === "ios";
const LEAVE_ICON: SymbolName = { ios: "xmark", android: "arrow_back" };
const LEAVE_LABEL = IS_IOS ? "Close" : "Back";

function formatFormatLabel(match: Match): string {
  if (match.format.setsToWin >= 3) return "Best of 5";
  if (!match.format.finalSetTiebreak) return "Best of 3 · play-out final set";
  return "Best of 3";
}

/**
 * "Ann Smith" → "Ann"; a doubles team "Ann Smith / Bob Jones" → "Ann and Bob".
 * For sentences ("so Ann can confirm it"); scoreboard rows keep full names.
 */
function casualName(name: string): string {
  if (/^Player \d$/.test(name)) return name;
  return name
    .split(" / ")
    .map((part) => part.trim().split(/\s+/)[0] ?? part)
    .join(" and ");
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A short confirming tap. Android keeps the Vibration API pulses it has always
 * used (the app holds the VIBRATE permission). iOS uses the Taptic Engine
 * through expo-haptics, since its Vibration API is a long buzz.
 */
function haptic(kind: "point" | "undo" | "error"): void {
  try {
    if (Platform.OS === "ios") {
      const feedback =
        kind === "error"
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          : Haptics.impactAsync(
              kind === "undo"
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light,
            );
      feedback.catch(() => undefined);
      return;
    }
    if (Platform.OS !== "android") return;
    Vibration.vibrate(
      kind === "error" ? [0, 40, 70, 40] : kind === "undo" ? 30 : 15,
    );
  } catch {
    // Feedback is best-effort.
  }
}

function TipOverlay({
  tip,
  onDismiss,
}: {
  tip: { title: string; body: string } | null;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!tip) return;
    // The overlay cannot take focus (it must never swallow a tap), so a
    // screen reader hears the tip instead.
    announce(`${tip.title}. ${tip.body}`);
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
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={styles.tipTitle}>{tip.title}</Text>
      <Text style={styles.tipBody}>{tip.body}</Text>
    </Animated.View>
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

function spokenDuration(ms?: number): string {
  if (ms === undefined) return "not recorded";
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minutes`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** The current time, refreshed once a second while `active`. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * A duration that counts up from `since` while it is set, or shows the fixed
 * `ms` otherwise. It owns the once-a-second tick, so only this text
 * re-renders as the clock runs, not the whole match screen.
 */
function ElapsedText({
  since,
  ms,
  prefix = "",
  spokenPrefix = prefix,
  style,
  maxFontSizeMultiplier,
}: {
  since?: number;
  ms?: number;
  prefix?: string;
  spokenPrefix?: string;
  style?: React.ComponentProps<typeof Text>["style"];
  maxFontSizeMultiplier?: number;
}) {
  const now = useClock(since !== undefined);
  const value = since !== undefined ? now - since : ms;
  return (
    <Text
      style={style}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessibilityLabel={`${spokenPrefix}${spokenDuration(value)}`}
    >
      {`${prefix}${formatDuration(value)}`}
    </Text>
  );
}

function statPercent(won: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((won / total) * 100)}%`;
}

// Identifies one tap for scoreMatchPoint's duplicate check. Hermes has no
// crypto.randomUUID, and uniqueness only has to hold within one match.
function newPointId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// scoreMatchPoint refuses a match that is no longer scheduled or in progress,
// for example when the opponent's device just finished it. Retrying cannot help.
function isNoLongerLiveError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "functions/failed-precondition";
}

const CONNECTION_HINT = "Check your connection, then try again.";

/** Same pause as PlayerSlotPicker, so typing a name sends one search. */
const SEARCH_DEBOUNCE_MS = 300;

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

/** A clubhouse card under the scoreboard: the next step for this player. */
function Panel({
  title,
  fontsLoaded,
  children,
}: {
  title?: string;
  fontsLoaded: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <Card style={styles.panel}>
      {title ? (
        <Text
          style={[styles.panelTitle, font(fontsLoaded, "bold")]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

/**
 * Where a match's appeal stands, the player's request form, and the
 * reviewer's decision form. `decideMatchAppeal` checks the reviewer's role for
 * real; the flags only decide which parts to offer.
 */
function MatchAppealSection({
  match,
  matchId,
  userId,
  isAdmin,
  isDivisionLeader,
  fontsLoaded,
}: {
  match: Match;
  matchId: string;
  userId: string;
  isAdmin: boolean;
  isDivisionLeader: boolean;
  fontsLoaded: boolean;
}) {
  const styles = useStyles();
  const appeal = match.appeal;
  const p1Name = sideDisplayName(match, "player1") || "Player 1";
  const requesterSide = appeal ? sideOfPlayer(match, appeal.requestedBy) : undefined;
  const requesterName =
    appeal?.requestedBy === userId
      ? "You"
      : requesterSide
        ? sideDisplayName(match, requesterSide)
        : "A player";
  const canRequest = canRequestMatchAppeal(match, userId);
  const canDecide = canDecideMatchAppeal(match, userId, { isAdmin, isDivisionLeader });

  const [requestOpen, setRequestOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [scoreLine, setScoreLine] = useState("");
  const [note, setNote] = useState("");
  const [reviewScore, setReviewScore] = useState(() =>
    appeal?.proposedSets ? formatRecordedScoreLine(appeal.proposedSets) : "",
  );
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const request = useAsyncAction(
    async (sets?: RecordedSetInput[]) => {
      await requestMatchAppeal(matchId, reason.trim(), sets);
    },
    {
      successMessage: "Review requested. A division leader or admin will decide.",
      errorMessage: (e) => describeError(e, `Couldn't send the request. ${CONNECTION_HINT}`),
    },
  );
  const approve = useAsyncAction(
    async (sets: RecordedSetInput[]) => {
      await decideMatchAppeal(matchId, "approve", { sets, note });
    },
    {
      successMessage: "Appeal approved. The corrected score counts in the standings now.",
      errorMessage: (e) => describeError(e, `Couldn't save the decision. ${CONNECTION_HINT}`),
    },
  );
  const reject = useAsyncAction(
    async () => {
      await decideMatchAppeal(matchId, "reject", { note });
    },
    {
      successMessage: "Appeal rejected. The result stands.",
      errorMessage: (e) => describeError(e, `Couldn't save the decision. ${CONNECTION_HINT}`),
    },
  );
  const deciding = approve.pending || reject.pending;

  /** The sets in `line`, or the message that explains why it isn't a valid score. */
  function parseScore(line: string): RecordedSetInput[] | string {
    const sets = parseRecordedScoreLine(line);
    if (!sets) {
      return `Enter the score as sets from ${p1Name}'s side, for example 6-4, 3-6, [10-8].`;
    }
    return validateRecordedSets(sets) ?? sets;
  }

  function handleRequest() {
    setReasonError(null);
    setScoreError(null);
    if (!reason.trim()) {
      setReasonError("Say what is wrong with the result.");
      announce("Say what is wrong with the result.");
      return;
    }
    let sets: RecordedSetInput[] | undefined;
    if (scoreLine.trim()) {
      const parsed = parseScore(scoreLine);
      if (typeof parsed === "string") {
        setScoreError(parsed);
        announce(parsed);
        return;
      }
      sets = parsed;
    }
    void request.run(sets);
  }

  function closeRequest() {
    setReasonError(null);
    setScoreError(null);
    setRequestOpen(false);
  }

  function handleApprove() {
    setReviewError(null);
    const parsed = parseScore(reviewScore);
    if (typeof parsed === "string") {
      setReviewError(parsed);
      announce(parsed);
      return;
    }
    void approve.run(parsed);
  }

  async function handleReject() {
    const ok = await confirmDestructive({
      title: "Reject this appeal?",
      message: `The result stays as it is, and ${requesterName} can't appeal this match again.`,
      confirmLabel: "Reject appeal",
    });
    if (ok) void reject.run();
  }

  const noteText = appeal?.decisionNote ? ` Reviewer's note: "${appeal.decisionNote}"` : "";

  return (
    <>
      {appeal?.status === "pending" && (
        <InlineAlert
          tone="info"
          title="Review requested"
          message={`${requesterName} asked a division leader or admin to review this result. It counts as shown until they decide.`}
        />
      )}
      {appeal?.status === "approved" && (
        <InlineAlert
          tone="success"
          title="Appeal approved"
          message={`A reviewer corrected the score${
            appeal.appliedSets
              ? ` to ${formatRecordedScoreLine(appeal.appliedSets)} (${p1Name}'s games first)`
              : ""
          }.${noteText}`}
        />
      )}
      {appeal?.status === "rejected" && (
        <InlineAlert
          tone="info"
          title="Appeal not approved"
          message={`A reviewer looked at ${
            appeal.requestedBy === userId ? "your" : `${requesterName}'s`
          } appeal and the result stands. This match can't be appealed again.${noteText}`}
        />
      )}

      {canRequest && (
        <Panel title="Think this result is wrong?" fontsLoaded={fontsLoaded}>
          <Text style={styles.panelBody}>
            The result is confirmed, so only a division leader or admin can
            change it. You can ask for a review once for this match.
          </Text>
          {requestOpen ? (
            <>
              <FormField
                label="What's wrong with the result?"
                value={reason}
                onChangeText={(text) => {
                  setReason(text);
                  setReasonError(null);
                }}
                multiline
                maxLength={MAX_APPEAL_REASON_LENGTH}
                required
                error={reasonError ?? undefined}
              />
              <FormField
                label={`The correct score, with ${p1Name}'s games first (optional)`}
                value={scoreLine}
                onChangeText={(text) => {
                  setScoreLine(text);
                  setScoreError(null);
                }}
                placeholder="6-4, 3-6, [10-8]"
                autoCapitalize="none"
                autoCorrect={false}
                error={scoreError ?? undefined}
              />
              {request.error ? <InlineAlert tone="error" message={request.error} /> : null}
              <View style={styles.buttonStack}>
                <Button
                  label="Send for review"
                  fullWidth
                  pending={request.pending}
                  onPress={handleRequest}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  fullWidth
                  disabled={request.pending}
                  onPress={closeRequest}
                />
              </View>
            </>
          ) : (
            <Button
              label="Request a review"
              icon="exclamationmark.triangle"
              variant="secondary"
              fullWidth
              onPress={() => setRequestOpen(true)}
            />
          )}
        </Panel>
      )}

      {canDecide && appeal && (
        <Panel title="Review this appeal" fontsLoaded={fontsLoaded}>
          <Text style={styles.panelBody}>
            {requesterName} asked for a review of this confirmed result:
            &ldquo;{appeal.reason}&rdquo; Approving saves the score below as
            final. Rejecting keeps the result as it is, and the match
            can&apos;t be appealed again.
          </Text>
          <FormField
            label={`Correct score, with ${p1Name}'s games first`}
            value={reviewScore}
            onChangeText={(text) => {
              setReviewScore(text);
              setReviewError(null);
            }}
            placeholder="6-4, 3-6, [10-8]"
            autoCapitalize="none"
            autoCorrect={false}
            error={reviewError ?? undefined}
          />
          <FormField
            label="Note to the players (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={MAX_APPEAL_NOTE_LENGTH}
          />
          {approve.error || reject.error ? (
            <InlineAlert tone="error" message={approve.error ?? reject.error ?? ""} />
          ) : null}
          <View style={styles.buttonStack}>
            <Button
              label="Approve and save score"
              icon="checkmark.circle"
              fullWidth
              pending={approve.pending}
              disabled={deciding && !approve.pending}
              onPress={handleApprove}
            />
            <Button
              label="Reject appeal"
              variant="secondary"
              fullWidth
              pending={reject.pending}
              disabled={deciding && !reject.pending}
              onPress={() => void handleReject()}
            />
          </View>
        </Panel>
      )}
    </>
  );
}

function PanelScore({
  score,
  fontsLoaded,
}: {
  score: LiveScore;
  fontsLoaded: boolean;
}) {
  const styles = useStyles();
  return (
    <Text
      style={[styles.panelScore, font(fontsLoaded, "bold")]}
      accessibilityLabel={`Score ${spokenSets(score)}`}
    >
      {formatScoreDisplay(score)}
    </Text>
  );
}

function EditScoreModal({
  visible,
  sets,
  onChangeSets,
  onSave,
  onCancel,
  saving,
  error,
  isCompleted,
  p1Name,
  p2Name,
  resolving = false,
}: {
  visible: boolean;
  sets: SetDraft[];
  onChangeSets: (s: SetDraft[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  /** Validation or save failure, shown above the buttons. */
  error: string | null;
  isCompleted: boolean;
  p1Name: string;
  p2Name: string;
  /** A leader entering the correct score for a disputed or unanswered report. */
  resolving?: boolean;
}) {
  const colors = useColors();
  const editScoreStyles = useEditScoreStyles();
  const styles = useStyles();
  function updateSet(i: number, side: "p1" | "p2", val: string) {
    onChangeSets(
      sets.map((s, idx) =>
        idx === i ? { ...s, [side]: val.replace(/[^0-9]/g, "") } : s,
      ),
    );
  }
  return (
    // The same rising sheet as the others: a card pinned to the bottom that
    // scrolls when the keyboard or a long score needs the room.
    <BottomSheetModal
      visible={visible}
      onRequestClose={() => {
        if (!saving) onCancel();
      }}
      cardStyle={styles.sheetCard}
    >
      <Text style={styles.sheetTitle} accessibilityRole="header">
        {resolving ? "Set the correct score" : "Edit score"}
      </Text>
      {resolving && (
        <Text style={styles.sheetHint}>
          This score is final. It counts in the standings without another
          confirmation from the players.
        </Text>
      )}
      {!resolving && isCompleted && (
        <InlineAlert
          tone="warning"
          message="Changing a confirmed score sends it back to both players to confirm again."
        />
      )}
      <View
        style={editScoreStyles.headerRow}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text style={editScoreStyles.headerSet}>Set</Text>
        <Text style={editScoreStyles.headerName} numberOfLines={1}>
          {p1Name}
        </Text>
        <Text style={editScoreStyles.headerName} numberOfLines={1}>
          {p2Name}
        </Text>
      </View>
      {sets.map((s, i) => {
        const setName = s.matchTiebreak ? "Match tiebreak" : `Set ${i + 1}`;
        const unit = s.matchTiebreak ? "points" : "games";
        return (
          <React.Fragment key={i}>
            <View style={editScoreStyles.setRow}>
              <Text
                style={editScoreStyles.setLabel}
                importantForAccessibility="no"
                accessibilityElementsHidden
              >
                {s.matchTiebreak ? "TB" : `Set ${i + 1}`}
              </Text>
              <TextInput
                style={editScoreStyles.setInput}
                value={s.p1}
                onChangeText={(v) => updateSet(i, "p1", v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={`${setName}, ${p1Name} ${unit}`}
                editable={!saving}
              />
              <TextInput
                style={editScoreStyles.setInput}
                value={s.p2}
                onChangeText={(v) => updateSet(i, "p2", v)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={`${setName}, ${p2Name} ${unit}`}
                editable={!saving}
              />
            </View>
            <MatchTiebreakToggle sets={sets} index={i} onChangeSets={onChangeSets} />
          </React.Fragment>
        );
      })}
      <View style={editScoreStyles.setActionRow}>
        {sets.length < 5 && (
          <Button
            label="Add set"
            icon="plus"
            variant="quiet"
            size="compact"
            disabled={saving}
            onPress={() =>
              onChangeSets(withEligibleTiebreaks([...sets, { p1: "", p2: "" }]))
            }
          />
        )}
        {sets.length > 1 && (
          <Button
            label="Remove last set"
            variant="quiet"
            size="compact"
            disabled={saving}
            onPress={() => onChangeSets(withEligibleTiebreaks(sets.slice(0, -1)))}
          />
        )}
      </View>
      {error ? (
        <InlineAlert tone="error" title="Score not saved" message={error} />
      ) : null}
      <View style={styles.buttonStack}>
        <Button
          label={resolving ? "Save final score" : "Save score"}
          pending={saving}
          fullWidth
          onPress={onSave}
        />
        <Button
          label="Cancel"
          variant="quiet"
          fullWidth
          disabled={saving}
          onPress={onCancel}
        />
      </View>
    </BottomSheetModal>
  );
}

function ManageRow({
  icon,
  label,
  hint,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: SymbolName;
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={disabled ? undefined : { color: SB.ripple }}
      style={({ pressed }) => [
        styles.manageOption,
        danger && styles.manageOptionDanger,
        SHOWS_PRESSED_FILL && pressed && { backgroundColor: SB.control },
        disabled && { opacity: 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
    >
      <AppIcon name={icon} color={danger ? SB.danger : SB.muted} />
      <View style={styles.manageToggleCopy}>
        <Text
          style={[styles.manageOptionText, danger && styles.manageOptionDangerText]}
        >
          {label}
        </Text>
        {hint ? <Text style={styles.manageToggleHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function MatchScreen() {
  const colors = useColors();
  const styles = useStyles();
  // On a tablet the top bar, scoreboard, and panels center at the form width
  // rather than stretching across the screen. Undefined on phones.
  const contentWidth = useContentWidth();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380 || height < 700;
  const needsScrollableCourt = compact || fontScale > 1.2;
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const { match, loading, error: loadError } = useMatch(id ?? null);
  const user = useAppStore((state) => state.user);
  const divisionId = useAppStore((state) => state.divisionId);
  const [currentTip, setCurrentTip] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [scoring, setScoring] = useState(false);
  // Which row's point is on its way to the server, and the last one that
  // landed: the scoreboard shows both so a tap is never silent.
  const [recordingFor, setRecordingFor] = useState<Player | null>(null);
  const [lastPoint, setLastPoint] = useState<{ player: Player; seq: number } | null>(null);
  // An undo that failed on court, shown above the scoreboard with a retry.
  const [courtError, setCourtError] = useState<string | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [setupServer, setSetupServer] = useState<Player>("player1");
  const [swapped, setSwapped] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<Player | null>(null);
  const fontsLoaded = useScoreboardFonts();
  const [showEditScore, setShowEditScore] = useState(false);
  const [editSets, setEditSets] = useState<SetDraft[]>([]);
  const editInitial = useRef("");
  const [editError, setEditError] = useState<string | null>(null);
  // True while the score sheet is open for a leader's resolution rather than
  // a player's edit.
  const [resolvingScore, setResolvingScore] = useState(false);
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [watchAppInstalled, setWatchAppInstalled] = useState(false);
  const [launchingWatch, setLaunchingWatch] = useState(false);
  // Link opponent modal state
  const [showLinkOpponent, setShowLinkOpponent] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<PublicProfile[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkSearchError, setLinkSearchError] = useState<string | null>(null);
  const linkSearchSeq = useRef(0);
  const linkSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (linkSearchTimer.current) clearTimeout(linkSearchTimer.current);
    };
  }, []);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);

  // Opened from a notification on a cold start, the screen has no history to
  // go back to, so leaving lands on the Matches tab instead of doing nothing.
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/matches" as never);
  }, [router]);

  const isParticipant = !!(user && match && isMatchParticipant(match, user.id));
  const isAdminOrLeader =
    user?.role === "division_leader" || user?.role === "admin";
  const canManage = isParticipant || isAdminOrLeader;
  // resolveDisputedReport decides for real (leader of this division, or
  // admin); this only decides whether to offer the controls.
  const canResolveReport =
    (user?.role === "division_leader" || isAdminRole(user?.role)) &&
    !!match &&
    (match.status === "disputed" ||
      (match.status === "pending_report" && !!match.reportSubmission));

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
  // The opposing side has 48 hours to answer a report. After that only a
  // leader or admin can change it; the rules enforce the same cutoff.
  const confirmationDeadline = reportConfirmationDeadline(submission);
  const windowClosed = !!match && isReportWindowClosed(match, Date.now());

  const names: Record<Player, string> = {
    player1: match?.player1Name ?? "Player 1",
    player2: match?.player2Name ?? "Player 2",
  };

  // ── Actions. Each has its own pending and error state; none of them
  // changes what is written, only how the screen reports it.

  const start = useAsyncAction(
    async () => {
      if (!match || !id) return;
      await startMatch(id, setupServer, advancedStatsEnabled, match.liveScore);
    },
    {
      successMessage: () => `Match started. ${names[setupServer]} serves first.`,
      errorMessage: CONNECTION_HINT,
    },
  );

  const accept = useAsyncAction(
    async () => {
      if (!id) return;
      await acceptMatchProposal(id);
    },
    {
      successMessage: "Proposal accepted. The match is scheduled.",
      errorMessage: (e) => describeError(e, `Couldn't accept. ${CONNECTION_HINT}`),
    },
  );

  const decline = useAsyncAction(
    async () => {
      if (!id) return;
      await declineMatchProposal(id);
    },
    {
      successMessage: "Proposal declined.",
      errorMessage: (e) => describeError(e, `Couldn't decline. ${CONNECTION_HINT}`),
    },
  );

  const submitReport = useAsyncAction(
    async () => {
      if (!id || !user) return;
      await submitMatchReport(id, user.id);
    },
    {
      successMessage: "Match report submitted for confirmation.",
      errorMessage: (e) =>
        describeError(e, `Couldn't submit the match report. ${CONNECTION_HINT}`),
    },
  );

  const confirmReport = useAsyncAction(
    async () => {
      if (!id || !user) return;
      await confirmMatchReport(id, user.id);
    },
    {
      successMessage: "Score confirmed. Standings are updating.",
      errorMessage: (e) =>
        describeError(e, `Couldn't confirm the score. ${CONNECTION_HINT}`),
    },
  );

  const disputeReport = useAsyncAction(
    async () => {
      if (!id || !user) return;
      await disputeMatchReport(id, user.id);
    },
    {
      successMessage: "Score disputed. Your division leader will review it.",
      errorMessage: (e) =>
        describeError(e, `Couldn't dispute the score. ${CONNECTION_HINT}`),
    },
  );

  const finalizeGuest = useAsyncAction(
    async () => {
      if (!id || !user) return;
      await submitGuestReport(id, user.id);
    },
    {
      successMessage: "Result saved.",
      errorMessage: (e) =>
        describeError(e, `Couldn't save the result. ${CONNECTION_HINT}`),
    },
  );

  const resolveReported = useAsyncAction(
    async () => {
      if (!id) return;
      await resolveDisputedReport(id);
    },
    {
      successMessage: "Reported score made final.",
      errorMessage: (e) =>
        describeError(e, `Couldn't resolve this report. ${CONNECTION_HINT}`),
    },
  );

  const saveScore = useAsyncAction(
    async (parsed: RecordedSetInput[], resolving: boolean) => {
      if (!id) return;
      if (resolving) {
        await resolveDisputedReport(id, parsed);
      } else {
        await editMatchScore(id, parsed);
      }
    },
    {
      successMessage: "Score saved.",
      errorMessage: (e) => describeError(e, `Couldn't save the score. ${CONNECTION_HINT}`),
      onSuccess: () => setShowEditScore(false),
    },
  );

  const link = useAsyncAction(
    async (opponent: PublicProfile) => {
      if (!match || !id || !user) return undefined;
      const wasCompleted = match.status === "completed";
      await linkGuestOpponent(
        id,
        opponent.id,
        opponent.displayName ?? "",
        match,
        user.id,
      );
      return { opponent, wasCompleted };
    },
    {
      errorMessage: (e) =>
        describeError(e, `Couldn't link that player. ${CONNECTION_HINT}`),
      onSuccess: (result) => {
        if (!result) return;
        closeLinkOpponent();
        const name = result.opponent.displayName ?? "Your opponent";
        const message = result.wasCompleted
          ? `${name} is now on this match and has been asked to confirm the result. It counts in the standings once they confirm.`
          : `${name} is now on this match.`;
        setLinkNotice(message);
        announce(message);
      },
    },
  );

  const share = useAsyncAction(
    async (url: string) => {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url);
      } else {
        await Linking.openURL(url);
      }
    },
    { errorMessage: "Couldn't open the match report. Try again." },
  );

  const cancel = useAsyncAction(
    async () => {
      if (!id) return;
      await cancelMatch(id);
    },
    {
      successMessage: "Match cancelled.",
      errorMessage: (e) => describeError(e, `Couldn't cancel the match. ${CONNECTION_HINT}`),
      onSuccess: () => setShowManage(false),
    },
  );

  const remove = useAsyncAction(
    async () => {
      if (!id) return;
      await deleteMatch(id);
    },
    {
      successMessage: "Match deleted.",
      errorMessage: (e) => describeError(e, `Couldn't delete the match. ${CONNECTION_HINT}`),
      onSuccess: () => {
        setShowManage(false);
        leave();
      },
    },
  );

  const postpone = useAsyncAction(
    async (newTime: number) => {
      if (!id) return;
      await postponeMatch(id, newTime);
    },
    {
      successMessage: "Match postponed.",
      errorMessage: (e) =>
        describeError(e, `Couldn't postpone the match. ${CONNECTION_HINT}`),
      onSuccess: () => setShowManage(false),
    },
  );

  const tips = useAsyncAction(
    async (enabled: boolean) => {
      if (!id) return;
      await setMatchTipsEnabled(id, enabled);
    },
    { errorMessage: `Couldn't change rule tips. ${CONNECTION_HINT}` },
  );

  const managing = cancel.pending || remove.pending || postpone.pending;
  const manageError = cancel.error ?? remove.error ?? postpone.error ?? tips.error;

  const handleUndo = useCallback(async () => {
    if (!match || !id || scoring) return;
    const target = match.undoSnapshot?.liveScore;
    const spokenNames = {
      player1: match.player1Name ?? "Player 1",
      player2: match.player2Name ?? "Player 2",
    };
    setScoring(true);
    try {
      await undoLastPoint(id, match);
      setCourtError(null);
      haptic("undo");
      if (target) {
        announce(`Point undone. ${spokenUndoTarget(target, spokenNames)}`);
      }
    } catch (err) {
      console.error("Failed to undo last point:", err);
      haptic("error");
      setCourtError(`The last point is still on the board. ${CONNECTION_HINT}`);
      announce("Couldn't undo the last point.");
    } finally {
      setScoring(false);
    }
  }, [match, id, scoring]);
  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;

  // Kept referentially stable so the Wear listener below is not torn down and
  // re-registered on every render.
  const handlePoint = useCallback(
    async (
      player: "player1" | "player2",
      pointAttribution?: PointAttribution,
      pointId: string = newPointId(),
    ) => {
      if (!match || !id || scoring) return;
      setScoring(true);
      setRecordingFor(player);
      const p1 = match.player1Name ?? "Player 1";
      const p2 = match.player2Name ?? "Player 2";
      try {
        const result = await scorePoint(
          id,
          match,
          player,
          pointAttribution,
          pointId,
        );
        // Confirm the point first: the watch sync below is peripheral.
        setCourtError(null);
        setLastPoint((prev) => ({ player, seq: (prev?.seq ?? 0) + 1 }));
        haptic("point");
        announce(
          describePoint(
            match.liveScore,
            result.nextScore,
            player,
            { player1: p1, player2: p2 },
            result.matchWinner,
          ),
        );
        await sendScoreToWear(result.nextScore, {
          matchId: id,
          status: result.matchWinner ? "pending_report" : match.status,
          // Only this screen's participant scores, and only while it is live.
          canScore:
            isParticipant &&
            !result.matchWinner &&
            match.status === "in_progress",
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
          const tipList = getTipsForTriggers(result.tips);
          if (tipList.length > 0) setCurrentTip(tipList[0]);
        }
        // The finished match takes the screen to the report step, which says
        // what to do next; there is no separate "match over" dialog to dismiss.
      } catch (err) {
        console.error("Failed to score point:", err);
        haptic("error");
        if (isNoLongerLiveError(err)) {
          Alert.alert(
            "Point not added",
            "This match is no longer in progress, so the point wasn't added.",
          );
          return;
        }
        // A blocking choice on purpose: tapping the row again would send a new
        // point, while Retry resends the same point id, so if the first request
        // did land and only its reply was lost, the server does not count it
        // twice.
        Alert.alert(
          "Point not recorded",
          `The point for ${player === "player1" ? p1 : p2} didn't save. ${CONNECTION_HINT} Retrying can't count it twice.`,
          [
            { text: "Don't add", style: "cancel" },
            {
              text: "Retry point",
              onPress: () =>
                void handlePointRef.current(player, pointAttribution, pointId),
            },
          ],
        );
      } finally {
        setScoring(false);
        setRecordingFor(null);
      }
    },
    [match, id, scoring, isParticipant],
  );
  // The retry above runs after a re-render, so it calls the latest handler
  // rather than the one that failed, which closed over a stale `scoring`.
  const handlePointRef = useRef(handlePoint);
  handlePointRef.current = handlePoint;

  // A point-type choice only makes sense while the match is live. If it ends or
  // changes underneath an open sheet (a point from the watch can finish it),
  // close the sheet instead of scoring a pick against a finished match.
  useEffect(() => {
    if (pendingPoint !== null && match?.status !== "in_progress") {
      setPendingPoint(null);
    }
  }, [match?.status, pendingPoint]);

  // With advanced stats on, a tap asks for the point type first; see PointTypeSheet.
  // Stable callbacks, so the memoized scoreboard re-renders only when what it
  // shows changes.
  const advancedStatsOn = !!match?.advancedStatsEnabled;
  const requestPoint = useCallback(
    (player: Player) => {
      if (advancedStatsOn) {
        setPendingPoint(player);
        return;
      }
      void handlePoint(player);
    },
    [advancedStatsOn, handlePoint],
  );
  const handleSwapEnds = useCallback(() => {
    setSwapped((value) => !value);
    announce("Ends swapped");
  }, []);
  const handleUndoPress = useCallback(() => {
    void handleUndoRef.current();
  }, []);

  function openManage() {
    setShowPostponeOptions(false);
    cancel.reset();
    remove.reset();
    postpone.reset();
    tips.reset();
    setShowManage(true);
    void refreshWatchAppInstalled();
  }

  async function handleCancelMatch() {
    if (!id || !match) return;
    const ok = await confirmDestructive({
      title: "Cancel this match?",
      message:
        match.status === "in_progress"
          ? "Scoring stops and the match is marked cancelled for both players. The score so far is kept."
          : "The match is marked cancelled for both players.",
      confirmLabel: "Cancel match",
      cancelLabel: "Keep match",
    });
    if (ok) await cancel.run();
  }

  async function handleDeleteMatch() {
    if (!id || !match) return;
    const isCompleted = match.status === "completed";
    const ok = await confirmDestructive({
      title: "Delete this match?",
      message: isCompleted
        ? "It is removed from the standings, and rankings are recalculated without it. This can't be undone."
        : "The match and its score are deleted for both players. This can't be undone.",
      confirmLabel: "Delete match",
    });
    if (ok) await remove.run();
  }

  async function handlePostponeBy(ms: number) {
    if (!id || !match) return;
    const base = match.scheduledAt ?? Date.now();
    const newTime = base + ms;
    const ok = await askToConfirm({
      title: "Postpone the match?",
      message: `Move it to ${formatWhen(newTime)}?`,
      confirmLabel: "Postpone",
    });
    if (ok) await postpone.run(newTime);
  }

  function handleOpenEditScore(resolving = false) {
    const existing: SetDraft[] = match
      ? recordedSetsFromScore(match.liveScore).map((s) => ({
          p1: String(s.p1),
          p2: String(s.p2),
          ...(s.matchTiebreak ? { matchTiebreak: true } : {}),
        }))
      : [];
    const initial = existing.length > 0 ? existing : [{ p1: "", p2: "" }];
    editInitial.current = JSON.stringify(initial);
    setEditSets(initial);
    setEditError(null);
    saveScore.reset();
    setResolvingScore(resolving);
    setShowManage(false);
    setShowEditScore(true);
  }

  async function handleCancelEditScore() {
    if (saveScore.pending) return;
    if (JSON.stringify(editSets) !== editInitial.current) {
      const discard = await confirmDestructive({
        title: "Discard score changes?",
        message: "The score you entered won't be saved.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      });
      if (!discard) return;
    }
    setShowEditScore(false);
  }

  async function handleConfirmReportedScore() {
    if (!match || !id) return;
    const ok = await askToConfirm({
      title: "Make the reported score final?",
      message: `${formatScoreDisplay(match.liveScore)} becomes the result and counts in the standings right away.`,
      confirmLabel: "Make final",
    });
    if (ok) await resolveReported.run();
  }

  async function handleSaveEditScore() {
    const parsed: RecordedSetInput[] = editSets.map((s) => ({
      p1: parseInt(s.p1, 10),
      p2: parseInt(s.p2, 10),
      ...(s.matchTiebreak ? { matchTiebreak: true } : {}),
    }));
    const invalid = validateRecordedSets(parsed);
    if (invalid) {
      setEditError(invalid);
      announce(invalid);
      return;
    }
    if (!id) return;
    setEditError(null);
    await saveScore.run(parsed, resolvingScore);
  }

  async function handleSubmitReport() {
    if (!match || !id || !user) return;
    const ok = await askToConfirm({
      title: "Submit the match report?",
      message: `${formatScoreDisplay(match.liveScore)} goes to ${oppCasual} to confirm.`,
      confirmLabel: "Submit report",
    });
    if (ok) await submitReport.run();
  }

  async function handleConfirmReport() {
    if (!match || !id || !user) return;
    const ok = await askToConfirm({
      title: "Confirm this score?",
      message:
        "Confirming makes the score final, updates the standings, and creates the match report.",
      confirmLabel: "Confirm score",
    });
    if (ok) await confirmReport.run();
  }

  async function handleDisputeReport() {
    if (!match || !id || !user) return;
    const ok = await confirmDestructive({
      title: "Dispute this score?",
      message:
        "Your division leader will be asked to review it and set the final result.",
      confirmLabel: "Dispute score",
      cancelLabel: "Go back",
    });
    if (ok) await disputeReport.run();
  }

  async function handleSubmitGuestReport() {
    if (!match || !id || !user) return;
    const ok = await askToConfirm({
      title: "Save the final result?",
      message: `${formatScoreDisplay(match.liveScore)} is saved. Guest matches don't count in the standings until you link your opponent's account and they confirm the score.`,
      confirmLabel: "Save result",
    });
    if (ok) await finalizeGuest.run();
  }

  async function handleDecline() {
    const ok = await confirmDestructive({
      title: "Decline this proposal?",
      message: `${proposerCasual} will be told you declined.`,
      confirmLabel: "Decline",
      cancelLabel: "Keep proposal",
    });
    if (ok) await decline.run();
  }

  async function handleWithdraw() {
    const ok = await confirmDestructive({
      title: "Withdraw this proposal?",
      message: "The match is cancelled before it's scheduled.",
      confirmLabel: "Withdraw",
      cancelLabel: "Keep proposal",
    });
    if (ok) await decline.run();
  }

  function handleLinkSearch(text: string) {
    setLinkSearch(text);
    setLinkSearchError(null);
    // Results from an older, slower query must not replace newer ones.
    const seq = ++linkSearchSeq.current;
    if (linkSearchTimer.current) clearTimeout(linkSearchTimer.current);
    if (!divisionId || !text.trim()) {
      setLinkResults([]);
      setLinkSearching(false);
      return;
    }
    // Shown from the first keystroke, so "No players" waits for the search.
    setLinkSearching(true);
    const searchDivisionId = divisionId;
    linkSearchTimer.current = setTimeout(
      () => void runLinkSearch(searchDivisionId, text, seq),
      SEARCH_DEBOUNCE_MS,
    );
  }

  async function runLinkSearch(searchDivisionId: string, text: string, seq: number) {
    try {
      const results = await searchDivisionPlayers(searchDivisionId, text);
      if (seq !== linkSearchSeq.current) return;
      const filtered = results.filter((u) => u.id !== user?.id);
      setLinkResults(filtered);
      announce(
        filtered.length === 0
          ? "No players found"
          : `${filtered.length} player${filtered.length === 1 ? "" : "s"} found`,
      );
    } catch (err) {
      console.error("Failed to search division players:", err);
      if (seq !== linkSearchSeq.current) return;
      setLinkResults([]);
      setLinkSearchError(`Couldn't search your division. ${CONNECTION_HINT}`);
    } finally {
      if (seq === linkSearchSeq.current) setLinkSearching(false);
    }
  }

  function closeLinkOpponent() {
    linkSearchSeq.current += 1;
    if (linkSearchTimer.current) clearTimeout(linkSearchTimer.current);
    setShowLinkOpponent(false);
    setLinkSearch("");
    setLinkResults([]);
    setLinkSearching(false);
    setLinkSearchError(null);
    link.reset();
  }

  async function handleShareReport() {
    setShareNotice(null);
    // Only open a report the server generated. Older matches could carry a
    // client-written link, and the rules no longer let clients set one.
    if (match?.reportUrl && !match.reportUrl.startsWith("https://")) {
      setShareNotice({
        tone: "error",
        message: "This match's report link isn't valid, so it can't be opened.",
      });
      return;
    }
    if (!match?.reportUrl) {
      setShareNotice({
        tone: "info",
        message: "The match report is still being created. Try again in a moment.",
      });
      return;
    }
    await share.run(match.reportUrl);
  }

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
      if (await launchWatchApp()) {
        announce("Opened on your watch");
        return;
      }
      Alert.alert(
        "Couldn't open the watch app",
        "Check that your watch is nearby, paired, and still has Tennis League installed.",
      );
      // The watch may have gone out of range since the last check.
      await refreshWatchAppInstalled();
    } finally {
      setLaunchingWatch(false);
    }
  }, [refreshWatchAppInstalled]);

  // The last snapshot sent, so leaving the screen can resend it read-only.
  const lastWearSnapshotRef = useRef<{
    score: LiveScore;
    payload: Omit<WearScorePayload, "score">;
  } | null>(null);

  const syncWear = useCallback(() => {
    if (!id) return;
    if (!match) {
      // The match was deleted while open: stop the watch accepting points.
      const last = lastWearSnapshotRef.current;
      if (last?.payload.canScore) {
        lastWearSnapshotRef.current = {
          ...last,
          payload: { ...last.payload, canScore: false },
        };
        void sendScoreToWear(last.score, { ...last.payload, canScore: false });
      }
      return;
    }
    const payload = {
      matchId: id,
      status: match.status,
      // A spectator's watch shows the match read-only.
      canScore: isParticipant && match.status === "in_progress",
      player1Name: match.player1Name ?? "Player 1",
      player2Name: match.player2Name ?? "Player 2",
      ...buildWearFeedback(match),
    };
    lastWearSnapshotRef.current = { score: match.liveScore, payload };
    void sendScoreToWear(match.liveScore, payload);
  }, [match, id, isParticipant]);

  useEffect(() => {
    syncWear();
  }, [syncWear]);

  // Leaving the screen ends the phone's ability to apply watch points, so the
  // watch gets one last read-only snapshot instead of staying scoreable.
  useEffect(
    () => () => {
      const last = lastWearSnapshotRef.current;
      if (last?.payload.canScore) {
        void sendScoreToWear(last.score, { ...last.payload, canScore: false });
      }
    },
    [],
  );

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

  // Names for sentences, from this player's point of view.
  const mySide = user && match ? sideOfPlayer(match, user.id) : undefined;
  const oppName = mySide ? names[opposingSide(mySide)] : "your opponent";
  const oppCasual = mySide ? casualName(oppName) : "your opponent";
  const submitterSide =
    submission && match ? sideOfPlayer(match, submission.submittedBy) : undefined;
  const submitterCasual = submitterSide ? casualName(names[submitterSide]) : oppCasual;
  // A proposal is sent by side 1 to side 2 (the matches tab reads it the same way).
  const proposerCasual = casualName(names.player1);

  if (loading) {
    return (
      <View
        style={[styles.container, styles.center]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading match"
        accessibilityState={{ busy: true }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={SB.yellow} />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.errorScreen}>
        <Stack.Screen options={{ headerShown: true, title: "Match" }} />
        <ErrorState
          title={loadError ? "Couldn't load this match" : "This match isn't available"}
          message={
            loadError
              ? "Check your connection, then open the match again."
              : "It may have been deleted, or you may no longer have access to it."
          }
          retryLabel="Back to matches"
          onRetry={leave}
        />
      </View>
    );
  }

  const scoreDisplay = formatScoreDisplay(match.liveScore);
  const p1Name = names.player1;
  const p2Name = names.player2;
  const p1Stats = { ...EMPTY_STATS, ...match.stats.player1 };
  const p2Stats = { ...EMPTY_STATS, ...match.stats.player2 };
  const winnerName =
    match.winner === "player1" ? p1Name : match.winner === "player2" ? p2Name : null;
  // Players may only correct a result awaiting confirmation; once confirmed,
  // only a leader or admin can change it (the rules enforce the same split).
  const canEditScore =
    (match.status === "pending_report" &&
      (isAdminOrLeader || (isParticipant && !windowClosed))) ||
    ((isAdminOrLeader || isAdminRole(user?.role)) &&
      match.status === "completed");
  // The clocks tick inside ElapsedText; the screen itself never re-renders
  // for them. `matchSince` is set only while the match clock is running.
  const matchSince =
    match.matchDurationMs === undefined &&
    match.startedAt &&
    match.status === "in_progress"
      ? match.startedAt
      : undefined;
  const matchFixedMs = match.matchDurationMs;
  const currentSetSince =
    match.status === "in_progress" && match.currentSetStartedAt
      ? match.currentSetStartedAt
      : undefined;
  const currentSetFixedMs =
    match.liveScore.sets[match.liveScore.currentSet]?.durationMs;
  const showCourtSurface = isParticipant && match.status === "in_progress";
  const showSetupSurface = isParticipant && match.status === "scheduled";
  const fillScreen = showCourtSurface || showSetupSurface;
  const headerTitle = showSetupSurface
    ? "NEW MATCH"
    : match.status === "in_progress"
      ? `SET ${match.liveScore.currentSet + 1} · ${formatFormatLabel(match).toUpperCase()}`
      : match.status === "pending_report" || match.status === "completed"
        ? "FINAL"
        : getMatchStatusMetadata(match.status).label.toUpperCase();
  const showHeaderClock =
    match.status === "in_progress" || match.status === "pending_report";
  const undoTarget = match.undoSnapshot?.liveScore;
  const isProposedToMe =
    isParticipant && match.status === "proposed" && mySide === "player2";
  const isProposedByMe =
    isParticipant && match.status === "proposed" && mySide === "player1";
  const spectatorNote = !isParticipant
    ? match.status === "in_progress"
      ? "Live. The score updates as the players record points. Only the players can score this match."
      : match.status === "scheduled" || match.status === "proposed"
        ? "Only the players can start and score this match."
        : match.status === "pending_report" && !canResolveReport
          ? "Waiting for the players to confirm the result."
          : null
    : null;
  // A proposal has nothing on the scoreboard yet, so Accept and Decline (or
  // Withdraw) lead and the empty scoreboard follows.
  const leadWithPanels = match.status === "proposed";

  const court = showSetupSurface ? (
    <ScoreboardSetup
      names={names}
      server={setupServer}
      onPickServer={setSetupServer}
      formatLabel={formatFormatLabel(match)}
      scheduledLabel={match.scheduledAt ? formatWhen(match.scheduledAt) : undefined}
      advancedStats={advancedStatsEnabled}
      onToggleAdvancedStats={setAdvancedStatsEnabled}
      onStart={() => void start.run()}
      starting={start.pending}
      startError={start.error}
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
      onSwap={handleSwapEnds}
      onPoint={requestPoint}
      scoring={scoring}
      recordingFor={recordingFor}
      lastPoint={lastPoint}
      onUndo={handleUndoPress}
      canUndo={!!match.undoSnapshot}
      undoHint={
        undoTarget
          ? undoTargetLabel(match.liveScore, undoTarget)
          : "No point to take back yet"
      }
      undoSpoken={undoTarget ? spokenUndoTarget(undoTarget, names) : undefined}
    />
  );

  return (
    <View style={styles.container}>
      {/* On iOS this screen is a sheet, and the court has scrolling off, so a
          thumb dragging down a player row would pull the scoreboard away
          mid-match. While scoring, the top-left control is the way out. */}
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: !showCourtSurface }}
      />
      <View
        style={[
          styles.sbHeader,
          contentWidth,
          { paddingTop: Platform.OS === "ios" ? 8 : insets.top },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.sbHeaderBtn,
            SHOWS_PRESSED_FILL && pressed && styles.sbHeaderBtnPressed,
          ]}
          android_ripple={{ color: SB.ripple, borderless: true }}
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel={LEAVE_LABEL}
        >
          <AppIcon name={LEAVE_ICON} size={ICON_SIZE.tab} color={SB.text} />
        </Pressable>
        <Text
          style={[styles.sbHeaderTitle, font(fontsLoaded, "bold")]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          {headerTitle}
        </Text>
        {showHeaderClock && (
          <ElapsedText
            since={matchSince}
            ms={matchFixedMs}
            spokenPrefix="Match time "
            style={[styles.sbHeaderClock, font(fontsLoaded, "semibold")]}
            maxFontSizeMultiplier={1.3}
          />
        )}
        {canManage && match.status !== "cancelled" ? (
          <Pressable
            style={({ pressed }) => [
              styles.sbHeaderBtn,
              SHOWS_PRESSED_FILL && pressed && styles.sbHeaderBtnPressed,
            ]}
            android_ripple={{ color: SB.ripple, borderless: true }}
            onPress={openManage}
            accessibilityRole="button"
            accessibilityLabel="Match options"
          >
            <AppIcon name={MENU_ICON} size={ICON_SIZE.tab} color={SB.text} />
          </Pressable>
        ) : (
          <View style={styles.sbHeaderBtn} />
        )}
      </View>

      <View style={[styles.body, contentWidth]}>
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
          {showCourtSurface && courtError ? (
            <View style={styles.courtError}>
              <InlineAlert
                tone="error"
                title="Undo didn't go through"
                message={courtError}
                actionLabel="Try again"
                onAction={() => void handleUndoRef.current()}
              />
            </View>
          ) : null}

          {!leadWithPanels && court}

          {!fillScreen && (
            <View style={styles.sections}>
              {spectatorNote ? (
                <View style={styles.spectatorNote}>
                  <AppIcon name="info.circle" size={ICON_SIZE.small} color={SB.muted} />
                  <Text style={styles.spectatorText}>{spectatorNote}</Text>
                </View>
              ) : null}

              {linkNotice ? (
                <InlineAlert tone="success" message={linkNotice} />
              ) : null}

              {/* ── PROPOSAL ── */}
              {isProposedToMe && (
                <Panel
                  title={`${proposerCasual} proposed this match`}
                  fontsLoaded={fontsLoaded}
                >
                  <Text style={styles.panelBody}>
                    {match.scheduledAt
                      ? `For ${formatWhen(match.scheduledAt)}. `
                      : ""}
                    Accept to put it on the schedule, or decline it.
                  </Text>
                  {(accept.error ?? decline.error) ? (
                    <InlineAlert
                      tone="error"
                      message={accept.error ?? decline.error ?? ""}
                    />
                  ) : null}
                  <View style={styles.buttonStack}>
                    <Button
                      label="Accept match"
                      icon="checkmark"
                      fullWidth
                      pending={accept.pending}
                      disabled={decline.pending}
                      onPress={() => void accept.run()}
                    />
                    <Button
                      label="Decline"
                      variant="secondary"
                      fullWidth
                      pending={decline.pending}
                      disabled={accept.pending}
                      onPress={() => void handleDecline()}
                    />
                  </View>
                </Panel>
              )}

              {isProposedByMe && (
                <Panel
                  title={`Waiting for ${oppCasual} to accept`}
                  fontsLoaded={fontsLoaded}
                >
                  <Text style={styles.panelBody}>
                    {match.scheduledAt
                      ? `You proposed ${formatWhen(match.scheduledAt)}. `
                      : ""}
                    Once {oppCasual} accepts, the match is scheduled and you can
                    start scoring it here.
                  </Text>
                  {decline.error ? (
                    <InlineAlert tone="error" message={decline.error} />
                  ) : null}
                  <Button
                    label="Withdraw proposal"
                    variant="secondary"
                    fullWidth
                    pending={decline.pending}
                    onPress={() => void handleWithdraw()}
                  />
                </Panel>
              )}

              {/* ── POST-MATCH REPORT FLOW ── */}

              {/* Guest match: finalize (no opponent confirmation needed) */}
              {isParticipant &&
                match.status === "pending_report" &&
                match.player2IsGuest &&
                !submission && (
                  <Panel
                    title={winnerName ? `${winnerName} wins` : "Match over"}
                    fontsLoaded={fontsLoaded}
                  >
                    <PanelScore score={match.liveScore} fontsLoaded={fontsLoaded} />
                    <ElapsedText
                      since={matchSince}
                      ms={matchFixedMs}
                      prefix="Match time "
                      style={styles.panelMeta}
                    />
                    <Text style={styles.panelBody}>
                      Your opponent is a guest, so no one needs to confirm.
                      Save the result now. It counts in the standings once you
                      link their account and they confirm.
                    </Text>
                    {finalizeGuest.error ? (
                      <InlineAlert
                        tone="error"
                        message={finalizeGuest.error}
                        actionLabel="Try again"
                        onAction={() => void finalizeGuest.run()}
                      />
                    ) : null}
                    <View style={styles.buttonStack}>
                      <Button
                        label="Save result"
                        icon="checkmark.circle"
                        fullWidth
                        pending={finalizeGuest.pending}
                        onPress={() => void handleSubmitGuestReport()}
                      />
                      {canEditScore && (
                        <Button
                          label="Fix the score first"
                          icon="pencil"
                          variant="secondary"
                          fullWidth
                          disabled={finalizeGuest.pending}
                          onPress={() => handleOpenEditScore()}
                        />
                      )}
                    </View>
                  </Panel>
                )}

              {/* Game over, no report submitted yet */}
              {isParticipant &&
                match.status === "pending_report" &&
                !match.player2IsGuest &&
                !submission && (
                  <Panel
                    title={winnerName ? `${winnerName} wins` : "Match over"}
                    fontsLoaded={fontsLoaded}
                  >
                    <PanelScore score={match.liveScore} fontsLoaded={fontsLoaded} />
                    <Text style={styles.panelBody}>
                      Submit the match report so {oppCasual} can confirm the
                      score. It counts in the standings once they do.
                    </Text>
                    {submitReport.error ? (
                      <InlineAlert
                        tone="error"
                        message={submitReport.error}
                        actionLabel="Try again"
                        onAction={() => void submitReport.run()}
                      />
                    ) : null}
                    <View style={styles.buttonStack}>
                      <Button
                        label="Submit match report"
                        icon="doc.text"
                        fullWidth
                        pending={submitReport.pending}
                        onPress={() => void handleSubmitReport()}
                      />
                      {canEditScore && (
                        <Button
                          label="Fix the score first"
                          icon="pencil"
                          variant="secondary"
                          fullWidth
                          disabled={submitReport.pending}
                          onPress={() => handleOpenEditScore()}
                        />
                      )}
                    </View>
                  </Panel>
                )}

              {/* My side submitted — waiting for the opposing side. In doubles this also
          covers the submitter's partner, who cannot confirm their own team's report. */}
              {isParticipant &&
                match.status === "pending_report" &&
                !isPendingMyReview &&
                submission?.status === "pending_confirmation" && (
                  <Panel
                    title={`Waiting for ${oppCasual} to confirm`}
                    fontsLoaded={fontsLoaded}
                  >
                    <PanelScore score={match.liveScore} fontsLoaded={fontsLoaded} />
                    <IconLabel
                      name="hourglass"
                      color={colors.warningText}
                      textStyle={styles.statusWaiting}
                    >
                      Report submitted
                    </IconLabel>
                    <Text style={styles.panelBody}>
                      {iSubmitted
                        ? `${oppCasual} has been notified. Once they confirm, the score is final and the standings update.`
                        : `Your partner submitted the report. Once ${oppCasual} confirms, the score is final and the standings update.`}
                      {confirmationDeadline
                        ? windowClosed
                          ? " The 48 hours to answer have passed, so it's being confirmed automatically."
                          : ` If ${oppCasual} doesn't answer by ${formatWhen(confirmationDeadline)}, it's confirmed automatically.`
                        : ""}
                    </Text>
                  </Panel>
                )}

              {/* Opponent submitted — I need to review */}
              {isParticipant && isPendingMyReview && (
                <Panel
                  title={`Check the score ${submitterCasual} reported`}
                  fontsLoaded={fontsLoaded}
                >
                  <PanelScore score={match.liveScore} fontsLoaded={fontsLoaded} />
                  <Text style={styles.panelBody}>
                    {windowClosed
                      ? "The 48 hours to answer have passed, so it's being confirmed automatically. To challenge it, ask a division leader or admin to review it once it's confirmed."
                      : `Confirm it if it's right. If it's wrong, dispute it and your division leader will review it.${
                          confirmationDeadline
                            ? ` Answer by ${formatWhen(confirmationDeadline)}, or it's confirmed automatically.`
                            : ""
                        }`}
                  </Text>
                  {(confirmReport.error ?? disputeReport.error) ? (
                    <InlineAlert
                      tone="error"
                      message={confirmReport.error ?? disputeReport.error ?? ""}
                    />
                  ) : null}
                  <View style={styles.buttonStack}>
                    <Button
                      label="Confirm score"
                      icon="checkmark.circle"
                      fullWidth
                      pending={confirmReport.pending}
                      disabled={disputeReport.pending}
                      onPress={() => void handleConfirmReport()}
                    />
                    {!windowClosed && (
                      <Button
                        label="Dispute score"
                        icon="exclamationmark.triangle"
                        variant="secondary"
                        fullWidth
                        pending={disputeReport.pending}
                        disabled={confirmReport.pending}
                        onPress={() => void handleDisputeReport()}
                      />
                    )}
                  </View>
                </Panel>
              )}

              {/* Disputed — awaiting leader */}
              {match.status === "disputed" && (
                <Panel title="Score disputed" fontsLoaded={fontsLoaded}>
                  <PanelScore score={match.liveScore} fontsLoaded={fontsLoaded} />
                  <IconLabel
                    name="exclamationmark.triangle.fill"
                    color={colors.warningText}
                    textStyle={styles.statusWaiting}
                  >
                    Waiting for the division leader
                  </IconLabel>
                  <Text style={styles.panelBody}>
                    The players disagree on this score. The division leader will
                    review it and set the final result.
                  </Text>
                </Panel>
              )}

              {/* Leader or admin settles a disputed or unanswered report */}
              {canResolveReport && (
                <Panel title="Resolve this result" fontsLoaded={fontsLoaded}>
                  <Text style={styles.panelBody}>
                    {match.status === "disputed"
                      ? "The players disagree on this score."
                      : "The opposing side hasn't answered this report."}{" "}
                    Make the reported score ({scoreDisplay}) final, or set the
                    correct one. Either way, the result is final.
                  </Text>
                  {resolveReported.error ? (
                    <InlineAlert
                      tone="error"
                      message={resolveReported.error}
                      actionLabel="Try again"
                      onAction={() => void resolveReported.run()}
                    />
                  ) : null}
                  <View style={styles.buttonStack}>
                    <Button
                      label="Make reported score final"
                      fullWidth
                      pending={resolveReported.pending}
                      onPress={() => void handleConfirmReportedScore()}
                    />
                    <Button
                      label="Set the correct score"
                      icon="pencil"
                      variant="secondary"
                      fullWidth
                      disabled={resolveReported.pending}
                      onPress={() => handleOpenEditScore(true)}
                    />
                  </View>
                </Panel>
              )}

              {/* Confirmed / completed */}
              {match.status === "completed" && (
                <Panel
                  title={winnerName ? `${winnerName} wins` : "Final"}
                  fontsLoaded={fontsLoaded}
                >
                  <PanelScore score={match.liveScore} fontsLoaded={fontsLoaded} />
                  <IconLabel
                    name="checkmark.circle.fill"
                    color={match.player2IsGuest ? colors.textMuted : colors.successText}
                    textStyle={
                      match.player2IsGuest ? styles.statusMuted : styles.statusConfirmed
                    }
                  >
                    {match.player2IsGuest
                      ? "Score recorded. Not in the standings until your opponent's account is linked and they confirm."
                      : submission?.autoConfirmed
                        ? "Confirmed automatically after 48 hours · Standings updated"
                        : "Score confirmed · Standings updated"}
                  </IconLabel>
                  {shareNotice ? (
                    <InlineAlert tone={shareNotice.tone} message={shareNotice.message} />
                  ) : null}
                  {share.error ? (
                    <InlineAlert tone="error" message={share.error} />
                  ) : null}
                  <Button
                    label="Share match report"
                    icon="square.and.arrow.up"
                    variant="secondary"
                    fullWidth
                    pending={share.pending}
                    onPress={() => void handleShareReport()}
                  />
                </Panel>
              )}

              {/* Appeals: a player asks for a review of a confirmed result,
                  and a leader or admin who didn't play decides it. */}
              {id && user && (
                <MatchAppealSection
                  match={match}
                  matchId={id}
                  userId={user.id}
                  isAdmin={isAdminRole(user.role)}
                  isDivisionLeader={user.role === "division_leader"}
                  fontsLoaded={fontsLoaded}
                />
              )}

              {/* Link opponent — guest matches only */}
              {match.player2IsGuest && isParticipant && (
                <Panel title="Playing a guest?" fontsLoaded={fontsLoaded}>
                  <Text style={styles.panelBody}>
                    Once your opponent joins the app, link their account so the
                    result can count in the standings.
                  </Text>
                  <Button
                    label="Link opponent's account"
                    icon="person.crop.circle.badge.plus"
                    variant="secondary"
                    fullWidth
                    onPress={() => {
                      setLinkNotice(null);
                      setShowLinkOpponent(true);
                    }}
                  />
                </Panel>
              )}

              {/* Match statistics — live-scored completed matches only */}
              {match.status === "completed" &&
                match.source !== "manual" &&
                match.stats && (
                  <View style={statsStyles.section}>
                    <Text
                      style={[statsStyles.title, font(fontsLoaded, "bold")]}
                      accessibilityRole="header"
                    >
                      MATCH STATISTICS
                    </Text>
                    <View
                      style={statsStyles.headerRow}
                      importantForAccessibility="no-hide-descendants"
                      accessibilityElementsHidden
                    >
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
                        label: "Receiving points won",
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
                        label: "Break points won",
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
                              label: "Double faults",
                              p1: String(p1Stats.doubleFaults),
                              p2: String(p2Stats.doubleFaults),
                            },
                            {
                              label: "Winners",
                              p1: String(p1Stats.winners),
                              p2: String(p2Stats.winners),
                            },
                            {
                              label: "Unforced errors",
                              p1: String(p1Stats.unforcedErrors),
                              p2: String(p2Stats.unforcedErrors),
                            },
                          ]
                        : []),
                    ].map(({ label, p1, p2 }) => (
                      <View
                        key={label}
                        style={statsStyles.row}
                        accessible
                        accessibilityLabel={`${label}: ${p1Name} ${p1.replace("/", " of ")}, ${p2Name} ${p2.replace("/", " of ")}`}
                      >
                        <Text style={statsStyles.label}>{label}</Text>
                        <Text style={statsStyles.val}>{p1}</Text>
                        <Text style={statsStyles.val}>{p2}</Text>
                      </View>
                    ))}
                    <View style={statsStyles.durationBlock}>
                      <Text style={statsStyles.durationTitle}>
                        Elapsed time
                      </Text>
                      {match.liveScore.sets
                        .filter(
                          (set) =>
                            set.winner ||
                            set.setNumber === match.liveScore.currentSet,
                        )
                        .map((set) => {
                          const isCurrent =
                            set.setNumber === match.liveScore.currentSet;
                          const since =
                            set.durationMs === undefined && isCurrent
                              ? currentSetSince
                              : undefined;
                          const ms =
                            set.durationMs ??
                            (isCurrent ? currentSetFixedMs : undefined);
                          return (
                            <ElapsedText
                              key={set.setNumber}
                              since={since}
                              ms={ms}
                              prefix={`Set ${set.setNumber + 1}: `}
                              style={statsStyles.durationText}
                            />
                          );
                        })}
                      <ElapsedText
                        since={matchSince}
                        ms={matchFixedMs}
                        prefix="Match: "
                        style={statsStyles.durationText}
                      />
                    </View>
                  </View>
                )}
            </View>
          )}

          {leadWithPanels && court}
        </ScrollView>
        <TipOverlay tip={currentTip} onDismiss={() => setCurrentTip(null)} />
      </View>

      <PointTypeSheet
        playerName={pendingPoint ? names[pendingPoint] : null}
        isServer={pendingPoint !== null && match.liveScore.server === pendingPoint}
        // The sheet stays open while another point (say, from the watch) is
        // being recorded; handlePoint ignores picks made then, which dropped them.
        busy={scoring}
        onPick={(attribution) => {
          const player = pendingPoint;
          setPendingPoint(null);
          if (player) void handlePoint(player, attribution);
        }}
        onCancel={() => setPendingPoint(null)}
        fontsLoaded={fontsLoaded}
      />

      {/* Manage Match sheet */}
      <BottomSheetModal
        visible={showManage}
        onRequestClose={() => {
          if (!managing) setShowManage(false);
        }}
        backdropLabel="Close match options"
        // The scoreboard's own dark sheet, down to the home-indicator inset.
        fillColor={SB.panel}
        handleColor={SB.controlFill}
        overlayStyle={styles.manageOverlay}
        cardStyle={styles.manageCard}
      >
        <Text style={styles.manageTitle} accessibilityRole="header">
          {showPostponeOptions ? "Postpone by…" : "Match options"}
        </Text>

        {managing && (
          <View
            style={styles.manageBusy}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Saving"
          >
            <ActivityIndicator color={SB.yellow} />
            <Text style={styles.manageToggleHint}>Saving…</Text>
          </View>
        )}

        {manageError ? (
          <InlineAlert tone="error" message={manageError} />
        ) : null}

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
                  onValueChange={(value) => void tips.run(value)}
                  disabled={tips.pending}
                  trackColor={{ true: SB.yellow, false: SB.ballOff }}
                  thumbColor={match.tipsEnabled ? SB.onYellow : SB.muted}
                  accessibilityLabel="Rule tips"
                  accessibilityHint="Explains deuce, tiebreaks, and changeovers as they happen."
                />
              </View>
            )}
            {canEditScore && (
              <ManageRow
                icon="pencil"
                label="Edit score"
                onPress={() => handleOpenEditScore()}
              />
            )}
            {watchAppInstalled &&
              isParticipant &&
              (match.status === "scheduled" ||
                match.status === "in_progress") && (
                <ManageRow
                  icon="applewatch"
                  label={launchingWatch ? "Opening on watch…" : "Open on watch"}
                  disabled={launchingWatch}
                  onPress={() => void handleLaunchWatch()}
                />
              )}
            {isParticipant && match.status === "scheduled" && (
              <ManageRow
                icon="calendar"
                label="Postpone"
                onPress={() => setShowPostponeOptions(true)}
              />
            )}
            {isParticipant &&
              (match.status === "scheduled" ||
                match.status === "in_progress") && (
                <ManageRow
                  icon="xmark.circle"
                  label="Cancel match"
                  onPress={() => void handleCancelMatch()}
                />
              )}
            <ManageRow
              icon="trash"
              label="Delete match"
              danger
              onPress={() => void handleDeleteMatch()}
            />
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
              <ManageRow
                key={label}
                icon="calendar"
                label={`${label} later`}
                hint={formatWhen((match.scheduledAt ?? Date.now()) + ms)}
                onPress={() => void handlePostponeBy(ms)}
              />
            ))}
            <ManageRow
              icon={BACK_ICON}
              label="Back to match options"
              onPress={() => setShowPostponeOptions(false)}
            />
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.manageCloseBtn,
            SHOWS_PRESSED_FILL && pressed && { backgroundColor: SB.control },
          ]}
          android_ripple={managing ? undefined : { color: SB.ripple, foreground: true }}
          onPress={() => setShowManage(false)}
          disabled={managing}
          accessibilityRole="button"
          accessibilityLabel="Close match options"
        >
          <Text style={styles.manageCloseBtnText}>Close</Text>
        </Pressable>
      </BottomSheetModal>

      <EditScoreModal
        visible={showEditScore}
        sets={editSets}
        onChangeSets={(next) => {
          setEditSets(next);
          if (editError) setEditError(null);
        }}
        onSave={() => void handleSaveEditScore()}
        onCancel={() => void handleCancelEditScore()}
        saving={saveScore.pending}
        error={editError ?? saveScore.error}
        isCompleted={match.status === "completed"}
        p1Name={p1Name}
        p2Name={p2Name}
        resolving={resolvingScore}
      />

      {/* Link Opponent sheet */}
      <BottomSheetModal
        visible={showLinkOpponent}
        onRequestClose={() => {
          if (!link.pending) closeLinkOpponent();
        }}
        cardStyle={styles.sheetCard}
      >
        <Text style={styles.sheetTitle} accessibilityRole="header">
          Link your opponent's account
        </Text>
        <Text style={styles.sheetHint}>
          Find your opponent in your division. They're added to this match
          in place of the guest.
        </Text>
        <FormField
          label="Opponent's name or email"
          value={linkSearch}
          onChangeText={handleLinkSearch}
          placeholder="Start typing a name"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          editable={!link.pending}
        />
        {linkSearching ? (
          <LoadingState inline label="Searching your division" showLabel />
        ) : null}
        {linkSearchError ? (
          <InlineAlert
            tone="error"
            message={linkSearchError}
            actionLabel="Try again"
            onAction={() => handleLinkSearch(linkSearch)}
          />
        ) : null}
        {link.error ? (
          <InlineAlert tone="error" message={link.error} />
        ) : null}
        {link.pending ? (
          <LoadingState inline label="Linking player" showLabel />
        ) : null}
        {/* The sheet already scrolls, and a division search returns a
            short list, so the rows render directly rather than in a
            nested virtualized list. */}
        <View>
          {linkResults.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.linkResultRow,
                SHOWS_PRESSED_FILL && pressed && { backgroundColor: colors.surfaceMuted },
              ]}
              android_ripple={link.pending ? undefined : { color: colors.ripple }}
              onPress={() => void link.run(item)}
              disabled={link.pending}
              accessibilityRole="button"
              accessibilityLabel={`Link ${item.displayName ?? "this player"}`}
              accessibilityState={{ disabled: link.pending }}
            >
              <AppIcon name="person.crop.circle" color={colors.textMuted} />
              <Text style={styles.linkResultName} numberOfLines={1}>
                {item.displayName ?? "Unnamed player"}
              </Text>
              <Text style={styles.linkResultAction}>Link</Text>
            </Pressable>
          ))}
          {linkResults.length === 0 &&
          linkSearch.trim().length > 0 &&
          !linkSearching &&
          !linkSearchError ? (
            <Text style={styles.linkNoResults}>
              No players in your division match "{linkSearch.trim()}".
            </Text>
          ) : null}
        </View>
        <Button
          label="Cancel"
          variant="quiet"
          fullWidth
          disabled={link.pending}
          onPress={closeLinkOpponent}
        />
      </BottomSheetModal>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: SB.bg },
    errorScreen: { flex: 1, backgroundColor: colors.canvas },
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
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    sbHeaderBtnPressed: { backgroundColor: SB.control },
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
    sections: { padding: spacing.lg, gap: spacing.lg },
    center: { justifyContent: "center", alignItems: "center" },
    courtError: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8 },

    // Next-step panels under the scoreboard (clubhouse cards).
    panel: {
      gap: spacing.md,
      borderRadius: radii.lg,
      padding: spacing.lg,
      // A dark card on the black court needs an edge to read as a card.
      ...(scheme === "dark"
        ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong }
        : null),
    },
    panelTitle: { fontSize: 24, lineHeight: 28, color: colors.primary },
    panelScore: {
      fontSize: 30,
      lineHeight: 34,
      color: colors.text,
      letterSpacing: 0.5,
      fontVariant: ["tabular-nums"],
    },
    panelBody: { ...typography.body, color: colors.text },
    panelMeta: { ...typography.bodySmall, color: colors.textMuted },
    buttonStack: { gap: spacing.sm, alignSelf: "stretch" },
    statusWaiting: { ...typography.label, color: colors.warningText, textAlign: "left" },
    statusConfirmed: { ...typography.label, color: colors.successText, textAlign: "left" },
    statusMuted: { ...typography.label, color: colors.textMuted, textAlign: "left" },
    spectatorNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    spectatorText: { flex: 1, color: SB.muted, fontSize: 15, lineHeight: 21 },

    // Manage match
    manageOverlay: { backgroundColor: SB.scrim },
    manageCard: {
      backgroundColor: SB.panel,
      borderTopWidth: 2,
      borderTopColor: SB.yellow,
      padding: 16,
      paddingTop: 24,
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
    manageBusy: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: MIN_TOUCH_TARGET,
    },
    manageOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: SB.line,
      minHeight: 56,
    },
    manageOptionText: { fontSize: 17, color: SB.text, fontWeight: "600" },
    manageOptionDanger: { borderBottomWidth: 0, marginTop: 4 },
    manageOptionDangerText: { color: SB.danger },
    manageToggleRow: { gap: 12 },
    manageToggleCopy: { flex: 1, gap: 2 },
    manageToggleHint: { color: SB.muted, fontSize: 13 },
    manageCloseBtn: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 52,
      marginTop: 8,
      borderRadius: 6,
      overflow: "hidden",
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
      shadowColor: SB.bg,
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

    // Clubhouse sheets (edit score, link opponent)
    sheetCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.xl,
      gap: spacing.md,
      width: "100%",
    },
    sheetTitle: { ...typography.heading, color: colors.primary },
    sheetHint: { ...typography.bodySmall, color: colors.textMuted },
    linkResultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 52,
      paddingHorizontal: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    linkResultName: { ...typography.body, flex: 1, fontWeight: "600", color: colors.text },
    linkResultAction: { ...typography.label, color: colors.primary },
    linkNoResults: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: "center",
      marginVertical: spacing.md,
    },
  }),
);

const statsStyles = StyleSheet.create({
  section: {
    backgroundColor: SB.panel,
    borderRadius: radii.lg,
    padding: 20,
  },
  title: {
    color: SB.text,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
  },
  headerRow: { flexDirection: "row", marginBottom: 6 },
  headerStat: { flex: 2.5, fontSize: 12, color: SB.muted },
  headerPlayer: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: SB.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: SB.line,
  },
  label: { flex: 2.5, fontSize: 15, color: SB.text },
  val: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: SB.text,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  durationBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: SB.line,
  },
  durationTitle: {
    color: SB.yellow,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 6,
  },
  durationText: {
    color: SB.text,
    fontSize: 14,
    lineHeight: 22,
    fontVariant: ["tabular-nums"],
  },
});

const useEditScoreStyles = makeStyles((colors) =>
  StyleSheet.create({
    // The same gap as the input rows below, so each name sits over its column.
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    headerSet: {
      flex: 1.5,
      ...typography.label,
      color: colors.textMuted,
    },
    headerName: {
      flex: 2,
      ...typography.label,
      color: colors.primary,
      textAlign: "center",
    },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    setLabel: { flex: 1.5, ...typography.label, color: colors.text },
    setInput: {
      flex: 2,
      minHeight: 48,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
      color: colors.text,
    },
    setActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
  }),
);
