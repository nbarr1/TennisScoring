import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { searchDivisionPlayers } from "@tennis/firebase-client";
import type { PublicProfile } from "@tennis/shared";

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

  const excludeKey = excludeIds.join(",");

  useEffect(() => {
    if (!searchText.trim() || selected) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchDivisionPlayers(divisionId, searchText);
        setResults(found.filter((u) => !excludeIds.includes(u.id)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // excludeKey stands in for excludeIds so a new array identity each render
    // does not restart the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, divisionId, selected, excludeKey]);

  if (selected) {
    return (
      <View style={pickerStyles.block}>
        <Text style={pickerStyles.label}>{label}</Text>
        <View style={pickerStyles.selectedRow}>
          <Text style={pickerStyles.selectedName}>{selected.displayName}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Change ${label}`}
            onPress={() => {
              onClear();
              setSearchText("");
              setResults([]);
            }}
          >
            <Text style={pickerStyles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={pickerStyles.block}>
      <Text style={pickerStyles.label}>{label}</Text>
      <View style={pickerStyles.searchRow}>
        <TextInput
          accessibilityLabel={`Search for ${label}`}
          style={pickerStyles.input}
          value={searchText}
          onChangeText={setSearchText}
          placeholder={placeholder ?? "Name or email..."}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator style={pickerStyles.spinner} color="#1a472a" />}
      </View>
      {results.map((item) => (
        <TouchableOpacity
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Select ${item.displayName} as ${label}`}
          style={pickerStyles.resultRow}
          onPress={() => {
            onSelect(item);
            setSearchText("");
            setResults([]);
          }}
        >
          <Text style={pickerStyles.resultName}>{item.displayName}</Text>
        </TouchableOpacity>
      ))}
      {searchText.trim().length > 0 && !searching && results.length === 0 && (
        <Text style={pickerStyles.noResults}>No players found.</Text>
      )}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  block: { marginBottom: 12 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  searchRow: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  spinner: { marginLeft: 8 },
  resultRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  resultName: { fontSize: 15, color: "#0f172a" },
  noResults: { marginTop: 6, fontSize: 13, color: "#94a3b8" },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  changeText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },
});
