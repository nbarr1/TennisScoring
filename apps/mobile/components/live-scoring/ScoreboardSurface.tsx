import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import {
  formatScoreDisplay,
  getMatchMoment,
  type Match,
  type MatchMomentTone,
  type Player,
} from "@tennis/shared";
import { AppIcon } from "../AppIcon";
import { SHOWS_PRESSED_FILL, useReduceMotion } from "../../theme";
import { BAND_TONES, SB, font, shortName } from "./scoreboardTheme";
import { serverFirstCall, spokenPoint } from "./scoreSpeech";

const FLAG_LABELS = {
  BP: "BREAK POINT",
  SP: "SET POINT",
  MP: "MATCH POINT",
} as const;
const UNDO_HOLD_MS = 1000;
/** How long a scored row glows: enough to see between points, never in the way. */
const FLASH_MS = 420;
/** Peak opacity of the yellow glow: faint enough that the numerals stay readable. */
const FLASH_PEAK = 0.22;

type Props = {
  match: Match;
  /** A participant scoring a match in progress: rows are tap targets and the undo bar shows. */
  interactive: boolean;
  compact: boolean;
  fontsLoaded: boolean;
  swapped: boolean;
  onSwap: () => void;
  onPoint: (player: Player) => void;
  scoring: boolean;
  /** The row whose point is on its way to the server, if any. */
  recordingFor?: Player | null;
  /** The last point that landed; a change of `seq` flashes that row once. */
  lastPoint?: { player: Player; seq: number } | null;
  onUndo: () => void;
  canUndo: boolean;
  undoHint: string;
  /** What screen readers hear for the undo target ("30, 15. Games: …"). */
  undoSpoken?: string;
};

function pointValue(match: Match, player: Player): string {
  const score = match.liveScore;
  if (score.isTiebreak && score.tiebreakScore) {
    return String(
      player === "player1"
        ? score.tiebreakScore.player1Points
        : score.tiebreakScore.player2Points,
    );
  }
  return score.currentGame[player] === "Ad" ? "AD" : score.currentGame[player];
}

function bandText(
  tone: MatchMomentTone,
  match: Match,
  who: string,
  points: Record<Player, string>,
  interactive: boolean,
): string {
  const server = match.liveScore.server;
  const receiver: Player = server === "player1" ? "player2" : "player1";
  switch (tone) {
    case "deuce":
      return "Deuce";
    case "ad":
      return `Advantage · ${who}`;
    case "sp":
      return `Set point · ${who}`;
    case "bp":
      return `Break point · ${who}`;
    case "mp":
      return `Match point · ${who}`;
    case "tb":
      return `Tiebreak ${points[server]}–${points[receiver]}`;
    case "ok":
      // Only a participant's scoreboard can swap ends; a read-only one just says so.
      return interactive ? "Change ends · tap to swap" : "Change ends";
    default:
      return serverFirstCall(match.liveScore);
  }
}

/**
 * Whether the scoreboard shows a result. A disputed match was played to the
 * end, and a match cancelled mid-play has a partial score worth showing;
 * treating either as unplayed printed "Not started" above a full scoreboard.
 */
function resultLabel(match: Match): string | null {
  switch (match.status) {
    case "pending_report":
    case "completed":
      return "Final";
    case "disputed":
      return "Disputed";
    case "cancelled": {
      const played =
        match.startedAt !== undefined ||
        match.liveScore.sets.some((set) => set.player1Games + set.player2Games > 0);
      return played ? "Cancelled" : null;
    }
    default:
      return null;
  }
}

/** Band text before a match starts: says what happens next, not just that nothing has. */
function notStartedText(match: Match): string {
  switch (match.status) {
    case "proposed":
      return "Proposed · not scheduled yet";
    case "scheduled":
      return "Scheduled · not started";
    case "cancelled":
      return "Cancelled";
    default:
      return "Not started";
  }
}

/**
 * The split scoreboard: each player's full-width row is the button that
 * scores their point, with a status band between the rows that reads the
 * umpire's call or the moment (deuce, break point, change ends).
 */
