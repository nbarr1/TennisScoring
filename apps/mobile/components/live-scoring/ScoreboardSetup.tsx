import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import type { Player } from "@tennis/shared";
import { AppIcon } from "../AppIcon";
import { InlineAlert } from "../../theme";
import { SB, font } from "./scoreboardTheme";

type Props = {
  names: Record<Player, string>;
  server: Player;
  onPickServer: (player: Player) => void;
  formatLabel: string;
  /** When the match is booked for, so opening it early doesn't read as "start now". */
  scheduledLabel?: string;
  advancedStats: boolean;
  onToggleAdvancedStats: (value: boolean) => void;
  onStart: () => void;
  /** The start write is in flight; the button ignores further taps. */
  starting: boolean;
  /** Why the last start failed, shown above the button with a retry. */
  startError?: string | null;
  watchAppInstalled: boolean;
  launchingWatch: boolean;
  onLaunchWatch: () => void;
  fontsLoaded: boolean;
};

/** Pre-match surface: pick who serves first, then start. */
export function ScoreboardSetup({
  names,
  server,
  onPickServer,
  formatLabel,
  scheduledLabel,
  advancedStats,
  onToggleAdvancedStats,
  onStart,
  starting,
  startError = null,
  watchAppInstalled,
  launchingWatch,
  onLaunchWatch,
  fontsLoaded,
}: Props) {
  return (
    <View style={styles.surface}>
      <Text
        style={[styles.heading, font(fontsLoaded, "extrabold")]}
        accessibilityRole="header"
      >
        WHO SERVES FIRST?
      </Text>
      <Text style={styles.lead} maxFontSizeMultiplier={1.4}>
        Pick the first server, then start. During play, tap a player's row
        to give them the point.
      </Text>
      <View accessibilityRole="radiogroup" style={styles.serverGroup}>
      {(["player1", "player2"] as const).map((player) => {
        const selected = server === player;
        return (
          <Pressable
            key={player}
            onPress={() => onPickServer(player)}
            style={({ pressed }) => [
              styles.card,
              { borderColor: selected ? SB.yellow : SB.panel },
              pressed && { backgroundColor: SB.pressedRow },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            accessibilityLabel={`${names[player]} serves first`}
          >
            <View
              style={[
                styles.stripe,
                {
                  backgroundColor:
                    player === "player1" ? SB.stripeP1 : SB.stripeP2,
                },
              ]}
            />
            <View style={styles.cardBody}>
              <Text
                style={[styles.cardName, font(fontsLoaded, "bold")]}
                numberOfLines={2}
              >
                {names[player].toUpperCase()}
              </Text>
              <View style={styles.cardNote}>
                <View
                  style={[
                    styles.ball,
                    { backgroundColor: selected ? SB.yellow : SB.ballOff },
                  ]}
                />
                <Text
                  style={[
                    styles.cardNoteText,
                    font(fontsLoaded, "bold"),
                    { color: selected ? SB.yellow : SB.muted },
                  ]}
                >
                  {selected ? "SERVES FIRST" : "TAP TO SERVE FIRST"}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
      </View>

      <View style={styles.options}>
          {scheduledLabel ? (
          <View style={[styles.optionRow, styles.optionDivider]}>
            <Text style={styles.optionTitle}>Scheduled</Text>
            <Text style={styles.optionValue}>{scheduledLabel}</Text>
          </View>
        ) : null}
        <View style={[styles.optionRow, styles.optionDivider]}>
          <Text style={styles.optionTitle}>Format</Text>
          <Text style={styles.optionValue}>{formatLabel}</Text>
        </View>
        <View style={styles.optionRow}>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Advanced stats</Text>
            <Text style={styles.optionHint}>
              Choose ace, winner, or error with each point.
            </Text>
          </View>
          <Switch
            value={advancedStats}
            onValueChange={onToggleAdvancedStats}
            trackColor={{ true: SB.yellow, false: SB.ballOff }}
            thumbColor={advancedStats ? SB.onYellow : SB.muted}
            accessibilityLabel="Advanced stats"
            accessibilityHint="Asks for ace, winner, or error with each point."
          />
        </View>
      </View>

      {watchAppInstalled && (
        <Pressable
          onPress={onLaunchWatch}
          disabled={launchingWatch}
          style={({ pressed }) => [
            styles.watch,
            pressed && { backgroundColor: SB.control },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Tennis League on your watch"
          accessibilityState={{ disabled: launchingWatch, busy: launchingWatch }}
        >
          <AppIcon name="applewatch" color={SB.yellow} />
          <Text style={[styles.watchText, font(fontsLoaded, "bold")]}>
            {launchingWatch ? "OPENING ON WATCH…" : "OPEN ON WATCH"}
          </Text>
        </Pressable>
      )}

      <View style={styles.spacer} />
      {startError ? (
        <InlineAlert
          tone="error"
          title="Couldn't start the match"
          message={startError}
          actionLabel="Try again"
          onAction={onStart}
        />
      ) : null}
      <Pressable
        onPress={onStart}
        disabled={starting}
        style={({ pressed }) => [
          styles.start,
          (pressed || starting) && styles.startPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Start match, ${names[server]} serves`}
        accessibilityState={{ disabled: starting, busy: starting }}
      >
        <Text style={[styles.startText, font(fontsLoaded, "extrabold")]}>
          {starting ? "STARTING…" : "START MATCH"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  heading: {
    color: SB.text,
    fontSize: 40,
    letterSpacing: 0.5,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  card: {
    minHeight: 120,
    flexDirection: "row",
    borderWidth: 3,
    borderRadius: 6,
    backgroundColor: SB.card,
    overflow: "hidden",
  },
  stripe: { width: 10 },
  cardBody: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "space-between",
    gap: 8,
  },
  lead: {
    color: SB.muted,
    fontSize: 15,
    lineHeight: 21,
    marginHorizontal: 4,
    marginTop: -8,
  },
  serverGroup: { gap: 12 },
  cardName: { color: SB.text, fontSize: 34 },
  cardNote: { flexDirection: "row", alignItems: "center", gap: 8 },
  ball: { width: 18, height: 18, borderRadius: 9 },
  cardNoteText: { fontSize: 19, letterSpacing: 1 },
  options: { backgroundColor: SB.card, borderRadius: 6 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: SB.line },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { color: SB.text, fontSize: 16, fontWeight: "600" },
  optionValue: { color: SB.muted, fontSize: 16, flexShrink: 1, textAlign: "right" },
  optionHint: { color: SB.muted, fontSize: 13 },
  watch: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: SB.yellow,
  },
  watchText: { color: SB.yellow, fontSize: 19, letterSpacing: 1 },
  spacer: { flex: 1 },
  start: {
    minHeight: 72,
    borderRadius: 6,
    backgroundColor: SB.yellow,
    alignItems: "center",
    justifyContent: "center",
  },
  startPressed: { opacity: 0.85 },
  startText: { color: SB.onYellow, fontSize: 26, letterSpacing: 1.5 },
});
