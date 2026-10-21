"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { DivisionLevel } from "@tennis/shared";
import { IconCheck, IconRefresh, IconUpload, IconUserMinus, IconUserPlus } from "@tabler/icons-react";
import { AnimatedDiv, Button, EmptyState, InlineAlert, LoadingBlock } from "../shared/ui";
import type { AsyncAction } from "../shared/ui";
import { plural } from "./AdminParts";
import {
  OTHER_SEASONS_FILTER,
  initialsOf,
  playerStatusLabel,
  type AdminSeason,
  type AdminTab,
  type RosterAlert,
  type RosterRow,
} from "./adminModel";
import { styles } from "./adminStyles";
import css from "./admin.module.css";

/**
 * The Roster tab: search, level filter chips, and the players grid with its
 * per-row level select. Every value and handler comes from AdminPage, which
 * owns the roster state, so switching tabs keeps it.
 */
export type RosterPanelProps = {
  adminSeason: AdminSeason;
  adminSeasonLevels: DivisionLevel[];
  levelNameById: Map<string, string>;
  noLevelsYet: boolean;
  rosterReady: boolean;
  rosterRows: RosterRow[];
  otherSeasonRows: RosterRow[];
  otherSeasonIds: Set<string>;
  otherSeasonNames: (userId: string) => string;
  visibleRows: RosterRow[];
  visibleIds: string[];
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  isFiltered: boolean;
  unassignedCount: number;
  countByLevelId: Map<string, number>;
  effectiveLevelId: (row: RosterRow) => string;
  draftLevels: Record<string, string>;
  savingRowIds: string[];
  savedFlashIds: string[];
  removeTarget: { row: RosterRow; viaSelect: boolean } | null;
  setRemoveTarget: (target: { row: RosterRow; viaSelect: boolean } | null) => void;
  rosterSearch: string;
  setRosterSearch: (value: string) => void;
  rosterFilter: string;
  setRosterFilter: (value: string) => void;
  rosterAlert: RosterAlert;
  setRosterAlert: (alert: RosterAlert) => void;
  selectedPlayerIds: string[];
  setSelectedPlayerIds: Dispatch<SetStateAction<string[]>>;
  rosterHeadingRef: RefObject<HTMLHeadingElement | null>;
  addPlayer: AsyncAction<[], unknown>;
  importRoster: AsyncAction<[], unknown>;
  setAddPlayerOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  selectTab: (tab: AdminTab) => void;
  onRowLevelChange: (row: RosterRow, nextLevelId: string) => void;
  openPlayerDetail: (row: RosterRow) => void;
};

