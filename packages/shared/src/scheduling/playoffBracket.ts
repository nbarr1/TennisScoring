import type { Player } from '../types/match';

/**
 * Single-elimination playoff brackets.
 *
 * A bracket is seeded from a list of player ids in seed order (seed 1 first),
 * usually the final regular-season standings. It is padded to the next power of
 * two, and the empty places are byes that go to the top seeds. Seeds meet in
 * the standard order (1 v 8, 4 v 5, 2 v 7, 3 v 6 for eight places), so the top
 * two seeds can only meet in the final.
 *
 * Everything here is pure. The Cloud Functions store the slots on a bracket
 * document, create a match for each slot whose two players are known, and
 * record the winner when that match is confirmed.
 */

export const MIN_PLAYOFF_ENTRANTS = 2;
export const MAX_PLAYOFF_ENTRANTS = 32;

export type PlayoffBracketStatus = 'in_progress' | 'completed' | 'cancelled';

/** One match place in a bracket. Rounds count from 1, slots from 0. */
export interface PlayoffSlot {
  round: number;
  slot: number;
  /** `null` until the feeding match is decided, or a bye in round 1. */
  player1Id: string | null;
  player2Id: string | null;
  player1Seed?: number;
  player2Seed?: number;
  /** The match created for this slot, once both players are known. */
  matchId?: string;
  winnerId?: string;
  /** True when the slot was decided without a match (a round-1 bye). */
  bye?: boolean;
}

/** `divisions/{divisionId}/playoffBrackets/{bracketId}`. */
export interface PlayoffBracket {
  id: string;
  divisionId: string;
  seasonId: string;
  divisionLevelId: string;
  name: string;
  /** Places in round 1, a power of two. */
  size: number;
  totalRounds: number;
  /** Entrants in seed order; seed 1 is `seedIds[0]`. */
  seedIds: string[];
  playerNames: Record<string, string>;
  /** Keyed by `playoffSlotKey(round, slot)`. */
  slots: Record<string, PlayoffSlot>;
  status: PlayoffBracketStatus;
  championId?: string;
  /** Round 1's start time; round N is scheduled `intervalDays` after round N - 1. */
  startAt?: number;
  intervalDays: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * When a round is scheduled, or `undefined` when the bracket has no start time
 * or that time has already passed (a round played late is left for the
 * players to set).
 */
export function playoffRoundStart(
  bracket: Pick<PlayoffBracket, 'startAt' | 'intervalDays'>,
  round: number,
  now: number,
): number | undefined {
  if (typeof bracket.startAt !== 'number') return undefined;
  const start = bracket.startAt + (round - 1) * bracket.intervalDays * 24 * 60 * 60 * 1000;
  return round === 1 || start > now ? start : undefined;
}

/** Round-1 places for `entrants` players: the next power of two, or 0 when out of range. */
export function playoffBracketSize(entrants: number): number {
  if (!Number.isInteger(entrants) || entrants < MIN_PLAYOFF_ENTRANTS || entrants > MAX_PLAYOFF_ENTRANTS) {
    return 0;
  }
  let size = 2;
  while (size < entrants) size *= 2;
  return size;
}

export function playoffTotalRounds(size: number): number {
  return Math.round(Math.log2(size));
}

/**
 * Seeds in bracket order for a power-of-two `size`: adjacent pairs meet in
 * round 1. For 8 this is 1, 8, 4, 5, 2, 7, 3, 6.
 */
export function playoffSeedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

export function playoffSlotKey(round: number, slot: number): string {
  return `r${round}s${slot}`;
}

/** "Final", "Semifinal", "Quarterfinal", then "Round of 16" and so on. */
export function playoffRoundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  if (remaining <= 0) return 'Final';
  if (remaining === 1) return 'Semifinal';
  if (remaining === 2) return 'Quarterfinal';
  return `Round of ${2 ** (remaining + 1)}`;
}

/** Where a slot's winner plays next, or `undefined` after the final. */
export function nextPlayoffPlace(
  round: number,
  slot: number,
  totalRounds: number,
): { round: number; slot: number; side: Player } | undefined {
  if (round >= totalRounds) return undefined;
  return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 'player1' : 'player2' };
}

/**
 * Pairings for one bracket from entrants in seed order. Duplicate and empty ids
 * are dropped first. Byes are resolved, so a top seed with a bye already sits
 * in round 2. Throws when the entrant count is outside 2 to 32.
 */
