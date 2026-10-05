import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { PointAttribution } from "@tennis/firebase-client";
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

const CHOICES: { label: string; attribution?: PointAttribution }[] = [
  { label: "POINT" },
  { label: "ACE", attribution: "ace" },
  { label: "WINNER", attribution: "winner" },
  { label: "OPPONENT ERROR", attribution: "opponent_error" },
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
        accessibilityLabel="Cancel"
      >
        <Pressable style={styles.sheet} accessibilityViewIsModal>
          <Text style={[styles.title, font(fontsLoaded, "extrabold")]}>
            POINT TO {(playerName ?? "").toUpperCase()}
          </Text>
          <View style={styles.grid}>
            {choices.map((choice, index) => (
              <Pressable
                key={choice.label}
                onPress={() => onPick(choice.attribution)}
                disabled={busy}
                style={[
                  styles.choice,
                  index === 0 ? styles.primary : styles.secondary,
                  busy && styles.busy,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
              >
                <Text
                  style={[
                    styles.choiceText,
                    font(fontsLoaded, "extrabold"),
                    { color: index === 0 ? SB.onYellow : SB.yellow },
                  ]}
                >
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onCancel}
            style={styles.cancel}
            accessibilityRole="button"
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: SB.panel,
    borderTopWidth: 2,
    borderTopColor: SB.yellow,
    padding: 12,
    paddingBottom: 20,
    gap: 12,
  },
  title: {
    color: SB.text,
    fontSize: 24,
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
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
