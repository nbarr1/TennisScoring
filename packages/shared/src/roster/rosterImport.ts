/**
 * Roster-import parsing shared by the admin roster surfaces, alongside the small concurrency
 * helper those bulk writes use. Kept here (rather than in the web app) so the parsing rules
 * are covered by tests and both apps can import the same behavior.
 */

/** One parsed roster line. Either field may be empty, but never both. */
export type RosterImportEntry = {
  name: string;
  email: string;
};

/** A single unquoted address with no whitespace — enough to tell an email column from names. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Parses pasted roster lines. Splits on the first comma only, so names may not contain one.
 *
 * A line with no comma is read as an email when it looks like one and as a name otherwise.
 * Pasting a bare column of addresses is the most common roster shape, and reading those as
 * names creates placeholder accounts called "ann@example.com" with no email set — accounts
 * that can never be invited and never match the real one.
 *
 * Entries are de-duplicated by email (or by name when there is no email), because two rows
 * for one person race each other to create two placeholder accounts.
 */
export function parseRosterPaste(text: string): RosterImportEntry[] {
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.indexOf(",");
      if (comma === -1) {
        return looksLikeEmail(line) ? { name: "", email: line } : { name: line, email: "" };
      }
      const left = line.slice(0, comma).trim();
      const right = line.slice(comma + 1).trim();
      // Tolerate "email, Name" as well as "Name, email".
      if (looksLikeEmail(left) && !looksLikeEmail(right)) {
        return { name: right, email: left };
      }
      return { name: left, email: right };
    })
    .filter((entry) => entry.name.length > 0 || entry.email.length > 0);

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.email ? `e:${entry.email.toLowerCase()}` : `n:${entry.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One settled outcome from `mapWithConcurrency`. */
export type SettledResult<T, R> = { item: T; value: R } | { item: T; error: unknown };

/** Narrows a settled entry to its failure case. */
export function isFailure<T, R>(result: SettledResult<T, R>): result is { item: T; error: unknown } {
  return "error" in result;
}

/**
 * Runs `task` over every item with at most `limit` in flight, resolving per-item outcomes
 * rather than rejecting, so one failure never discards the results that already landed.
 * Results keep the input order regardless of completion order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<Array<SettledResult<T, R>>> {
  const results = new Array<SettledResult<T, R>>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      try {
        results[index] = { item, value: await task(item) };
      } catch (error) {
        results[index] = { item, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
