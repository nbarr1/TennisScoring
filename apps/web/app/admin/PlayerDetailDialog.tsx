"use client";

import type { Dispatch, SetStateAction } from "react";
import type { DivisionLevel, Match } from "@tennis/shared";
import { IconRefresh } from "@tabler/icons-react";
import { Button, Dialog, InlineAlert, LoadingBlock } from "../shared/ui";
import type { AsyncAction } from "../shared/ui";
import { CheckboxRow, DialogCancelButton, Field, plural } from "./AdminParts";
import { formatShortDate, playerStatusLabel, type AdminSeason, type RosterRow } from "./adminModel";
import { styles } from "./adminStyles";

type LinkActionMessage = { targetUserId: string; message: string; kind: "link" | "contact" } | null;

/**
 * The player detail dialog opened from a roster row: season details, contact
 * update, historic-match linking, and the undo for each.
 */
export type PlayerDetailDialogProps = {
  detailRow: RosterRow | null;
  closePlayerDetail: () => void;
  adminSeason: AdminSeason;
  adminSeasonLevels: DivisionLevel[];
  noLevelsYet: boolean;
  effectiveLevelId: (row: RosterRow) => string;
  levelLabel: (levelId: string) => string;
  otherSeasonIds: Set<string>;
  otherSeasonNames: (userId: string) => string;
  detailDirty: boolean;
  detailBusy: boolean;
  detailRegistered: boolean;
  editName: string;
  setEditName: (value: string) => void;
  editDivisionLevelId: string;
  setEditDivisionLevelId: (value: string) => void;
  editRole: "player" | "division_leader";
  setEditRole: (value: "player" | "division_leader") => void;
  editStatus: "active" | "waitlisted";
  setEditStatus: (value: "active" | "waitlisted") => void;
  editEmail: string;
  setEditEmail: (value: string) => void;
  editPhone: string;
  setEditPhone: (value: string) => void;
  savePlayer: AsyncAction<[], unknown>;
  updateContact: AsyncAction<[], unknown>;
  undoContact: AsyncAction<[], unknown>;
  linkMatches: AsyncAction<[], unknown>;
  undoLink: AsyncAction<[], unknown>;
  linkActionMessage: LinkActionMessage;
  setLinkActionMessage: (message: LinkActionMessage) => void;
  lastContactAction: { targetUserId: string; previousEmail: string; previousPhone?: string } | null;
  lastLinkAction: { sourceUserId?: string; targetUserId: string; matchIds: string[] } | null;
  candidateMatchState: "loading" | "ready" | "error";
  candidateMatches: Match[];
  setCandidateMatchRefreshKey: Dispatch<SetStateAction<number>>;
  selectedMatchIds: string[];
  setSelectedMatchIds: Dispatch<SetStateAction<string[]>>;
};

