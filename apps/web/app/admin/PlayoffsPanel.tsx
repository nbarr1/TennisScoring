"use client";

import type { CSSProperties, RefObject } from "react";
import Link from "next/link";
import { IconArrowDown, IconArrowUp, IconTrophy } from "@tabler/icons-react";
import { MIN_PLAYOFF_ENTRANTS, playoffRoundName, playoffRounds } from "@tennis/shared";
import type { PlayoffBracket, PlayoffSlot } from "@tennis/shared";
import { Button, EmptyState, ErrorState, InlineAlert, useConfirm } from "../shared/ui";
import { color, radius, space, type } from "../shared/tokens";
import { Field } from "./AdminParts";
import { styles } from "./adminStyles";
import { slotSideLabel, type PlayoffAdmin } from "./usePlayoffAdmin";

const ENTRANT_OPTIONS = [2, 4, 8, 16, 32];

const local = {
  seedList: { listStyle: "none", margin: `0 0 ${space.lg}px`, padding: 0, display: "grid", gap: space.xs },
  seedItem: { display: "flex", alignItems: "center", gap: space.sm, ...type.bodySmall, color: color.ink },
  seedNumber: { ...type.label, color: color.textMuted, minWidth: 28 },
  seedName: { flex: 1, minWidth: 0 },
  bracket: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "minmax(200px, 1fr)",
    gap: space.lg,
    overflowX: "auto",
    paddingBottom: space.sm,
    marginBottom: space.lg,
  },
  round: { display: "grid", gap: space.sm, alignContent: "space-around" },
  roundTitle: { ...type.label, color: color.clubhouseGreen, margin: 0 },
  slot: {
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    padding: `${space.xs}px ${space.sm}px`,
    display: "grid",
    gap: 2,
    ...type.bodySmall,
    color: color.ink,
  },
  winner: { fontWeight: 700 },
  muted: { color: color.textMuted },
  bracketHeader: { display: "flex", alignItems: "center", gap: space.sm, flexWrap: "wrap", marginBottom: space.sm },
  bracketTitle: { ...type.title, fontSize: 16, color: color.ink, margin: 0 },
  bracketMeta: { ...type.bodySmall, color: color.textMuted, margin: `0 0 ${space.md}px` },
  bracketList: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.xl },
} satisfies Record<string, CSSProperties>;

function SlotCard({
  slot,
  names,
}: {
  slot: PlayoffSlot;
  names: Record<string, string> | Map<string, string>;
}): React.JSX.Element {
  const sides = (["player1", "player2"] as const).map((side) => {
    const id = side === "player1" ? slot.player1Id : slot.player2Id;
    const won = Boolean(id && slot.winnerId === id);
    return (
      <span key={side} style={{ ...(won ? local.winner : {}), ...(id ? {} : local.muted) }}>
        {slotSideLabel(slot, side, names)}
        {won ? <span className="sr-only"> (won)</span> : null}
      </span>
    );
  });
  return (
    <li style={local.slot}>
      {sides}
      {slot.matchId ? (
        <Link href={`/matches/${encodeURIComponent(slot.matchId)}`} className="tl-link">
          Open match
        </Link>
      ) : null}
    </li>
  );
}

