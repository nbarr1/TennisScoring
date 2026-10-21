/**
 * Constants, types, and pure helpers shared by the admin page and its tab
 * panels. Nothing here holds state.
 */
import {
  formatSeasonName,
  type DivisionMembership,
  type Season,
  type MessageReportReason,
  type User,
} from "@tennis/shared";

/** How long the transient "Saved" affordance stays visible next to a row control. */
export const SAVED_FLASH_MS = 1800;

/**
 * A row's division-level select writes only once the choice has settled. Arrow keys on a
 * closed select fire a change per keypress in Firefox and in Chrome on Windows, so writing
 * on every change moved a keyboard user's player through each level in turn, and passing
 * over "Unassigned" opened the removal confirmation.
 */
export const LEVEL_COMMIT_DELAY_MS = 600;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Lines of a pasted roster listed back before importing. */
export const IMPORT_PREVIEW_LIMIT = 8;

/** "spring-2027" → "Spring 2027"; anything else is shown as stored. */
export function seasonNameFromId(id: string): string {
  const match = /^(spring|fall)-(\d{4})$/.exec(id);
  return match ? formatSeasonName(Number(match[2]), match[1] as "spring" | "fall") : id;
}

export function normalizedName(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export type AdminTab = "roster" | "divisions" | "tools";
export type ToolPanel = "scheduler" | "reports" | null;
export type FocusTarget = "reports" | "results" | "roster" | "scheduler" | null;

/** A roster row: the player, plus the season membership that places them in a level (if any). */
export type RosterRow = { player: User; membership: DivisionMembership | null };

export type RosterAlert = { tone: "error" | "info"; message: string; retry?: () => void } | null;

export const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "roster", label: "Roster" },
  { id: "divisions", label: "Divisions" },
  { id: "tools", label: "Tools" },
];

export const REPORT_REASON_LABELS: Record<MessageReportReason, string> = {
  harassment: "Harassment",
  spam: "Spam",
  inappropriate: "Inappropriate",
  other: "Other",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Statuses that put a player on the admin roster. Module-level so the array identity is stable. */
export const ROSTER_MEMBERSHIP_STATUSES = ["active", "waitlisted"] as const;
// Roster filter listing division players rostered in other seasons but not the selected one.
export const OTHER_SEASONS_FILTER = "other-seasons";

/** Max callables in flight at once — enough to stop a 40-player import crawling, gentle on quota. */
export const ROSTER_WRITE_CONCURRENCY = 5;

/**
 * Milliseconds from a Firestore timestamp field. `DivisionMembership.updatedAt` is typed
 * `number`, but the server writes `serverTimestamp()`, so a live snapshot hands back a
 * `Timestamp` object — comparing two of those with `>` is always false. Returns 0 for a
 * pending server timestamp, which reads as null until the write resolves.
 */
export function timestampMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
  }
  return 0;
}

export function formatShortDate(value: unknown): string | null {
  const ms = timestampMillis(value);
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Rebuilds a paste line `parseRosterPaste` reads back as the same entry. */
export function rosterLine(entry: { name?: string; email?: string }): string {
  if (entry.name && entry.email) return `${entry.name}, ${entry.email}`;
  return entry.name || entry.email || "";
}

/** A write that partly landed: the message says how much, and the caller has already kept what succeeded. */
export class PartialWriteError extends Error {}

export function playerStatusLabel(player: User): string {
  if (player.isRegistered !== false) return "Registered";
  return player.inviteStatus === "invite_sent" ? "Invite sent" : "Placeholder";
}

/** The page-level season every admin panel reads. */
export type AdminSeason = Pick<Season, "id" | "year" | "half" | "name">;

/**
 * Why a level write is refused while the season's memberships failed to load. Writing then
 * would set `status: 'active'` over a waitlisted membership the page never saw.
 */
export const ROSTER_UNAVAILABLE_MESSAGE =
  "The roster didn't load, so this change could put a waitlisted player back on the active list. Load the roster again, then try the change.";