function ScoreboardSurfaceView({
  match,
  interactive,
  compact,
  fontsLoaded,
  swapped,
  onSwap,
  onPoint,
  scoring,
  recordingFor = null,
  lastPoint = null,
  onUndo,
  canUndo,
  undoHint,
  undoSpoken,
}: Props) {
  const holdProgress = useRef(new Animated.Value(0)).current;
  const flash = useRef({
    player1: new Animated.Value(0),
    player2: new Animated.Value(0),
  }).current;
  const reduceMotion = useReduceMotion();
  const score = match.liveScore;
  const live = match.status === "in_progress";
  const finalLabel = resultLabel(match);
  const finished = finalLabel !== null;
  const moment = getMatchMoment(score, match.format);
  const names: Record<Player, string> = {
    player1: match.player1Name ?? "Player 1",
    player2: match.player2Name ?? "Player 2",
  };
  const points: Record<Player, string> = {
    player1: pointValue(match, "player1"),
    player2: pointValue(match, "player2"),
  };
  // Room for every set the format allows: best of five needs five boxes.
  const maxSets = Math.max(3, (match.format?.setsToWin ?? 2) * 2 - 1);
  const sets = score.sets
    .filter(
      (set) => set.winner !== undefined || set.setNumber === score.currentSet,
    )
    .slice(0, maxSets);
  const court = score.serviceSide === "advantage" ? "AD" : "DEUCE";

  // Acknowledge a landed point on its row. The glow is a colour change, not
  // movement, so it stays under Reduce Motion, just without the fade.
  useEffect(() => {
    if (!lastPoint) return;
    const value = flash[lastPoint.player];
    value.stopAnimation();
    if (reduceMotion) {
      value.setValue(FLASH_PEAK);
      const timer = setTimeout(() => value.setValue(0), FLASH_MS);
      return () => clearTimeout(timer);
    }
    value.setValue(FLASH_PEAK);
    Animated.timing(value, {
      toValue: 0,
      duration: FLASH_MS,
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [lastPoint?.seq]);

  const tone: MatchMomentTone = live ? moment.tone : "live";
  const band = BAND_TONES[tone];
  const who = moment.player ? shortName(names[moment.player]) : "";
  const text = finished
    ? `${finalLabel} · ${formatScoreDisplay(score).replace(/, /g, "  ")}`
    : live
      ? bandText(tone, match, who, points, interactive)
      : notStartedText(match);
  const bandIsSwap = interactive && tone === "ok";

  // A read-only scoreboard (before or after the match, or for a spectator)
  // sits above other content, so it takes the compact type scale.
  const sizes =
    compact || !interactive
      ? {
          name: 26,
          point: 118,
          game: 26,
          box: 36,
          boxH: 40,
          band: 60,
          bar: 68,
          rowMin: interactive ? 190 : 0,
        }
      : {
          name: 32,
          point: 172,
          game: 32,
          box: 44,
          boxH: 50,
          band: 72,
          bar: 80,
          rowMin: 0,
        };

  function setGames(set: (typeof sets)[number], player: Player): number {
    if (set.matchTiebreak && set.tiebreak) {
      return player === "player1"
        ? set.tiebreak.player1Points
        : set.tiebreak.player2Points;
    }
    return player === "player1" ? set.player1Games : set.player2Games;
  }

  function renderRow(player: Player) {
    const other: Player = player === "player1" ? "player2" : "player1";
    const setsWon =
      player === "player1" ? score.player1SetsWon : score.player2SetsWon;
    const otherSetsWon =
      other === "player1" ? score.player1SetsWon : score.player2SetsWon;
    const winner = finished && match.winner === player;
    const loser = finished && match.winner === other;
    const serving = live && score.server === player;
    const recording = interactive && recordingFor === player;
    const momentFlag = live ? moment.flags[player] : undefined;
    const flag = winner
      ? "WINNER"
      : momentFlag
        ? FLAG_LABELS[momentFlag]
        : undefined;
    const flagBg = winner ? SB.yellow : BAND_TONES[moment.tone].bg;
    const big = finished ? String(setsWon) : points[player];
    const serveText = recording
      ? "ADDING POINT…"
      : finished
        ? "SETS WON"
        : serving
          ? `SERVING · ${court} COURT`
          : live
            ? "RECEIVING"
            : "";
    const currentSet = score.sets[score.currentSet];
    const gamesNow = currentSet ? setGames(currentSet, player) : 0;

    // One spoken summary per row, instead of a stop on every number.
    const spokenState = finished
      ? `${winner ? "winner, " : ""}${setsWon} sets to ${otherSetsWon}. Set scores ${sets
          .map((set) => `${setGames(set, player)}`)
          .join(", ")}`
      : live
        ? `${spokenPoint(big === "AD" ? "Ad" : big)}, ${gamesNow} games this set, ${setsWon} sets${
            serving ? `, serving from the ${court.toLowerCase()} court` : ", receiving"
          }${flag ? `, ${flag.toLowerCase()}` : ""}`
        : "not started";

    const content = (
      <>
        <View
          style={[
            styles.stripe,
            {
              backgroundColor: player === "player1" ? SB.stripeP1 : SB.stripeP2,
            },
          ]}
        />
        <View style={styles.rowBody}>
          <View style={styles.nameLine}>
            <Text
              style={[
                styles.name,
                font(fontsLoaded, "bold"),
                { fontSize: sizes.name, color: loser ? SB.lost : SB.text },
              ]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
            >
              {names[player].toUpperCase()}
            </Text>
            {flag && (
              <Text
                style={[
                  styles.flag,
                  font(fontsLoaded, "extrabold"),
                  { backgroundColor: flagBg },
                ]}
                maxFontSizeMultiplier={1.2}
              >
                {flag}
              </Text>
            )}
          </View>
          {serveText !== "" && (
            <View style={styles.serveLine}>
              {recording ? (
                <ActivityIndicator size="small" color={SB.yellow} />
              ) : (
                !finished && (
                  <View
                    style={[
                      styles.ball,
                      { backgroundColor: serving ? SB.yellow : SB.ballOff },
                    ]}
                  />
                )
              )}
              <Text
                style={[
                  styles.serveText,
                  font(fontsLoaded, "bold"),
                  { color: serving || recording ? SB.yellow : SB.muted },
                ]}
                maxFontSizeMultiplier={1.3}
              >
                {serveText}
              </Text>
            </View>
          )}
          <View style={styles.bottomLine}>
            <View style={styles.games}>
              {sets.map((set) => {
                const current = live && set.setNumber === score.currentSet;
                const setWon = set.winner === player;
                return (
                  <View
                    key={set.setNumber}
                    style={[
                      styles.gameBox,
                      {
                        width: sizes.box,
                        height: sizes.boxH,
                        borderColor: current ? SB.yellow : "transparent",
                        backgroundColor: current
                          ? "transparent"
                          : setWon
                            ? SB.wonSet
                            : SB.lostSet,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        font(fontsLoaded, "bold"),
                        {
                          fontSize: sizes.game,
                          color: setWon || current ? SB.text : SB.lost,
                        },
                      ]}
                      maxFontSizeMultiplier={1.1}
                    >
                      {setGames(set, player)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text
              style={[
                styles.point,
                font(fontsLoaded, "bold"),
                {
                  fontSize: sizes.point,
                  lineHeight: sizes.point * 0.9,
                  color: big === "AD" ? SB.yellow : loser ? SB.lost : SB.text,
                },
              ]}
              maxFontSizeMultiplier={1.1}
            >
              {big}
            </Text>
          </View>
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.flash, { opacity: flash[player] }]}
        />
      </>
    );

    if (!interactive) {
      return (
        <View
          key={player}
          accessible
          accessibilityLabel={`${names[player]}, ${spokenState}`}
          style={[
            styles.row,
            {
              minHeight: sizes.rowMin,
              backgroundColor: winner ? SB.winnerRow : SB.row,
            },
          ]}
        >
          {content}
        </View>
      );
    }
    return (
      <Pressable
        key={player}
        onPress={() => onPoint(player)}
        disabled={scoring}
        android_ripple={{ color: SB.ripple, foreground: true }}
        style={({ pressed }) => [
          styles.row,
          {
            minHeight: sizes.rowMin,
            backgroundColor:
              (SHOWS_PRESSED_FILL && pressed) || recording
                ? SB.pressedRow
                : SB.row,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Point to ${names[player]}`}
        accessibilityValue={{ text: spokenState }}
        accessibilityState={{ disabled: scoring, busy: recording }}
      >
        {content}
      </Pressable>
    );
  }

  const order: Player[] = swapped
    ? ["player2", "player1"]
    : ["player1", "player2"];

  const undoDisabled = !canUndo || scoring;
  function onUndoAction(event: AccessibilityActionEvent) {
    // Screen readers cannot hold a key on a timer; their double-tap (or
    // double-tap-and-hold) is already a deliberate act, so it undoes directly.
    if (
      !undoDisabled &&
      (event.nativeEvent.actionName === "activate" ||
        event.nativeEvent.actionName === "longpress")
    ) {
      onUndo();
    }
  }

  return (
    <View style={[styles.surface, !interactive && styles.surfaceStatic]}>
      {renderRow(order[0])}
      <Pressable
        onPress={bandIsSwap ? onSwap : undefined}
        disabled={!bandIsSwap}
        accessibilityRole={bandIsSwap ? "button" : "text"}
        accessibilityLabel={bandIsSwap ? "Change ends. Swap the rows" : text}
        // A participant hears each point through the screen's own
        // announcement; the live region is for spectators, whose score
        // changes on someone else's phone.
        accessibilityLiveRegion={interactive ? "none" : "polite"}
        style={[
          styles.band,
          { minHeight: sizes.band, backgroundColor: band.bg },
        ]}
      >
        {bandIsSwap && <AppIcon name="arrow.up.arrow.down" color={band.fg} />}
        <Text
          style={[
            styles.bandText,
            font(fontsLoaded, "extrabold"),
            { color: band.fg, fontSize: tone === "live" && live ? 34 : 26 },
          ]}
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {text.toUpperCase()}
        </Text>
      </Pressable>
      {renderRow(order[1])}

      {interactive && (
        <View style={[styles.bar, { minHeight: sizes.bar }]}>
          <Pressable
            onPressIn={() => {
              if (undoDisabled) return;
              Animated.timing(holdProgress, {
                toValue: 1,
                duration: UNDO_HOLD_MS,
                useNativeDriver: false,
              }).start();
            }}
            onPressOut={() => {
              holdProgress.stopAnimation();
              holdProgress.setValue(0);
            }}
            onLongPress={onUndo}
            delayLongPress={UNDO_HOLD_MS}
            disabled={undoDisabled}
            android_ripple={undoDisabled ? undefined : { color: SB.ripple, foreground: true }}
            style={[styles.undo, undoDisabled && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel={canUndo ? "Undo last point" : "Nothing to undo"}
            accessibilityValue={
              canUndo && undoSpoken ? { text: `Back to ${undoSpoken}` } : undefined
            }
            accessibilityState={{ disabled: undoDisabled }}
            accessibilityActions={[
              { name: "activate", label: "Undo last point" },
              { name: "longpress", label: "Undo last point" },
            ]}
            onAccessibilityAction={onUndoAction}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.undoFill,
                {
                  width: holdProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
            <AppIcon name="arrow.uturn.backward" color={SB.text} />
            <View style={styles.undoCopy}>
              <Text
                style={[styles.undoTitle, font(fontsLoaded, "bold")]}
                maxFontSizeMultiplier={1.3}
              >
                {canUndo ? "HOLD TO UNDO" : "NOTHING TO UNDO"}
              </Text>
              <Text
                style={styles.undoHint}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {undoHint}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onSwap}
            android_ripple={{ color: SB.ripple, foreground: true }}
            style={({ pressed }) => [
              styles.swap,
              SHOWS_PRESSED_FILL && pressed && { backgroundColor: SB.controlFill },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Swap ends"
            accessibilityHint="Swaps which player's row is on top."
          >
            <AppIcon name="arrow.up.arrow.down" color={SB.text} />
            <Text
              style={[styles.swapText, font(fontsLoaded, "bold")]}
              maxFontSizeMultiplier={1.2}
            >
              SWAP
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Memoized: the match screen re-renders for sheets, notices, and the like,
 * and none of those change the scoreboard. Callers pass stable callbacks.
 */
export const ScoreboardSurface = React.memo(ScoreboardSurfaceView);

const styles = StyleSheet.create({
  surface: { flex: 1, minHeight: 0 },
  surfaceStatic: { flex: 0 },
  row: {
    flex: 1,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: SB.line,
    overflow: "hidden",
  },
  stripe: { width: 10 },
  rowBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 6,
  },
  nameLine: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { flex: 1, lineHeight: undefined },
  flag: {
    color: SB.onYellow,
    fontSize: 18,
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  serveLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 22,
  },
  ball: { width: 16, height: 16, borderRadius: 8 },
  serveText: { fontSize: 18, letterSpacing: 1 },
  bottomLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  games: { flexDirection: "row", gap: 6 },
  gameBox: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  point: {
    letterSpacing: -2,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  flash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SB.yellow,
    opacity: 0,
  },
  band: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  bandText: { letterSpacing: 1, flexShrink: 1 },
  bar: {
    flexDirection: "row",
    // A wider gap than before keeps a thumb aimed at Swap off the undo key.
    gap: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  undo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 6,
    backgroundColor: SB.control,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  undoFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SB.controlFill,
  },
  undoCopy: { flexShrink: 1 },
  undoTitle: { color: SB.text, fontSize: 21, letterSpacing: 1 },
  undoHint: { color: SB.muted, fontSize: 13, fontWeight: "500" },
  disabled: { opacity: 0.45 },
  swap: {
    width: 76,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: SB.control,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  swapText: { color: SB.text, fontSize: 15, letterSpacing: 1 },
});
