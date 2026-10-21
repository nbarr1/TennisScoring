import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PointAttribution } from "@tennis/firebase-client";
import { useContentWidth } from "../../theme";
import { SB, font } from "./scoreboardTheme";

type Props = {
  /** The player the point goes to; the sheet is hidden while this is null. */
  playerName: string | null;
  /** Whether that player is serving. Only the server can hit an ace. */
  isServer: boolean;
  /** A point is being recorded; picks wait for it rather than getting dropped. */
  busy: boolean;
  onPick: (attribution?: PointAttribution) => void;
  onCancel: () => void;
  fontsLoaded: boolean;
};

const CHOICES: {
  label: string;
  spoken: string;
  attribution?: PointAttribution;
}[] = [
  { label: "POINT", spoken: "Point, no detail" },
  { label: "ACE", spoken: "Ace", attribution: "ace" },
  { label: "WINNER", spoken: "Winner", attribution: "winner" },
  {
    label: "OPPONENT ERROR",
    spoken: "Opponent error",
    attribution: "opponent_error",
  },
];

/**
 * With advanced stats on, a tap on a player's row asks what kind of point it
 * was before scoring it. "Point" scores it unattributed, and Cancel scores
 * nothing, so a stray tap is always recoverable.
 */
export function PointTypeSheet({
  playerName,
  isServer,
  busy,
  onPick,
  onCancel,
  fontsLoaded,
}: Props) {
  const insets = useSafeAreaInsets();
  // Centered at the sheet width on a tablet; undefined on phones.
  const sheetWidth = useContentWidth("sheet");
  const choices = CHOICES.filter((choice) => isServer || choice.attribution !== "ace");
  return (
    <Modal
      visible={playerName !== null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        // The Cancel button below is the screen-reader route out; the
        // backdrop is a tap target for sighted users only.
        accessible={false}
        importantForAccessibility="no"
      >
        <Pressable
          style={[styles.sheet, sheetWidth, { paddingBottom: 20 + insets.bottom }]}
          accessibilityViewIsModal
          accessible={false}
        >
          <Text
            style={[styles.title, font(fontsLoaded, "extrabold")]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
          >
            POINT TO {(playerName ?? "").toUpperCase()}
          </Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
            {busy ? "Saving the last point…" : "How was it won?"}
          </Text>
          <View style={styles.grid}>
            {choices.map((choice, index) => (
              <Pressable
                key={choice.label}
                onPress={() => onPick(choice.attribution)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.choice,
                  index === 0 ? styles.primary : styles.secondary,
                  pressed && styles.pressed,
                  busy && styles.busy,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${choice.spoken} for ${playerName ?? "this player"}`}
                accessibilityState={{ disabled: busy, busy }}
              >
                <Text
                  style={[
                    styles.choiceText,
                    font(fontsLoaded, "extrabold"),
                    { color: index === 0 ? SB.onYellow : SB.yellow },
                  ]}
                  maxFontSizeMultiplier={1.3}
                >
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancel,
              pressed && { backgroundColor: SB.control },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel, no point added"
          >
            <Text style={[styles.cancelText, font(fontsLoaded, "bold")]}>
              CANCEL
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  busy: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  backdrop: {
    flex: 1,
    backgroundColor: SB.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: SB.panel,
    borderTopWidth: 2,
    borderTopColor: SB.yellow,
    padding: 12,
    gap: 12,
  },
  title: {
    color: SB.text,
    fontSize: 24,
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  subtitle: { color: SB.muted, fontSize: 15, paddingHorizontal: 4, marginTop: -6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 72,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  primary: { backgroundColor: SB.yellow },
  secondary: { borderWidth: 2, borderColor: SB.yellow },
  choiceText: { fontSize: 22, letterSpacing: 1, textAlign: "center" },
  cancel: {
    minHeight: 52,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: SB.controlFill,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: SB.text, fontSize: 20, letterSpacing: 1 },
});
