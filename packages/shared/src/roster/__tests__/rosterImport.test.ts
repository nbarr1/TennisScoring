import {
  isFailure,
  looksLikeEmail,
  mapWithConcurrency,
  parseRosterPaste,
} from "../rosterImport";

describe("looksLikeEmail", () => {
  it("accepts an ordinary address", () => {
    expect(looksLikeEmail("ann@example.com")).toBe(true);
    expect(looksLikeEmail("ann.smith+league@example.co.uk")).toBe(true);
  });

  it("rejects names, bare domains, and addresses with whitespace", () => {
    expect(looksLikeEmail("Ann Smith")).toBe(false);
    expect(looksLikeEmail("example.com")).toBe(false);
    expect(looksLikeEmail("ann@example")).toBe(false);
    expect(looksLikeEmail("ann @example.com")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });

  it("requires a local part, a single @, and a dot inside the domain", () => {
    expect(looksLikeEmail("@example.com")).toBe(false);
    expect(looksLikeEmail("ann@")).toBe(false);
    expect(looksLikeEmail("ann@@example.com")).toBe(false);
    expect(looksLikeEmail("ann@a@example.com")).toBe(false);
    expect(looksLikeEmail("ann@.com")).toBe(false);
    expect(looksLikeEmail("ann@example.")).toBe(false);
    expect(looksLikeEmail("ann@a.b")).toBe(true);
  });

  it("rejects a tab or newline as whitespace, not just a space", () => {
    expect(looksLikeEmail("ann\t@example.com")).toBe(false);
    expect(looksLikeEmail("ann@example.com\n")).toBe(false);
  });

  // Regression: the original `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` backtracked quadratically,
  // because a dot is itself matched by `[^\s@]`. A 40,000-character line took ~2s, on text
  // pasted straight into the roster import box. Every check is now a linear scan.
  it("stays fast on input that made the original pattern backtrack", () => {
    const pathological = `!@${"!.".repeat(40000)} `;
    const started = Date.now();
    expect(looksLikeEmail(pathological)).toBe(false);
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("scales linearly rather than quadratically with input length", () => {
    const build = (n: number) => `!@!.${"!.".repeat(n)}@`;
    const time = (value: string) => {
      const started = process.hrtime.bigint();
      looksLikeEmail(value);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };
    build(1000);
    // Quadratic growth would be ~16x for a 4x longer input; linear stays far under that.
    const small = Math.max(time(build(10000)), 0.01);
    const large = time(build(40000));
    expect(large / small).toBeLessThan(8);
  });
});

describe("parseRosterPaste", () => {
  it("parses 'Name, email' lines", () => {
    expect(parseRosterPaste("Ann Smith, ann@example.com\nBob Jones, bob@example.com")).toEqual([
      { name: "Ann Smith", email: "ann@example.com" },
      { name: "Bob Jones", email: "bob@example.com" },
    ]);
  });

  // The regression this fixes: a pasted column of addresses used to become placeholder
  // accounts named after the address, with no email set.
  it("reads a comma-less line that looks like an address as an email, not a name", () => {
    expect(parseRosterPaste("ann@example.com\nbob@example.com")).toEqual([
      { name: "", email: "ann@example.com" },
      { name: "", email: "bob@example.com" },
    ]);
  });

  it("still reads a comma-less line that is not an address as a name", () => {
    expect(parseRosterPaste("Ann Smith\nBob Jones")).toEqual([
      { name: "Ann Smith", email: "" },
      { name: "Bob Jones", email: "" },
    ]);
  });

  it("accepts the reversed 'email, Name' column order", () => {
    expect(parseRosterPaste("ann@example.com, Ann Smith")).toEqual([
      { name: "Ann Smith", email: "ann@example.com" },
    ]);
  });

  it("keeps 'Name, email' when only the right side is an address", () => {
    expect(parseRosterPaste("Smith, Ann, ann@example.com")).toEqual([
      { name: "Smith", email: "Ann, ann@example.com" },
    ]);
  });

  it("drops blank lines and trims surrounding whitespace", () => {
    expect(parseRosterPaste("\n  Ann Smith ,  ann@example.com  \n\n   \n")).toEqual([
      { name: "Ann Smith", email: "ann@example.com" },
    ]);
  });

  it("de-duplicates by email, case-insensitively, so one person cannot be imported twice", () => {
    expect(
      parseRosterPaste("Ann Smith, ann@example.com\nAnn S, ANN@example.com\nann@example.com"),
    ).toEqual([{ name: "Ann Smith", email: "ann@example.com" }]);
  });

  it("de-duplicates name-only rows by name", () => {
    expect(parseRosterPaste("Ann Smith\nann smith\nBob Jones")).toEqual([
      { name: "Ann Smith", email: "" },
      { name: "Bob Jones", email: "" },
    ]);
  });

  it("treats same-named people with different emails as distinct", () => {
    expect(parseRosterPaste("Ann Smith, ann1@example.com\nAnn Smith, ann2@example.com")).toEqual([
      { name: "Ann Smith", email: "ann1@example.com" },
      { name: "Ann Smith", email: "ann2@example.com" },
    ]);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(parseRosterPaste("")).toEqual([]);
    expect(parseRosterPaste("\n  \n")).toEqual([]);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps input order even when tasks settle out of order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(results.map((r) => (isFailure(r) ? "err" : r.value))).toEqual([30, 10, 20]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 5, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  // The regression this fixes: a rejected write used to abort the loop and discard every
  // result, leaving the caller unable to tell what had actually landed.
  it("reports per-item failures without discarding the successes", async () => {
    const boom = new Error("nope");
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw boom;
      return n * 10;
    });
    expect(results).toHaveLength(3);
    expect(isFailure(results[0])).toBe(false);
    expect(isFailure(results[1])).toBe(true);
    expect(isFailure(results[2])).toBe(false);
    expect(results.filter(isFailure).map((r) => r.error)).toEqual([boom]);
    expect(results.filter((r) => !isFailure(r)).map((r) => r.item)).toEqual([1, 3]);
  });

  it("runs every task even when all of them fail", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async () => {
      throw new Error("always");
    });
    expect(results.filter(isFailure)).toHaveLength(3);
  });

  it("handles an empty list without hanging", async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([]);
  });

  it("still runs when the limit is zero or negative", async () => {
    const results = await mapWithConcurrency([1, 2], 0, async (n) => n);
    expect(results.map((r) => (isFailure(r) ? "err" : r.value))).toEqual([1, 2]);
  });
});
