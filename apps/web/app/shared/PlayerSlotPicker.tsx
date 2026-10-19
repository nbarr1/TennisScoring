"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchDivisionPlayers } from "@tennis/firebase-client";
import type { CSSProperties } from "react";
import type { PublicProfile } from "@tennis/shared";
import { color, fieldLabelStyle, inputStyle, radius, space, type } from "./tokens";

/**
 * One player slot: a debounced division search that resolves to a single
 * selection, with a Change action to clear it.
 *
 * Doubles needs three of these alongside the signed-in player (a partner and
 * two opponents), so the search-and-select behaviour lives here rather than
 * being hand-rolled per modal.
 *
 * Focus follows the slot: choosing a player moves focus to its Change button,
 * and Change moves it back to the search field, so keyboard users are never
 * dropped onto the page body when the control they used disappears.
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
  const [searchFailed, setSearchFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  // The text the current results answer, so "no match" is not shown while
  // the debounce for newer text is still waiting.
  const [searchedText, setSearchedText] = useState("");
  const focusNext = useRef<"input" | "change" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const statusId = `${baseId}-status`;

  const excludeKey = excludeIds.join(",");

  useEffect(() => {
    if (!searchText.trim() || selected) {
      setResults([]);
      setSearchFailed(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchFailed(false);
      try {
        const found = await searchDivisionPlayers(divisionId, searchText);
        if (active) {
          setResults(found.filter((u) => !excludeIds.includes(u.id)));
          setSearchedText(searchText.trim());
        }
      } catch {
        if (active) {
          setResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // Keyed on excludeKey rather than excludeIds so a new array identity each
    // render does not restart the search.
  }, [searchText, divisionId, selected, excludeKey, retryToken]);

  // Move focus after the slot switches between its search and selected forms.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    if (target === "change") changeRef.current?.focus();
    else inputRef.current?.focus();
  }, [selected]);

  if (selected) {
    return (
      <div style={pickerStyles.block} role="group" aria-labelledby={labelId}>
        <span id={labelId} style={pickerStyles.label}>
          {label}
        </span>
        <div style={pickerStyles.selectedRow}>
          <span style={pickerStyles.selectedName}>{selected.displayName}</span>
          <button
            ref={changeRef}
            type="button"
            style={pickerStyles.changeBtn}
            aria-label={`Change ${label} (${selected.displayName})`}
            onClick={() => {
              focusNext.current = "input";
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

  const trimmed = searchText.trim();
  let statusText = "";
  if (searching) statusText = "Searching…";
  else if (searchFailed) statusText = "";
  else if (trimmed && trimmed === searchedText && results.length === 0) statusText = "No players in this division match that name.";
  else if (results.length > 0) statusText = `${results.length} ${results.length === 1 ? "player" : "players"} found.`;

  return (
    <div style={pickerStyles.block}>
      <label htmlFor={inputId} id={labelId} style={pickerStyles.label}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        autoComplete="off"
        style={pickerStyles.input}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder={placeholder ?? "Search by name…"}
        aria-describedby={statusId}
      />
      <div id={statusId} role="status" style={pickerStyles.muted}>
        {statusText}
      </div>
      {searchFailed && (
        <div role="alert" style={pickerStyles.error}>
          <span>Couldn&apos;t search players. Check your connection.</span>
          <button type="button" style={pickerStyles.retryBtn} onClick={() => setRetryToken((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {results.length > 0 && (
        <ul style={pickerStyles.results} aria-label={`Players matching “${trimmed}”`}>
          {results.map((u) => (
            <li key={u.id} style={pickerStyles.resultItem}>
              <button
                type="button"
                aria-label={`Select ${u.displayName} as ${label}`}
                style={pickerStyles.resultRow}
                onClick={() => {
                  focusNext.current = "change";
                  onSelect(u);
                  setSearchText("");
                  setResults([]);
                }}
              >
                {u.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pickerStyles: Record<string, CSSProperties> = {
  block: { marginBottom: space.md },
  label: fieldLabelStyle,
  input: inputStyle,
  muted: { ...type.caption, color: color.textMuted, marginTop: space.xs, minHeight: 16 },
  error: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    ...type.caption,
    color: color.destructivePressed,
  },
  retryBtn: {
    minHeight: 44,
    padding: "0 8px",
    background: "transparent",
    border: "none",
    borderRadius: radius.md,
    color: color.clubhouseGreen,
    ...type.label,
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  results: {
    listStyle: "none",
    marginTop: space.xs,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    overflow: "hidden",
    maxHeight: 264,
    overflowY: "auto",
    background: color.surface,
  },
  resultItem: { borderBottom: `1px solid ${color.border}` },
  resultRow: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    minHeight: 44,
    textAlign: "left",
    padding: "10px 12px",
    background: color.surface,
    color: color.ink,
    border: "none",
    fontSize: 16,
    overflowWrap: "anywhere",
  },
  selectedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    padding: "2px 4px 2px 12px",
    borderRadius: radius.md,
    background: color.greenSoft,
    gap: space.sm,
  },
  selectedName: { fontSize: 16, fontWeight: 600, color: color.ink, minWidth: 0, overflowWrap: "anywhere" },
  changeBtn: {
    minHeight: 44,
    minWidth: 44,
    padding: "0 12px",
    background: "transparent",
    border: "none",
    borderRadius: radius.md,
    color: color.clubhouseGreen,
    ...type.label,
    flexShrink: 0,
  },
};
