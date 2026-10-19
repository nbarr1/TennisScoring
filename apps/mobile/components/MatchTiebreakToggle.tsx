import React from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { canBeMatchTiebreak } from "@tennis/shared";
import { colors, MIN_TOUCH_TARGET, spacing, typography } from "../theme";

export type SetDraft = { p1: string; p2: string; matchTiebreak?: boolean };

/** Clears the match tiebreak flag from any row that is no longer the deciding set. */
export function withEligibleTiebreaks(rows: SetDraft[]): SetDraft[] {
  return rows.map((row, i) =>
    row.matchTiebreak && !canBeMatchTiebreak(i, rows.length)
      ? { p1: row.p1, p2: row.p2 }
      : row,
  );
}

/**
 * The "played as a match tiebreak" switch under a score editor's deciding set.
 * Renders nothing for any other row.
 *
 * The whole row is one accessible switch: tapping the label toggles it too,
 * and screen readers hear the label, role, and on/off state in one stop.
 */
export function MatchTiebreakToggle({
  sets,
  index,
  onChangeSets,
}: {
  sets: SetDraft[];
  index: number;
  onChangeSets: (next: SetDraft[]) => void;
}) {
  if (!canBeMatchTiebreak(index, sets.length)) return null;
  const enabled = !!sets[index]?.matchTiebreak;
  const setValue = (value: boolean) =>
    onChangeSets(
      sets.map((s, i) => (i === index ? { ...s, matchTiebreak: value } : s)),
    );

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`Set ${index + 1} played as a 10-point match tiebreak`}
      accessibilityHint={
        enabled ? "Enter the tiebreak points as the set score" : undefined
      }
      accessibilityState={{ checked: enabled }}
      onPress={() => setValue(!enabled)}
      android_ripple={{ color: "rgba(26, 71, 42, 0.12)" }}
      style={styles.row}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch
          value={enabled}
          onValueChange={setValue}
          trackColor={{ true: colors.primary, false: colors.disabled }}
          thumbColor={Platform.OS === "android" ? colors.surface : undefined}
          ios_backgroundColor={colors.disabled}
        />
      </View>
      <Text style={styles.label}>
        Played as a 10-point match tiebreak (enter points)
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
  },
  label: { ...typography.bodySmall, flex: 1, color: colors.text },
});