function BracketView({
  slots,
  totalRounds,
  names,
  label,
}: {
  slots: PlayoffBracket["slots"];
  totalRounds: number;
  names: Record<string, string> | Map<string, string>;
  label: string;
}): React.JSX.Element {
  return (
    <div style={local.bracket} role="group" aria-label={label}>
      {playoffRounds(slots, totalRounds).map((round, index) => (
        <section key={index} style={local.round} aria-label={playoffRoundName(index + 1, totalRounds)}>
          <h4 style={local.roundTitle}>{playoffRoundName(index + 1, totalRounds)}</h4>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.sm }}>
            {round.map((slot) => (
              <SlotCard key={`${slot.round}-${slot.slot}`} slot={slot} names={names} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The Playoffs tool on the admin Tools tab: seed a single-elimination bracket
 * from a level's standings, publish it, and follow every bracket in the season.
 * The state lives in AdminPage (usePlayoffAdmin), so it survives a tab switch.
 */
export function PlayoffsPanel({
  playoffs,
  seasonName,
  headingRef,
}: {
  playoffs: PlayoffAdmin;
  seasonName: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}): React.JSX.Element {
  const { confirm, confirmDialog } = useConfirm();
  const p = playoffs;
  // The usual bracket sizes the standings can fill, plus the whole field when it is another size.
  const sizeOptions = [
    ...ENTRANT_OPTIONS.filter((n) => n <= p.maxEntrants),
    ...(p.maxEntrants >= MIN_PLAYOFF_ENTRANTS && !ENTRANT_OPTIONS.includes(p.maxEntrants) ? [p.maxEntrants] : []),
  ];

  async function requestPublish() {
    if (!p.validate() || !p.preview) return;
    const ok = await confirm({
      title: `Publish a ${p.preview.seedIds.length}-player playoff?`,
      message:
        "The first-round matches are created and the players are notified. Later rounds are created as results are confirmed. Playoff results don't change the standings.",
      confirmLabel: "Publish playoff",
    });
    if (ok) await p.publish.run();
  }

  async function requestCancel(bracket: PlayoffBracket) {
    const ok = await confirm({
      title: `Cancel ${bracket.name}?`,
      message: "Matches that haven't been played are cancelled for both players. Results already played are kept. This can't be undone.",
      confirmLabel: "Cancel playoff",
      cancelLabel: "Keep playoff",
      tone: "danger",
    });
    if (ok) await p.cancel.run(bracket.id);
  }

  return (
    <section id="admin-playoffs-panel" style={styles.card} aria-labelledby="playoffs-panel-title">
      <h2 id="playoffs-panel-title" ref={headingRef} tabIndex={-1} style={styles.sectionTitle}>
        Playoffs
      </h2>
      <p style={styles.hint}>
        Seed a single-elimination playoff from {seasonName} standings. Top seeds get the byes when
        the field isn&rsquo;t a power of two, and playoff results don&rsquo;t change the standings.
      </p>

      {p.singlesLevels.length === 0 ? (
        <InlineAlert tone="info" role={null} style={styles.blockGap}>
          This season has no singles levels. Playoffs aren&rsquo;t available for doubles levels yet.
        </InlineAlert>
      ) : (
        <>
          <div style={styles.fieldGrid}>
            <Field id="po-level" label="Division level">
              <select
                id="po-level"
                style={styles.input}
                value={p.levelId}
                onChange={(e) => p.setLevelId(e.target.value)}
              >
                {p.singlesLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="po-size" label="Players" hint={`${p.order.length} in this level's standings`}>
              <select
                id="po-size"
                style={styles.input}
                value={p.entrants}
                onChange={(e) => p.setEntrants(Number(e.target.value))}
                disabled={p.maxEntrants < MIN_PLAYOFF_ENTRANTS}
              >
                {sizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n === p.maxEntrants && !ENTRANT_OPTIONS.includes(n) ? `Everyone (${n})` : `Top ${n}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="po-name" label="Name" hint="Optional. Shown in notifications.">
              <input
                id="po-name"
                style={styles.input}
                value={p.name}
                maxLength={80}
                placeholder={p.levelId ? `${p.levelName(p.levelId)} playoffs` : "Playoffs"}
                onChange={(e) => p.setName(e.target.value)}
              />
            </Field>
            <Field id="po-start" label="First round" hint="Optional. Players can change match times.">
              <input
                id="po-start"
                type="date"
                style={styles.input}
                value={p.startDate}
                onChange={(e) => p.setStartDate(e.target.value)}
              />
            </Field>
            <Field id="po-interval" label="Days between rounds">
              <input
                id="po-interval"
                type="number"
                min={1}
                max={90}
                style={styles.input}
                value={p.intervalDays}
                onChange={(e) => p.setIntervalDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
              />
            </Field>
          </div>

          {p.standingsError ? (
            <ErrorState compact title="Couldn't load this level's standings." error={p.standingsError} />
          ) : p.standingsLoading ? (
            <p style={styles.hint}>Loading standings…</p>
          ) : p.order.length < MIN_PLAYOFF_ENTRANTS ? (
            <p style={styles.hint}>
              This level needs at least {MIN_PLAYOFF_ENTRANTS} players in its {seasonName} standings
              before it can have a playoff.
            </p>
          ) : (
            <fieldset style={styles.fieldset}>
              <legend style={styles.legend}>Seeds</legend>
              <ol style={local.seedList}>
                {p.seeds.map((id, index) => {
                  const nameText = p.nameById.get(id) ?? "Unknown player";
                  return (
                    <li key={id} style={local.seedItem}>
                      <span style={local.seedNumber}>{index + 1}</span>
                      <span style={local.seedName}>{nameText}</span>
                      <Button
                        size="sm"
                        variant="quiet"
                        icon={<IconArrowUp size={16} aria-hidden="true" />}
                        aria-label={`Move ${nameText} up a seed`}
                        disabled={index === 0}
                        onClick={() => p.moveSeed(index, -1)}
                      />
                      <Button
                        size="sm"
                        variant="quiet"
                        icon={<IconArrowDown size={16} aria-hidden="true" />}
                        aria-label={`Move ${nameText} down a seed`}
                        disabled={index === p.order.length - 1}
                        onClick={() => p.moveSeed(index, 1)}
                      />
                    </li>
                  );
                })}
              </ol>
              {p.seedsCustomized ? (
                <Button size="sm" variant="secondary" onClick={p.resetSeeds}>
                  Reset to standings order
                </Button>
              ) : null}
            </fieldset>
          )}

          {p.preview ? (
            <>
              <h3 style={styles.subTitle}>Preview</h3>
              <BracketView
                slots={p.preview.slots}
                totalRounds={p.preview.totalRounds}
                names={p.nameById}
                label="Playoff preview"
              />
            </>
          ) : null}

          {p.formError ? (
            <InlineAlert tone="error" style={styles.blockGap}>
              {p.formError}
            </InlineAlert>
          ) : null}
          {p.publish.error ? (
            <InlineAlert tone="error" style={styles.blockGap}>
              {p.publish.error}
            </InlineAlert>
          ) : null}
          <div style={styles.actionsRow}>
            <Button
              icon={<IconTrophy size={18} aria-hidden="true" />}
              pending={p.publish.pending}
              pendingLabel="Publishing…"
              disabled={!p.preview}
              onClick={() => void requestPublish()}
            >
              Publish playoff
            </Button>
          </div>
        </>
      )}

      {p.message ? (
        <InlineAlert tone="success" role={null} onDismiss={() => p.setMessage("")} style={{ marginTop: space.lg }}>
          {p.message}
        </InlineAlert>
      ) : null}
      {p.cancel.error ? (
        <InlineAlert tone="error" style={{ marginTop: space.lg }}>
          {p.cancel.error}
        </InlineAlert>
      ) : null}

      <h3 style={{ ...styles.subTitle, marginTop: space.xl }}>{seasonName} playoffs</h3>
      {p.bracketsError ? (
        <ErrorState compact title="Couldn't load this season's playoffs." error={p.bracketsError} />
      ) : p.bracketsLoading ? (
        <p style={styles.hint}>Loading playoffs…</p>
      ) : p.brackets.length === 0 ? (
        <EmptyState compact title="No playoffs yet" description={`Playoffs published for ${seasonName} appear here.`} />
      ) : (
        <ul style={local.bracketList}>
          {p.brackets.map((bracket) => (
            <li key={bracket.id}>
              <div style={local.bracketHeader}>
                <h4 style={local.bracketTitle}>{bracket.name}</h4>
                {bracket.status === "in_progress" ? (
                  <Button
                    size="sm"
                    variant="quiet-danger"
                    disabled={p.cancel.pending}
                    onClick={() => void requestCancel(bracket)}
                  >
                    Cancel playoff
                  </Button>
                ) : null}
              </div>
              <p style={local.bracketMeta}>
                {p.levelName(bracket.divisionLevelId)} · {bracket.seedIds.length} players ·{" "}
                {bracket.status === "completed"
                  ? `Champion: ${bracket.playerNames[bracket.championId ?? ""] ?? "Unknown player"}`
                  : bracket.status === "cancelled"
                    ? "Cancelled"
                    : "In progress"}
              </p>
              <BracketView
                slots={bracket.slots}
                totalRounds={bracket.totalRounds}
                names={bracket.playerNames}
                label={bracket.name}
              />
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}
