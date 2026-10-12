import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { canBeMatchTiebreak } from "@tennis/shared";
import { colors } from "../theme";

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
  return (
    <View style={styles.row}>
      <Switch
        value={enabled}
        onValueChange={(value) =>
          onChangeSets(
            sets.map((s, i) =>
              i === index ? { ...s, matchTiebreak: value } : s,
            ),
          )
        }
        trackColor={{ true: colors.primary, false: colors.disabled }}
        accessibilityLabel={`Set ${index + 1} played as a 10-point match tiebreak`}
      />
      <Text style={styles.label}>
        Played as a 10-point match tiebreak (enter points)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { flex: 1, fontSize: 13, color: colors.textMuted },
});