export function RosterPanel({
  adminSeason,
  adminSeasonLevels,
  levelNameById,
  noLevelsYet,
  rosterReady,
  rosterRows,
  otherSeasonRows,
  otherSeasonIds,
  otherSeasonNames,
  visibleRows,
  visibleIds,
  allVisibleSelected,
  someVisibleSelected,
  isFiltered,
  unassignedCount,
  countByLevelId,
  effectiveLevelId,
  draftLevels,
  savingRowIds,
  savedFlashIds,
  removeTarget,
  setRemoveTarget,
  rosterSearch,
  setRosterSearch,
  rosterFilter,
  setRosterFilter,
  rosterAlert,
  setRosterAlert,
  selectedPlayerIds,
  setSelectedPlayerIds,
  rosterHeadingRef,
  addPlayer,
  importRoster,
  setAddPlayerOpen,
  setImportOpen,
  selectTab,
  onRowLevelChange,
  openPlayerDetail,
}: RosterPanelProps): React.JSX.Element {
  return (
    <div
      role="tabpanel"
      id="admin-panel-roster"
      aria-labelledby="admin-tab-roster"
    >
      <section style={styles.card} aria-labelledby="roster-title">
        <div style={styles.cardHeader}>
          <h2 id="roster-title" ref={rosterHeadingRef} tabIndex={-1} style={styles.sectionTitle}>
            Roster · {adminSeason.name}
          </h2>
          <div style={styles.toolbarActions}>
            <Button
              variant="secondary"
              icon={<IconUpload size={18} aria-hidden="true" />}
              onClick={() => {
                importRoster.reset();
                setImportOpen(true);
              }}
              disabled={noLevelsYet}
            >
              Import roster
            </Button>
            <Button
              icon={<IconUserPlus size={18} aria-hidden="true" />}
              onClick={() => {
                addPlayer.reset();
                setAddPlayerOpen(true);
              }}
              disabled={noLevelsYet}
              aria-haspopup="dialog"
            >
              Add player
            </Button>
          </div>
        </div>

        {noLevelsYet ? (
          <InlineAlert
            tone="info"
            role={null}
            style={styles.blockGap}
            action={
              <Button size="sm" variant="secondary" onClick={() => selectTab("divisions")}>
                Go to Divisions
              </Button>
            }
          >
            {adminSeason.name} has no division levels yet. Create one on the Divisions tab
            before adding or importing players.
          </InlineAlert>
        ) : null}

        {!rosterReady ? (
          <LoadingBlock
            label={`Loading the ${adminSeason.name} roster…`}
            rows={5}
            rowHeight={28}
            style={styles.placeholder}
          />
        ) : (
          <>
            <div style={styles.toolbar}>
              <div style={styles.searchField}>
                <label htmlFor="roster-search" className="sr-only">
                  Search players by name or email
                </label>
                <input
                  id="roster-search"
                  style={styles.input}
                  type="search"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Search name or email"
                />
              </div>
              <div style={styles.chipRow} role="group" aria-label="Filter by division level">
                {[
                  { id: "all", label: "All", count: rosterRows.length },
                  { id: "unassigned", label: "Unassigned", count: unassignedCount },
                  ...adminSeasonLevels.map((level) => ({
                    id: level.id,
                    label: level.name,
                    count: countByLevelId.get(level.id) ?? 0,
                  })),
                  ...(otherSeasonRows.length > 0
                    ? [{ id: OTHER_SEASONS_FILTER, label: "Other seasons", count: otherSeasonRows.length }]
                    : []),
                ].map((chip) => {
                  const active = rosterFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      className={`${css.chip} ${active ? css.chipActive : ""}`}
                      aria-pressed={active}
                      onClick={() => setRosterFilter(chip.id)}
                    >
                      {active ? <IconCheck size={16} aria-hidden="true" /> : null}
                      {chip.label}
                      <span className={css.chipCount}>{chip.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {rosterAlert ? (
              <InlineAlert
                tone={rosterAlert.tone}
                style={styles.blockGap}
                onDismiss={() => setRosterAlert(null)}
                action={
                  rosterAlert.retry ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<IconRefresh size={16} aria-hidden="true" />}
                      onClick={rosterAlert.retry}
                    >
                      Try again
                    </Button>
                  ) : undefined
                }
              >
                {rosterAlert.message}
              </InlineAlert>
            ) : null}

            <div
              role="table"
              aria-label={`Players in ${adminSeason.name}`}
              aria-rowcount={visibleRows.length + 1}
              className={css.table}
            >
              <div role="rowgroup">
                <div role="row" className={`${css.row} ${css.head}`}>
                  <div role="columnheader" className={css.cellCheck}>
                    <label className={css.checkTarget}>
                      <input
                        type="checkbox"
                        ref={(node) => {
                          if (node) node.indeterminate = someVisibleSelected;
                        }}
                        checked={allVisibleSelected}
                        aria-label={isFiltered ? "Select all listed players" : "Select all players"}
                        disabled={visibleIds.length === 0}
                        onChange={(e) =>
                          setSelectedPlayerIds(e.target.checked ? [...visibleIds] : [])
                        }
                      />
                    </label>
                  </div>
                  <div role="columnheader" className={css.cellPlayer} style={styles.headCell}>Player</div>
                  <div role="columnheader" className={css.cellEmail} style={styles.headCell}>Email</div>
                  <div role="columnheader" className={css.cellStatus} style={styles.headCell}>Status</div>
                  <div role="columnheader" className={css.cellLevel} style={styles.headCell}>Division level</div>
                  <div role="columnheader" className={css.cellRemove} style={styles.headCell}>
                    <span className="sr-only">Remove</span>
                  </div>
                </div>
              </div>

              <AnimatedDiv role="rowgroup">
                {visibleRows.map((row) => {
                  const p = row.player;
                  const draftLevelId = draftLevels[p.id];
                  const levelId = draftLevelId ?? effectiveLevelId(row);
                  const selected = selectedPlayerIds.includes(p.id);
                  const registered = p.isRegistered !== false;
                  const waitlisted = row.membership?.status === "waitlisted";
                  // Rostered in another season only: not on this roster, so not "unassigned"
                  // here, and there is nothing to remove from this season.
                  const fromOtherSeason = otherSeasonIds.has(p.id) && !effectiveLevelId(row);
                  const saving =
                    savingRowIds.includes(p.id) ||
                    (draftLevelId !== undefined && removeTarget?.row.player.id !== p.id);
                  const savedFlash = savedFlashIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      role="row"
                      className={`${css.row} ${selected ? css.rowSelected : ""}`}
                    >
                      <div role="cell" className={css.cellCheck}>
                        <label className={css.checkTarget}>
                          <input
                            type="checkbox"
                            checked={selected}
                            aria-label={`Select ${p.displayName}`}
                            onChange={(e) =>
                              setSelectedPlayerIds((current) =>
                                e.target.checked
                                  ? [...current, p.id]
                                  : current.filter((id) => id !== p.id),
                              )
                            }
                          />
                        </label>
                      </div>
                      <div role="cell" className={css.cellPlayer}>
                        <button
                          type="button"
                          className={css.playerButton}
                          onClick={() => openPlayerDetail(row)}
                          aria-haspopup="dialog"
                          aria-label={`${p.displayName}: open details`}
                        >
                          <span style={styles.avatar} aria-hidden="true">
                            {initialsOf(p.displayName)}
                          </span>
                          <span className={css.playerName}>{p.displayName}</span>
                        </button>
                      </div>
                      <div role="cell" className={css.cellEmail} style={styles.cellText}>
                        {p.email && p.contactPreferences?.allowEmail !== false ? (
                          <a href={`mailto:${p.email}`} style={styles.contactLink}>
                            {p.email}
                          </a>
                        ) : (
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{p.email ? "Email not shared" : "No email"}</span>
                          </>
                        )}
                      </div>
                      <div role="cell" className={css.cellStatus} style={styles.statusCell}>
                        <span style={registered ? styles.registeredBadge : styles.unregisteredBadge}>
                          {playerStatusLabel(p)}
                        </span>
                        {waitlisted ? <span style={styles.waitlistBadge}>Waitlisted</span> : null}
                        {fromOtherSeason ? (
                          <span style={styles.otherSeasonNote}>In {otherSeasonNames(p.id)}</span>
                        ) : null}
                      </div>
                      <div role="cell" className={css.cellLevel}>
                        <select
                          style={{
                            ...styles.rowSelect,
                            ...(levelId || fromOtherSeason ? {} : styles.rowSelectUnassigned),
                          }}
                          value={levelId}
                          aria-label={
                            fromOtherSeason
                              ? `Add ${p.displayName} to a ${adminSeason.name} division level`
                              : `Division level for ${p.displayName}`
                          }
                          aria-busy={saving || undefined}
                          onChange={(e) => onRowLevelChange(row, e.target.value)}
                        >
                          <option value="">
                            {fromOtherSeason ? `Not in ${adminSeason.name}` : "Unassigned"}
                          </option>
                          {adminSeasonLevels.map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.name}
                            </option>
                          ))}
                          {levelId && !adminSeasonLevels.some((l) => l.id === levelId) ? (
                            <option value={levelId}>
                              {levelNameById.get(levelId) ?? "Other level"}
                            </option>
                          ) : null}
                        </select>
                        <span style={styles.savedFlag} aria-hidden="true">
                          {saving ? (
                            <span className="tl-spinner" />
                          ) : savedFlash ? (
                            <>
                              <IconCheck size={14} />
                              Saved
                            </>
                          ) : null}
                        </span>
                      </div>
                      <div role="cell" className={css.cellRemove}>
                        {fromOtherSeason ? null : (
                          <Button
                            variant="quiet-danger"
                            size="sm"
                            style={styles.iconButton}
                            aria-label={`Remove ${p.displayName} from ${adminSeason.name}`}
                            title={`Remove from ${adminSeason.name}`}
                            aria-haspopup="dialog"
                            onClick={() => setRemoveTarget({ row, viaSelect: false })}
                            icon={<IconUserMinus size={20} aria-hidden="true" />}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </AnimatedDiv>
            </div>

            {visibleRows.length === 0 ? (
              <EmptyState
                compact
                title={
                  rosterRows.length === 0
                    ? `No players in ${adminSeason.name} yet`
                    : rosterFilter === "unassigned" && !rosterSearch.trim()
                      ? "Everyone has a division level"
                      : "No players match"
                }
                description={
                  rosterRows.length === 0
                    ? noLevelsYet
                      ? "Create a division level first, then add or import players."
                      : "Add players one at a time, or paste a list with Import roster."
                    : isFiltered
                      ? "Try another search or filter."
                      : undefined
                }
                action={
                  isFiltered ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRosterFilter("all");
                        setRosterSearch("");
                      }}
                    >
                      Show all players
                    </Button>
                  ) : undefined
                }
              />
            ) : null}

            <p style={styles.tableFooter} aria-live="polite">
              {rosterFilter === OTHER_SEASONS_FILTER
                ? `${plural(visibleRows.length, "player", "players")} from other seasons. Choose a level to add them to ${adminSeason.name}.`
                : isFiltered
                ? `Showing ${visibleRows.length} of ${rosterRows.length} players`
                : `${plural(rosterRows.length, "player", "players")} in ${adminSeason.name}`}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