export function PlayerDetailDialog({
  detailRow,
  closePlayerDetail,
  adminSeason,
  adminSeasonLevels,
  noLevelsYet,
  effectiveLevelId,
  levelLabel,
  otherSeasonIds,
  otherSeasonNames,
  detailDirty,
  detailBusy,
  detailRegistered,
  editName,
  setEditName,
  editDivisionLevelId,
  setEditDivisionLevelId,
  editRole,
  setEditRole,
  editStatus,
  setEditStatus,
  editEmail,
  setEditEmail,
  editPhone,
  setEditPhone,
  savePlayer,
  updateContact,
  undoContact,
  linkMatches,
  undoLink,
  linkActionMessage,
  setLinkActionMessage,
  lastContactAction,
  lastLinkAction,
  candidateMatchState,
  candidateMatches,
  setCandidateMatchRefreshKey,
  selectedMatchIds,
  setSelectedMatchIds,
}: PlayerDetailDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={detailRow !== null}
      onClose={closePlayerDetail}
      title={detailRow?.player.displayName ?? "Player"}
      description={
        detailRow
          ? `${playerStatusLabel(detailRow.player)}${detailRow.membership?.status === "waitlisted" ? " · Waitlisted" : ""} · ${
              effectiveLevelId(detailRow)
                ? `${levelLabel(effectiveLevelId(detailRow))} in ${adminSeason.name}`
                : otherSeasonIds.has(detailRow.player.id)
                  ? `Not in ${adminSeason.name} (in ${otherSeasonNames(detailRow.player.id)}). Save to add them.`
                  : `Unassigned in ${adminSeason.name}`
            }`
          : undefined
      }
      size="lg"
      dirty={detailDirty}
      dismissible={!detailBusy}
      footer={<DialogCancelButton label="Close" disabled={detailBusy} />}
    >
      {detailRow ? (
        <div style={styles.detailBody}>
          <section aria-labelledby="detail-season-title">
            <h3 id="detail-season-title" style={styles.subTitle}>Season details</h3>
            {noLevelsYet ? (
              <InlineAlert tone="info" role={null} style={styles.blockGap}>
                Create a division level for {adminSeason.name} before saving this player.
              </InlineAlert>
            ) : null}
            <form
              style={styles.fieldGrid}
              onSubmit={(event) => {
                event.preventDefault();
                void savePlayer.run();
              }}
              id="detail-form"
            >
              <Field id="detail-name" label="Name">
                <input
                  id="detail-name"
                  style={styles.input}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field id="detail-level" label="Division level">
                <select
                  id="detail-level"
                  style={styles.input}
                  value={editDivisionLevelId}
                  onChange={(e) => setEditDivisionLevelId(e.target.value)}
                >
                  {adminSeasonLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="detail-role"
                label="Role"
                hint="A division leader manages this roster and can see every player's contact details."
              >
                <select
                  id="detail-role"
                  aria-describedby="detail-role-hint"
                  style={styles.input}
                  value={editRole}
                  onChange={(e) =>
                    setEditRole(e.target.value as "player" | "division_leader")
                  }
                >
                  <option value="player">Player</option>
                  <option value="division_leader">Division leader</option>
                </select>
              </Field>
              <Field id="detail-status" label="Status">
                <select
                  id="detail-status"
                  style={styles.input}
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as "active" | "waitlisted")
                  }
                >
                  <option value="active">Active</option>
                  <option value="waitlisted">Waitlisted</option>
                </select>
              </Field>
              <Field id="detail-email" label="Email">
                <input
                  id="detail-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  autoComplete="off"
                  readOnly={detailRegistered}
                  aria-describedby="detail-contact-hint"
                  style={{ ...styles.input, ...(detailRegistered ? styles.inputReadOnly : {}) }}
                />
              </Field>
              <Field id="detail-phone" label="Phone (optional)">
                <input
                  id="detail-phone"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  autoComplete="off"
                  readOnly={detailRegistered}
                  aria-describedby="detail-contact-hint"
                  style={{ ...styles.input, ...(detailRegistered ? styles.inputReadOnly : {}) }}
                />
              </Field>
            </form>
            <p id="detail-contact-hint" style={styles.hint}>
              {detailRegistered
                ? `${detailRow.player.displayName} has an account and manages their own email and phone from their profile.`
                : "This player is a placeholder. Save contact only updates the email and phone without changing their season details."}
            </p>
            <div style={styles.actionsRow}>
              <Button
                type="submit"
                form="detail-form"
                pending={savePlayer.pending}
                pendingLabel="Saving…"
                disabled={(detailBusy && !savePlayer.pending) || !editName.trim() || !editDivisionLevelId}
              >
                Save player
              </Button>
              {detailRegistered ? null : (
                <Button
                  variant="secondary"
                  pending={updateContact.pending}
                  pendingLabel="Saving…"
                  disabled={(detailBusy && !updateContact.pending) || !editEmail.trim()}
                  onClick={() => void updateContact.run()}
                >
                  Save contact only
                </Button>
              )}
            </div>
            {savePlayer.error ? (
              <InlineAlert tone="error" style={styles.blockGapTop}>
                {savePlayer.error}
              </InlineAlert>
            ) : null}
            {updateContact.error ? (
              <InlineAlert tone="error" style={styles.blockGapTop}>
                {updateContact.error}
              </InlineAlert>
            ) : null}
            {undoContact.error ? (
              <InlineAlert tone="error" style={styles.blockGapTop}>
                {undoContact.error}
              </InlineAlert>
            ) : null}
            {linkActionMessage?.targetUserId === detailRow.player.id && linkActionMessage.kind === "contact" ? (
              <InlineAlert
                tone="success"
                role={null}
                style={styles.blockGapTop}
                onDismiss={() => setLinkActionMessage(null)}
                action={
                  lastContactAction?.previousEmail ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      pending={undoContact.pending}
                      pendingLabel="Undoing…"
                      disabled={detailBusy && !undoContact.pending}
                      onClick={() => void undoContact.run()}
                    >
                      Undo contact change
                    </Button>
                  ) : undefined
                }
              >
                {linkActionMessage.message}
              </InlineAlert>
            ) : null}
          </section>

          <section aria-labelledby="detail-link-title" style={styles.detailSection}>
            <h3 id="detail-link-title" style={styles.subTitle}>Link recorded matches</h3>
            <fieldset style={styles.fieldset}>
              <legend style={styles.legendQuiet}>
                Which of these recorded matches did {detailRow.player.displayName} play in?
              </legend>
              {candidateMatchState === "loading" ? (
                <LoadingBlock label="Loading recorded matches…" rows={2} rowHeight={24} />
              ) : candidateMatchState === "error" ? (
                <InlineAlert
                  tone="error"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<IconRefresh size={16} aria-hidden="true" />}
                      onClick={() => setCandidateMatchRefreshKey((key) => key + 1)}
                    >
                      Try again
                    </Button>
                  }
                >
                  Couldn&rsquo;t load the recorded matches for this division.
                </InlineAlert>
              ) : candidateMatches.length > 0 ? (
                <ul style={styles.matchChecklist}>
                  {candidateMatches.map((m) => {
                    const date = formatShortDate(m.completedAt ?? m.createdAt);
                    return (
                      <li key={m.id}>
                        <CheckboxRow
                          checked={selectedMatchIds.includes(m.id)}
                          disabled={detailBusy}
                          onChange={(checked) =>
                            setSelectedMatchIds((prev) =>
                              checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                            )
                          }
                          description={date ?? undefined}
                        >
                          {m.player1Name || "Player 1"} vs {m.player2Name || "Player 2"}
                        </CheckboxRow>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p style={styles.hint}>
                  No recorded matches to link. Matches already linked to two player profiles are
                  hidden.
                </p>
              )}
            </fieldset>
            <div style={styles.actionsRow}>
              <Button
                variant="secondary"
                pending={linkMatches.pending}
                pendingLabel="Linking…"
                disabled={(detailBusy && !linkMatches.pending) || selectedMatchIds.length === 0}
                onClick={() => void linkMatches.run()}
              >
                {selectedMatchIds.length > 0
                  ? `Link ${plural(selectedMatchIds.length, "match", "matches")}`
                  : "Link selected matches"}
              </Button>
              <Button
                variant="quiet"
                pending={undoLink.pending}
                pendingLabel="Undoing…"
                disabled={(detailBusy && !undoLink.pending) || !lastLinkAction?.sourceUserId}
                onClick={() => void undoLink.run()}
              >
                Undo last link
              </Button>
            </div>
            {linkMatches.error ? (
              <InlineAlert
                tone="error"
                style={styles.blockGapTop}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void linkMatches.run()}>
                    Try again
                  </Button>
                }
              >
                {linkMatches.error}
              </InlineAlert>
            ) : null}
            {undoLink.error ? (
              <InlineAlert tone="error" style={styles.blockGapTop}>
                {undoLink.error}
              </InlineAlert>
            ) : null}
            {linkActionMessage?.targetUserId === detailRow.player.id && linkActionMessage.kind === "link" ? (
              <InlineAlert
                tone="success"
                role={null}
                style={styles.blockGapTop}
                onDismiss={() => setLinkActionMessage(null)}
              >
                {linkActionMessage.message}
              </InlineAlert>
            ) : null}
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}
