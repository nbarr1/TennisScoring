import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { searchDivisionPlayers } from "@tennis/firebase-client";
import type { PublicProfile } from "@tennis/shared";
import {
  announce,
  Button,
  colors,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
} from "../theme";

/**
 * One player slot: a debounced division search that resolves to a single
 * selection, with a Change action to clear it.
 *
 * Doubles needs three of these alongside the signed-in player (a partner and
 * two opponents), so the search-and-select behaviour lives here rather than
 * being hand-rolled per modal.
 */
export function PlayerSlotPicker({
  label,
  divisionId,
  excludeIds,
  selected,
  onSelect,
  onClear,
  placeholder,
}: {
  label: string;
  divisionId: string;
  /** Players already chosen elsewhere, so nobody can be picked into two slots. */
  excludeIds: string[];
  selected: PublicProfile | null;
  onSelect: (player: PublicProfile) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  // The text the current results answer, so "no players" never shows for a
  // query whose search has not run yet (during the debounce).
  const [searchedText, setSearchedText] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Focus the search box after "Change", so the user can type straight away.
  const [focusSearch, setFocusSearch] = useState(false);

  const excludeKey = excludeIds.join(",");
  const query = searchText.trim();

  useEffect(() => {
    if (!query || selected) {
      setResults([]);
      setFailed(false);
      setSearching(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setFailed(false);
      try {
        const found = await searchDivisionPlayers(divisionId, searchText);
        if (!active) return;
        const eligible = found.filter((u) => !excludeIds.includes(u.id));
        setResults(eligible);
        setSearchedText(searchText);
        // Results appear below the field, away from focus: say how many.
        announce(
          eligible.length === 0
            ? "No players found"
            : eligible.length === 1
              ? "1 player found"
              : `${eligible.length} players found`,
        );
      } catch {
        if (!active) return;
        setResults([]);
        setFailed(true);
        announce("Couldn't search players");
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // excludeKey stands in for excludeIds so a new array identity each render
    // does not restart the search; `attempt` re-runs it after a failure.
  }, [searchText, divisionId, selected, excludeKey, attempt]);

  if (selected) {
    return (
      <View style={styles.block}>
        <Text
          style={styles.label}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {label}
        </Text>
        <View style={styles.selectedRow}>
          <Text
            style={styles.selectedName}
            accessibilityLabel={`${label}: ${selected.displayName}`}
            numberOfLines={2}
          >
            {selected.displayName}
          </Text>
          <Button
            label="Change"
            variant="quiet"
            size="compact"
            accessibilityLabel={`Change ${label}`}
            onPress={() => {
              onClear();
              setSearchText("");
              setResults([]);
              setFocusSearch(true);
            }}
          />
        </View>
      </View>
    );
  }

  const showNoResults =
    query.length > 0 &&
    searchedText === searchText &&
    !searching &&
    !failed &&
    results.length === 0;

  return (
    <View style={styles.block}>
      <Text
        style={styles.label}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel={`Search for ${label}`}
          accessibilityHint="Type a name or email, then choose a player from the list"
          style={styles.input}
          value={searchText}
          onChangeText={setSearchText}
          placeholder={placeholder ?? "Name or email"}
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={focusSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching && (
          <ActivityIndicator
            style={styles.spinner}
            color={colors.primary}
            accessibilityLabel="Searching players"
          />
        )}
      </View>
      {results.length > 0 && (
        <View style={styles.results}>
          {results.map((item, i) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Select ${item.displayName} as ${label}`}
              android_ripple={{ color: "rgba(26, 71, 42, 0.12)" }}
              style={({ pressed }) => [
                styles.resultRow,
                i > 0 && styles.resultDivider,
                pressed && Platform.OS === "ios" && styles.resultPressed,
              ]}
              onPress={() => {
                onSelect(item);
                setSearchText("");
                setResults([]);
                announce(`${item.displayName} selected as ${label}`);
              }}
            >
              <Text style={styles.resultName} numberOfLines={2}>
                {item.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {failed && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>
            Couldn&apos;t search players. Check your connection and try again.
          </Text>
          <Button
            label="Try again"
            variant="quiet"
            size="compact"
            onPress={() => setAttempt((n) => n + 1)}
          />
        </View>
      )}
      {showNoResults && (
        <Text style={styles.noResults}>
          No players in this division match “{query}”.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.md },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  searchRow: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  spinner: { marginLeft: spacing.sm },
  results: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  resultRow: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  resultPressed: { backgroundColor: colors.primarySoft },
  resultName: { ...typography.body, color: colors.text },
  noResults: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
    color: colors.textMuted,
  },
  errorRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.destructive,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 48,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  selectedName: {
    ...typography.body,
    fontWeight: "600",
    flex: 1,
    color: colors.text,
  },
});
