"use client";

import { useEffect, useState } from "react";
import { searchDivisionPlayers } from "@tennis/firebase-client";
import type { CSSProperties } from "react";
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
  inputId,
  divisionId,
  excludeIds,
  selected,
  onSelect,
  onClear,
  placeholder,
}: {
  label: string;
  inputId: string;
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
    // Keyed on excludeKey rather than excludeIds so a new array identity each
    // render does not restart the search.
  }, [searchText, divisionId, selected, excludeKey, excludeIds]);

  if (selected) {
    return (
      <div style={pickerStyles.block}>
        <span style={pickerStyles.label}>{label}</span>
        <div style={pickerStyles.selectedRow}>
          <span style={pickerStyles.selectedName}>{selected.displayName}</span>
          <button
            type="button"
            style={pickerStyles.changeBtn}
            aria-label={`Change ${label}`}
            onClick={() => {
              onClear();
              setSearchText("");
              setResults([]);
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pickerStyles.block}>
      <label htmlFor={inputId} style={pickerStyles.label}>
        {label}
      </label>
      <input
        id={inputId}
        style={pickerStyles.input}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder={placeholder ?? "Search by name…"}
      />
      {searching && <div style={pickerStyles.muted}>Searching…</div>}
      {results.length > 0 && (
        <div style={pickerStyles.results}>
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              aria-label={`Select ${u.displayName} as ${label}`}
              style={pickerStyles.resultRow}
              onClick={() => {
                onSelect(u);
                setSearchText("");
                setResults([]);
              }}
            >
              {u.displayName}
            </button>
          ))}
        </div>
      )}
      {searchText.trim().length > 0 && !searching && results.length === 0 && (
        <div style={pickerStyles.muted}>No players found.</div>
      )}
    </div>
  );
}

const pickerStyles: Record<string, CSSProperties> = {
  block: { marginBottom: 12 },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    boxSizing: "border-box",
  },
  muted: { fontSize: 12, color: "#94a3b8", marginTop: 6 },
  results: {
    marginTop: 6,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
  },
  resultRow: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    background: "#fff",
    border: "none",
    borderBottom: "1px solid #f1f5f9",
    fontSize: 14,
    cursor: "pointer",
  },
  selectedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderRadius: 8,
    background: "#f1f5f9",
    gap: 8,
  },
  selectedName: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  changeBtn: {
    background: "none",
    border: "none",
    color: "#2563eb",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
