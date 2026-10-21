"use client";

import type { FirestoreError } from "firebase/firestore";
import {
  formatDivisionLevelName,
  type Division,
  type DivisionLevel,
  type DivisionMatchType,
  type DivisionSkillLevel,
} from "@tennis/shared";
import { IconCheck, IconCopy, IconPlus } from "@tabler/icons-react";
import {
  Button,
  Dialog,
  EmptyState,
  FieldError,
  InlineAlert,
  LoadingBlock,
  describeError,
} from "../shared/ui";
import type { AsyncAction } from "../shared/ui";
import { DialogCancelButton, Field, PermissionHints, plural } from "./AdminParts";
import type { AdminSeason } from "./adminModel";
import { styles } from "./adminStyles";

type AuthDebug = { uid: string; email: string; roleClaim?: unknown } | null;

/** The Divisions tab: the invite code and the season's division levels as cards. */
export function DivisionsPanel({
  division,
  adminSeason,
  adminSeasonLevels,
  countByLevelId,
  loadingDivisionLevels,
  divisionLevelsError,
  divisionLevelsPermissionHint,
  authDebug,
  levelMessage,
  setLevelMessage,
  codeCopied,
  copyInviteCode,
  openLevelForm,
  showLevelOnRoster,
}: {
  division: Division;
  adminSeason: AdminSeason;
  adminSeasonLevels: DivisionLevel[];
  countByLevelId: Map<string, number>;
  loadingDivisionLevels: boolean;
  divisionLevelsError: FirestoreError | null;
  divisionLevelsPermissionHint: string[] | null;
  authDebug: AuthDebug;
  levelMessage: string;
  setLevelMessage: (message: string) => void;
  codeCopied: boolean;
  copyInviteCode: AsyncAction<[], unknown>;
  openLevelForm: () => void;
  showLevelOnRoster: (levelId: string) => void;
}): React.JSX.Element {
  return (
    <div
      role="tabpanel"
      id="admin-panel-divisions"
      aria-labelledby="admin-tab-divisions"
    >
      {division.inviteCode ? (
        <section style={styles.card} aria-labelledby="invite-code-title">
          <h2 id="invite-code-title" style={styles.sectionTitle}>Invite code</h2>
          <p id="invite-code-hint" style={styles.hint}>
            Players enter this code after they sign up to join {division.name}.
          </p>
          <div style={styles.actionsRow}>
            <code style={styles.inviteCode} aria-describedby="invite-code-hint">
              {division.inviteCode}
            </code>
            <Button
              variant="secondary"
              icon={
                codeCopied ? (
                  <IconCheck size={18} aria-hidden="true" />
                ) : (
                  <IconCopy size={18} aria-hidden="true" />
                )
              }
              pending={copyInviteCode.pending}
              onClick={() => void copyInviteCode.run()}
              aria-label={codeCopied ? "Invite code copied" : "Copy invite code"}
            >
              {codeCopied ? "Copied" : "Copy code"}
            </Button>
          </div>
          {copyInviteCode.error ? (
            <InlineAlert tone="error" style={styles.blockGapTop}>
              {copyInviteCode.error}
            </InlineAlert>
          ) : null}
        </section>
      ) : null}

      <section style={styles.card} aria-labelledby="levels-title">
        <div style={styles.cardHeader}>
          <div>
            <h2 id="levels-title" style={styles.sectionTitle}>
              Division levels · {adminSeason.name}
            </h2>
            <p style={{ ...styles.hint, marginBottom: 0 }}>
              Each level groups players for standings and scheduling within this season.
            </p>
          </div>
          <Button
            icon={<IconPlus size={18} aria-hidden="true" />}
            onClick={openLevelForm}
            aria-haspopup="dialog"
          >
            New division level
          </Button>
        </div>
        {divisionLevelsError ? (
          <InlineAlert
            tone="error"
            title={`Couldn't load division levels for ${division.name}.`}
            style={styles.blockGap}
          >
            <p style={{ margin: 0 }}>{describeError(divisionLevelsError)}</p>
            <PermissionHints hints={divisionLevelsPermissionHint} authDebug={authDebug} />
          </InlineAlert>
        ) : null}
        {levelMessage ? (
          <InlineAlert
            tone="success"
            role={null}
            style={styles.blockGap}
            onDismiss={() => setLevelMessage("")}
          >
            {levelMessage}
          </InlineAlert>
        ) : null}
        {loadingDivisionLevels ? (
          <LoadingBlock label="Loading division levels…" rows={3} rowHeight={24} />
        ) : adminSeasonLevels.length === 0 && !divisionLevelsError ? (
          <EmptyState
            compact
            title={`No division levels for ${adminSeason.name} yet`}
            description="Create one, such as Beginner Singles, before adding players to this season."
          />
        ) : (
          <ul style={styles.levelGrid}>
            {adminSeasonLevels.map((level) => {
              const count = countByLevelId.get(level.id) ?? 0;
              return (
                <li key={level.id} style={styles.levelCard}>
                  <h3 style={styles.levelCardName}>{level.name}</h3>
                  <span style={styles.levelCardMeta}>
                    {level.matchType === "doubles" ? "Doubles" : "Singles"}
                  </span>
                  <span style={styles.levelCardCount}>{plural(count, "player", "players")}</span>
                  {level.description ? (
                    <span style={styles.levelCardMeta}>{level.description}</span>
                  ) : null}
                  {count > 0 ? (
                    <Button
                      size="sm"
                      variant="quiet"
                      style={styles.levelCardAction}
                      aria-label={`Show the ${plural(count, "player", "players")} in ${level.name}`}
                      onClick={() => showLevelOnRoster(level.id)}
                    >
                      Show players
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The "New division level" dialog opened from the Divisions tab. */
export function LevelFormDialog({
  adminSeason,
  levelFormOpen,
  setLevelFormOpen,
  saveLevel,
  levelFormDirty,
  levelName,
  setLevelName,
  levelNameTaken,
  levelSkill,
  setLevelSkill,
  levelMatchType,
  setLevelMatchType,
  levelDescription,
  setLevelDescription,
}: {
  adminSeason: AdminSeason;
  levelFormOpen: boolean;
  setLevelFormOpen: (open: boolean) => void;
  saveLevel: AsyncAction<[], unknown>;
  levelFormDirty: boolean;
  levelName: string;
  setLevelName: (name: string) => void;
  levelNameTaken: boolean;
  levelSkill: DivisionSkillLevel;
  setLevelSkill: (skill: DivisionSkillLevel) => void;
  levelMatchType: DivisionMatchType;
  setLevelMatchType: (matchType: DivisionMatchType) => void;
  levelDescription: string;
  setLevelDescription: (description: string) => void;
}): React.JSX.Element {
  return (
    <Dialog
      open={levelFormOpen}
      onClose={() => {
        setLevelFormOpen(false);
        saveLevel.reset();
      }}
      title="New division level"
      description={`For ${adminSeason.name}. Players in a level play and are ranked together.`}
      dirty={levelFormDirty}
      dismissible={!saveLevel.pending}
      footer={
        <>
          <DialogCancelButton disabled={saveLevel.pending} />
          <Button
            type="submit"
            form="level-form"
            pending={saveLevel.pending}
            pendingLabel="Saving…"
            disabled={!levelName.trim() || levelNameTaken}
          >
            Create division level
          </Button>
        </>
      }
    >
      <form
        id="level-form"
        style={styles.dialogForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (levelNameTaken) return;
          void saveLevel.run();
        }}
      >
        <div style={styles.fieldGrid}>
          <Field id="level-skill" label="Skill level">
            <select
              id="level-skill"
              style={styles.input}
              value={levelSkill}
              onChange={(e) => {
                const skill = e.target.value as DivisionSkillLevel;
                setLevelSkill(skill);
                setLevelName(formatDivisionLevelName(skill, levelMatchType));
              }}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="open">Open</option>
            </select>
          </Field>
          <Field id="level-match-type" label="Format">
            <select
              id="level-match-type"
              style={styles.input}
              value={levelMatchType}
              onChange={(e) => {
                const matchType = e.target.value as DivisionMatchType;
                setLevelMatchType(matchType);
                setLevelName(formatDivisionLevelName(levelSkill, matchType));
              }}
            >
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </Field>
        </div>
        <Field id="level-name" label="Level name" hint="Filled in from the skill level and format; edit it if you like.">
          <input
            id="level-name"
            style={styles.input}
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            aria-describedby={levelNameTaken ? "level-name-hint level-name-error" : "level-name-hint"}
            aria-invalid={levelNameTaken || undefined}
            required
          />
          <FieldError id="level-name-error">
            {levelNameTaken
              ? `${adminSeason.name} already has a level called ${levelName.trim()}. Choose another name.`
              : ""}
          </FieldError>
        </Field>
        <Field id="level-description" label="Description (optional)">
          <input
            id="level-description"
            style={styles.input}
            value={levelDescription}
            onChange={(e) => setLevelDescription(e.target.value)}
            placeholder="e.g. NTRP 3.0 and below"
          />
        </Field>
        {saveLevel.error ? <InlineAlert tone="error">{saveLevel.error}</InlineAlert> : null}
      </form>
    </Dialog>
  );
}
