"use client";

import type { Division, DivisionLevel, User, parseRosterPaste } from "@tennis/shared";
import { IconUpload } from "@tabler/icons-react";
import { Button, Dialog, InlineAlert } from "../shared/ui";
import type { AsyncAction } from "../shared/ui";
import { DialogCancelButton, Field, plural } from "./AdminParts";
import { IMPORT_PREVIEW_LIMIT, type AdminSeason } from "./adminModel";
import { styles } from "./adminStyles";

type RosterEntry = ReturnType<typeof parseRosterPaste>[number];
type ExistingPlayer = { player: User; levelId: string } | null;

/** The Roster tab's "Add player" dialog. */
export function AddPlayerDialog({
  division,
  adminSeason,
  adminSeasonLevels,
  levelLabel,
  addPlayer,
  addPlayerOpen,
  setAddPlayerOpen,
  addPlayerName,
  setAddPlayerName,
  addPlayerEmail,
  setAddPlayerEmail,
  addPlayerLevelId,
  setAddPlayerLevelId,
  addPlayerExisting,
}: {
  division: Division | null;
  adminSeason: AdminSeason;
  adminSeasonLevels: DivisionLevel[];
  levelLabel: (levelId: string) => string;
  addPlayer: AsyncAction<[], unknown>;
  addPlayerOpen: boolean;
  setAddPlayerOpen: (open: boolean) => void;
  addPlayerName: string;
  setAddPlayerName: (name: string) => void;
  addPlayerEmail: string;
  setAddPlayerEmail: (email: string) => void;
  addPlayerLevelId: string;
  setAddPlayerLevelId: (levelId: string) => void;
  addPlayerExisting: ExistingPlayer;
}): React.JSX.Element {
  return (
    <Dialog
      open={addPlayerOpen}
      onClose={() => {
        setAddPlayerOpen(false);
        setAddPlayerName("");
        setAddPlayerEmail("");
        addPlayer.reset();
      }}
      title="Add player"
      description={`Adds one player to the ${adminSeason.name} roster.`}
      dirty={addPlayerName.trim().length > 0 || addPlayerEmail.trim().length > 0}
      dismissible={!addPlayer.pending}
      footer={
        <>
          <DialogCancelButton disabled={addPlayer.pending} />
          <Button
            type="submit"
            form="add-player-form"
            pending={addPlayer.pending}
            pendingLabel="Adding…"
            disabled={!addPlayerName.trim() || !addPlayerLevelId}
          >
            Add player
          </Button>
        </>
      }
    >
      <form
        id="add-player-form"
        style={styles.dialogForm}
        onSubmit={(event) => {
          event.preventDefault();
          void addPlayer.run();
        }}
      >
        <Field id="add-player-name" label="Name">
          <input
            id="add-player-name"
            style={styles.input}
            value={addPlayerName}
            onChange={(e) => setAddPlayerName(e.target.value)}
            maxLength={80}
            placeholder="Full name"
            autoComplete="off"
            required
          />
        </Field>
        <Field
          id="add-player-email"
          label="Email (optional)"
          hint="Used to match this player to their account when they join."
        >
          <input
            id="add-player-email"
            style={styles.input}
            type="email"
            value={addPlayerEmail}
            onChange={(e) => setAddPlayerEmail(e.target.value)}
            maxLength={254}
            autoComplete="off"
            aria-describedby="add-player-email-hint"
          />
        </Field>
        <Field id="add-player-level" label="Division level">
          <select
            id="add-player-level"
            style={styles.input}
            value={addPlayerLevelId}
            onChange={(e) => setAddPlayerLevelId(e.target.value)}
          >
            {adminSeasonLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </Field>
        {addPlayerExisting && division ? (
          <InlineAlert tone={addPlayerExisting.levelId ? "warning" : "info"} role={null}>
            {addPlayerExisting.levelId === addPlayerLevelId
              ? `${addPlayerExisting.player.displayName} is already in ${levelLabel(addPlayerLevelId)} for ${adminSeason.name}. Adding them again changes nothing.`
              : addPlayerExisting.levelId
                ? `${addPlayerExisting.player.displayName} is already in ${levelLabel(addPlayerExisting.levelId)} for ${adminSeason.name}. Adding moves them to ${levelLabel(addPlayerLevelId)} instead of creating a new player.`
                : `${addPlayerExisting.player.displayName} is already in ${division.name}. Adding puts them on the ${adminSeason.name} roster instead of creating a new player.`}
          </InlineAlert>
        ) : null}
        {addPlayer.error ? <InlineAlert tone="error">{addPlayer.error}</InlineAlert> : null}
      </form>
    </Dialog>
  );
}

/** The Roster tab's "Import roster" dialog: paste a list, preview it, import it into one level. */
export function ImportRosterDialog({
  adminSeason,
  adminSeasonLevels,
  levelLabel,
  importRoster,
  importOpen,
  setImportOpen,
  importText,
  setImportText,
  importEntries,
  importPreview,
  importMoves,
  importLevelId,
  setImportLevelId,
}: {
  adminSeason: AdminSeason;
  adminSeasonLevels: DivisionLevel[];
  levelLabel: (levelId: string) => string;
  importRoster: AsyncAction<[], unknown>;
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
  importText: string;
  setImportText: (text: string) => void;
  importEntries: RosterEntry[];
  importPreview: Array<{ entry: RosterEntry; existing: ExistingPlayer }>;
  importMoves: number;
  importLevelId: string;
  setImportLevelId: (levelId: string) => void;
}): React.JSX.Element {
  return (
    <Dialog
      open={importOpen}
      onClose={() => {
        setImportOpen(false);
        setImportText("");
        importRoster.reset();
      }}
      title="Import roster"
      description={`Adds every pasted player to one division level in ${adminSeason.name}.`}
      dirty={importText.trim().length > 0}
      dismissible={!importRoster.pending}
      footer={
        <>
          <DialogCancelButton disabled={importRoster.pending} />
          <Button
            type="submit"
            form="import-roster-form"
            icon={<IconUpload size={18} aria-hidden="true" />}
            pending={importRoster.pending}
            pendingLabel="Importing…"
            disabled={importEntries.length === 0 || !importLevelId}
          >
            {importEntries.length > 0
              ? `Import ${plural(importEntries.length, "player", "players")}`
              : "Import players"}
          </Button>
        </>
      }
    >
      <form
        id="import-roster-form"
        style={styles.dialogForm}
        onSubmit={(event) => {
          event.preventDefault();
          void importRoster.run();
        }}
      >
        <Field
          id="import-textarea"
          label="Players, one per line"
          hint={
            <>
              Paste <code>Name, email</code> or just an email address on each line. Duplicate lines are
              added once.
            </>
          }
        >
          <textarea
            id="import-textarea"
            style={styles.textarea}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Ann Smith, ann@example.com\nbob@example.com"}
            rows={9}
            aria-describedby="import-textarea-hint import-count"
          />
        </Field>
        <p id="import-count" style={styles.importCount} aria-live="polite">
          {plural(importEntries.length, "player", "players")} detected
          {importMoves > 0
            ? `, ${plural(importMoves, "already has", "already have")} another division level`
            : ""}
        </p>
        {importPreview.length > 0 ? (
          <ul style={styles.importPreview} aria-label="Players to import">
            {importPreview.slice(0, IMPORT_PREVIEW_LIMIT).map(({ entry, existing }) => (
              <li key={`${entry.email}|${entry.name}`} style={styles.importPreviewItem}>
                <span style={styles.importPreviewName}>{entry.name || entry.email}</span>
                {entry.name && entry.email ? (
                  <span style={styles.importPreviewMeta}>{entry.email}</span>
                ) : !entry.email ? (
                  <span style={styles.importPreviewMeta}>No email</span>
                ) : null}
                {existing?.levelId && existing.levelId !== importLevelId ? (
                  <span style={styles.importPreviewMove}>Moves from {levelLabel(existing.levelId)}</span>
                ) : existing ? (
                  <span style={styles.importPreviewMeta}>Already in the division</span>
                ) : null}
              </li>
            ))}
            {importPreview.length > IMPORT_PREVIEW_LIMIT ? (
              <li style={styles.importPreviewMeta}>
                and {importPreview.length - IMPORT_PREVIEW_LIMIT} more
              </li>
            ) : null}
          </ul>
        ) : null}
        <Field id="import-level" label="Division level">
          <select
            id="import-level"
            style={styles.input}
            value={importLevelId}
            onChange={(e) => setImportLevelId(e.target.value)}
          >
            {adminSeasonLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </Field>
        {importMoves > 0 ? (
          <InlineAlert tone="warning" role={null}>
            {plural(importMoves, "player is", "players are")} already in another {adminSeason.name}{" "}
            division level. Importing moves them to {levelLabel(importLevelId)}; it doesn&rsquo;t
            create a second copy.
          </InlineAlert>
        ) : null}
        {importRoster.error ? <InlineAlert tone="error">{importRoster.error}</InlineAlert> : null}
      </form>
    </Dialog>
  );
}