export function createPlayoffSlots(seedIds: readonly string[]): {
  size: number;
  totalRounds: number;
  seedIds: string[];
  slots: Record<string, PlayoffSlot>;
} {
  const entrants = Array.from(new Set(seedIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  const size = playoffBracketSize(entrants.length);
  if (size === 0) {
    throw new Error(`A playoff needs ${MIN_PLAYOFF_ENTRANTS} to ${MAX_PLAYOFF_ENTRANTS} players.`);
  }
  const totalRounds = playoffTotalRounds(size);
  const order = playoffSeedOrder(size);
  const slots: Record<string, PlayoffSlot> = {};

  for (let i = 0; i < size / 2; i++) {
    const seed1 = order[2 * i];
    const seed2 = order[2 * i + 1];
    const player1Id = entrants[seed1 - 1] ?? null;
    const player2Id = entrants[seed2 - 1] ?? null;
    slots[playoffSlotKey(1, i)] = {
      round: 1,
      slot: i,
      player1Id,
      player2Id,
      ...(player1Id && { player1Seed: seed1 }),
      ...(player2Id && { player2Seed: seed2 }),
    };
  }
  for (let round = 2; round <= totalRounds; round++) {
    const count = size / 2 ** round;
    for (let i = 0; i < count; i++) {
      slots[playoffSlotKey(round, i)] = { round, slot: i, player1Id: null, player2Id: null };
    }
  }
  return { size, totalRounds, seedIds: entrants, slots: resolvePlayoffSlots(slots, totalRounds) };
}

/**
 * Settles round-1 byes and moves every decided winner into the slot they play
 * next. Idempotent, and returns a new object without changing `slots`.
 */
export function resolvePlayoffSlots(
  slots: Readonly<Record<string, PlayoffSlot>>,
  totalRounds: number,
): Record<string, PlayoffSlot> {
  const next: Record<string, PlayoffSlot> = {};
  for (const [key, value] of Object.entries(slots)) next[key] = { ...value };

  for (let round = 1; round <= totalRounds; round++) {
    for (const current of Object.values(next).filter((s) => s.round === round)) {
      // An empty place exists only in round 1, where it is a bye. Two byes
      // never meet: a bracket is never more than half empty.
      if (round === 1 && !current.winnerId && (current.player1Id === null) !== (current.player2Id === null)) {
        current.winnerId = (current.player1Id ?? current.player2Id) as string;
        current.bye = true;
      }
      if (!current.winnerId) continue;
      const place = nextPlayoffPlace(current.round, current.slot, totalRounds);
      if (!place) continue;
      const target = next[playoffSlotKey(place.round, place.slot)];
      if (!target) continue;
      const seed =
        current.winnerId === current.player1Id ? current.player1Seed : current.player2Seed;
      if (place.side === 'player1') {
        target.player1Id = current.winnerId;
        if (seed !== undefined) target.player1Seed = seed;
      } else {
        target.player2Id = current.winnerId;
        if (seed !== undefined) target.player2Seed = seed;
      }
    }
  }
  return next;
}

/** Slots whose two players are known and that have no match yet, in round then slot order. */
export function readyPlayoffSlots(slots: Readonly<Record<string, PlayoffSlot>>): PlayoffSlot[] {
  return Object.values(slots)
    .filter((s) => s.player1Id && s.player2Id && !s.matchId && !s.winnerId)
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
}

/**
 * Records a slot's winner and advances them. Returns `null` when the slot is
 * unknown, already decided, or `winnerId` isn't one of its players, so a
 * repeated trigger changes nothing.
 */
export function recordPlayoffWinner(
  slots: Readonly<Record<string, PlayoffSlot>>,
  totalRounds: number,
  round: number,
  slot: number,
  winnerId: string,
): Record<string, PlayoffSlot> | null {
  const current = slots[playoffSlotKey(round, slot)];
  if (!current || current.winnerId) return null;
  if (winnerId !== current.player1Id && winnerId !== current.player2Id) return null;
  return resolvePlayoffSlots(
    { ...slots, [playoffSlotKey(round, slot)]: { ...current, winnerId } },
    totalRounds,
  );
}

/** The final's winner, once there is one. */
export function playoffChampion(
  slots: Readonly<Record<string, PlayoffSlot>>,
  totalRounds: number,
): string | undefined {
  return slots[playoffSlotKey(totalRounds, 0)]?.winnerId;
}

/** Slots grouped by round, in bracket order, for display. */
export function playoffRounds(
  slots: Readonly<Record<string, PlayoffSlot>>,
  totalRounds: number,
): PlayoffSlot[][] {
  const rounds: PlayoffSlot[][] = [];
  for (let round = 1; round <= totalRounds; round++) {
    rounds.push(
      Object.values(slots)
        .filter((s) => s.round === round)
        .sort((a, b) => a.slot - b.slot),
    );
  }
  return rounds;
}
