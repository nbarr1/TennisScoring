"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cancelPlayoffBracket,
  publishPlayoffBracket,
  usePlayoffBrackets,
  useRankings,
} from "@tennis/firebase-client";
import {
  MAX_PLAYOFF_ENTRANTS,
  MIN_PLAYOFF_ENTRANTS,
  createPlayoffSlots,
} from "@tennis/shared";
import type { DivisionLevel, PlayoffSlot } from "@tennis/shared";
import { useAsyncAction } from "../shared/ui";
import { plural } from "./AdminParts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The playoff tool's state. AdminPage calls this so the form survives a switch
 * to another tab and back, as the round-robin scheduler's state does.
 *
 * Seeds come from the level's standings for the page's season, best first,
 * and the leader can move a player up or down before publishing. The preview
 * runs the same `createPlayoffSlots()` the publish callable does, so the
 * bracket shown is the bracket created.
 */
export function usePlayoffAdmin({
  divisionId,
  seasonId,
  levels,
}: {
  divisionId: string | null;
  seasonId: string;
  levels: DivisionLevel[];
}) {
  const singlesLevels = useMemo(() => levels.filter((level) => level.matchType !== "doubles"), [levels]);
  const [levelId, setLevelIdState] = useState("");
  const [entrants, setEntrantsState] = useState(4);
  // A leader's reordering of the standings, or null to follow the standings.
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [intervalDays, setIntervalDays] = useState(7);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  // Keep the level valid for the season the page is showing.
  useEffect(() => {
    if (!singlesLevels.some((level) => level.id === levelId)) {
      setLevelIdState(singlesLevels[0]?.id ?? "");
      setCustomOrder(null);
    }
  }, [singlesLevels, levelId]);

  const { rankings, loading: standingsLoading, error: standingsError } = useRankings(divisionId, {
    seasonId,
    divisionLevelId: levelId || undefined,
  });
  const standings = useMemo(() => [...rankings].sort((a, b) => a.rank - b.rank), [rankings]);
  const nameById = useMemo(
    () => new Map(standings.map((row) => [row.userId, row.displayName] as const)),
    [standings],
  );

  // A custom order only survives while it names exactly the current standings.
  const order = useMemo(() => {
    const ids = standings.map((row) => row.userId);
    if (customOrder && customOrder.length === ids.length && customOrder.every((id) => nameById.has(id))) {
      return customOrder;
    }
    return ids;
  }, [customOrder, standings, nameById]);

  const maxEntrants = Math.min(MAX_PLAYOFF_ENTRANTS, order.length);
  const entrantCount = Math.max(Math.min(entrants, maxEntrants), Math.min(MIN_PLAYOFF_ENTRANTS, maxEntrants));
  const seeds = order.slice(0, entrantCount);

  const preview = useMemo(() => {
    if (seeds.length < MIN_PLAYOFF_ENTRANTS) return null;
    try {
      return createPlayoffSlots(seeds);
    } catch {
      return null;
    }
  }, [seeds]);

  const { brackets, loading: bracketsLoading, error: bracketsError } = usePlayoffBrackets(divisionId, seasonId);
  const levelName = (id: string) => levels.find((level) => level.id === id)?.name ?? "Unknown level";

  function setLevelId(id: string) {
    setLevelIdState(id);
    setCustomOrder(null);
    setFormError("");
  }

  function setEntrants(count: number) {
    setEntrantsState(count);
    setFormError("");
  }

  /** Moves the player at `index` up (-1) or down (+1) one seed. */
  function moveSeed(index: number, delta: -1 | 1) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setCustomOrder(next);
  }

  function resetSeeds() {
    setCustomOrder(null);
  }

  const startAt = DATE_PATTERN.test(startDate) ? Date.parse(`${startDate}T18:00:00`) || undefined : undefined;

  const publish = useAsyncAction(
    async () => {
      if (!divisionId || !levelId || !preview) return "";
      const result = await publishPlayoffBracket({
        divisionId,
        seasonId,
        divisionLevelId: levelId,
        name: name.trim() || `${levelName(levelId)} playoffs`,
        playerIds: preview.seedIds,
        ...(startAt !== undefined && { startAt }),
        intervalDays,
      });
      const text = `Playoff published. ${plural(result.matchesCreated, "match was", "matches were")} created for the first round, and the players were notified.`;
      setMessage(text);
      setName("");
      return text;
    },
    {
      successMessage: (text) => text,
      errorMessage: "Couldn't publish the playoff. Try again.",
    },
  );

  const cancel = useAsyncAction(
    async (bracketId: string) => {
      if (!divisionId) return "";
      const result = await cancelPlayoffBracket({ divisionId, bracketId });
      const text = `Playoff cancelled. ${plural(result.matchesCancelled, "unplayed match was", "unplayed matches were")} cancelled; results already played are kept.`;
      setMessage(text);
      return text;
    },
    {
      successMessage: (text) => text,
      errorMessage: "Couldn't cancel the playoff. Try again.",
    },
  );

  /** Checks the form, or returns false with a message on the field that's wrong. */
  function validate(): boolean {
    if (!levelId) {
      setFormError("Choose a singles division level.");
      return false;
    }
    if (!preview) {
      setFormError("A playoff needs at least 2 players in this level's standings.");
      return false;
    }
    if (startDate && startAt === undefined) {
      setFormError("That start date isn't valid. Choose it again, or leave it empty.");
      return false;
    }
    setFormError("");
    return true;
  }

  return {
    singlesLevels,
    levelId,
    setLevelId,
    levelName,
    entrants: entrantCount,
    maxEntrants,
    setEntrants,
    order,
    seeds,
    nameById,
    moveSeed,
    resetSeeds,
    seedsCustomized: customOrder !== null && order === customOrder,
    standingsLoading,
    standingsError,
    preview,
    name,
    setName,
    startDate,
    setStartDate,
    intervalDays,
    setIntervalDays,
    formError,
    validate,
    message,
    setMessage,
    publish,
    cancel,
    brackets,
    bracketsLoading,
    bracketsError,
  };
}

export type PlayoffAdmin = ReturnType<typeof usePlayoffAdmin>;

/** "Ann Smith (1)" for a seeded slot side, "Bye" for an empty round-1 place. */
export function slotSideLabel(
  slot: PlayoffSlot,
  side: "player1" | "player2",
  names: Record<string, string> | Map<string, string>,
): string {
  const id = side === "player1" ? slot.player1Id : slot.player2Id;
  const seed = side === "player1" ? slot.player1Seed : slot.player2Seed;
  if (!id) return slot.round === 1 ? "Bye" : "To be decided";
  const name = names instanceof Map ? names.get(id) : names[id];
  return `${name ?? "Unknown player"}${seed ? ` (${seed})` : ""}`;
}
