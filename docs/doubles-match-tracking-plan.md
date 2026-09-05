# Doubles match tracking and team rankings

## Context

The app runs tennis leagues but only supports 1v1 play end to end. A division leader can already create a **doubles division level** (`DivisionLevel.matchType: 'singles' | 'doubles'`, `packages/shared/src/types/division.ts:4,27`) and both admin screens expose the picker — but every match created inside such a level is still a singles match. Doubles is a label with nothing behind it.

There is also **dead scaffolding** from an earlier attempt: `MatchSide`, `Match.side1`, `Match.side2` (`packages/shared/src/types/match.ts:76-79,203-204`), `Match.matchType` (`:202`), and `PlayerRanking.matchType` (`packages/shared/src/types/ranking.ts:8`) all exist as types. `firebase/firestore.rules:338-339` already allow-lists `side1`/`side2` on match writes. Nothing writes them; the only reader in the whole repo is the CSV export fallback at `firebase/src/divisions/divisionFunctions.ts:1471-1472`. This plan makes that scaffolding real.

Outcome: a player in a doubles division level can propose, play, score, report, and confirm a doubles match, and the division shows **team standings** for fixed partnerships.

## Decisions taken

| Decision | Choice |
|---|---|
| Team model | **Fixed partnerships.** Rankings and head-to-head operate on the pair, not the individual. |
| Team identity | **Implicit, derived** — a team is identified by the sorted pair of its member user IDs. No admin CRUD for teams (deliberately out of scope; see Not in scope). |
| Serving | **Team level.** `LiveScore.server` keeps its `'player1' \| 'player2'` shape, reinterpreted as *side*. No per-partner serve rotation, so `LiveScore` is unchanged and the Apple Watch / Wear OS native modules need no changes. |
| Scope | Core match lifecycle + team rankings + PDF report + CSV export. |

### The key insight that keeps this small

`Player = 'player1' | 'player2'` (`match.ts:74`) is already a **side label, not a person**. Every scoring path — `applyPoint`, tiebreaks, set completion, `extractMatchTotals` — treats it as an opaque side. **`packages/shared/src/scoring/scoreEngine.ts` needs zero changes for doubles.**

The second lever: on a doubles match write `player1Name`/`player2Name` as the *team* display name (`"Ann Smith / Bob Jones"`), with `player1Id`/`player2Id` set to each side's first member. Roughly 90 UI display sites that read `player1Name`/`player2Name` then render correctly with no edit. Only **participant checks** and **report-confirmation actor logic** genuinely have to change.

## Match document shape

```
matchType: 'doubles'
side1: { playerIds: [uidA, uidB], displayName: "Ann Smith / Bob Jones" }
side2: { playerIds: [uidC, uidD], displayName: "Cara Lee / Dan Ruiz" }
player1Id: uidA          // side 1 captain — keeps existing indexes/rules/notifications working
player2Id: uidC
player1Name: "Ann Smith / Bob Jones"   // team name, so legacy renderers are correct
player2Name: "Cara Lee / Dan Ruiz"
playerIds: [uidA, uidB, uidC, uidD]    // array-contains queries already work
```

Singles matches are untouched; `side1`/`side2` stay absent and every accessor falls back to `player1Id`/`player1Name`. **No data migration.**

---

## 1. `packages/shared` — helpers, types, ranking engine

### New: `packages/shared/src/match/matchSides.ts`

The single reuse point for every consumer. Works on legacy singles docs via fallback:

- `sidePlayerIds(match, side: Player): string[]` — `side1?.playerIds ?? [player1Id]`
- `sideDisplayName(match, side: Player): string` — `side1?.displayName ?? player1Name ?? player1Id`
- `sideOfPlayer(match, uid): Player | undefined`
- `isMatchParticipant(match, uid): boolean` — `playerIds.includes(uid) || uid === player1Id || uid === player2Id`
- `opposingSide(side: Player): Player`
- `isDoublesMatch(match): boolean`

### New: `packages/shared/src/doubles/doublesTeam.ts`

- `doublesTeamId(playerIds: string[]): string` — `[...ids].sort().join('_')`, order independent, stable across matches. This is what makes partnerships "fixed" without a team collection.
- `formatDoublesTeamName(names: string[]): string` — `"Ann Smith / Bob Jones"`
- `doublesHeadToHeadId(teamA, teamB): string` — `doubles_${[teamA, teamB].sort().join('_')}`. The `doubles_` prefix guarantees no collision with the existing singles h2h id scheme (`${a}_${b}`, `matchFunctions.ts:657`).

### `packages/shared/src/types/ranking.ts`

Add alongside `PlayerRanking`:

```ts
export interface DoublesTeamRanking {
  teamId: string;
  playerIds: string[];
  displayName: string;
  divisionId: string;
  season: string;
  seasonId?: string;
  divisionLevelId?: string;
  rank: number;
  matchesPlayed: number; matchesWon: number; matchesLost: number;
  setsWon: number; setsLost: number;
  gamesWon: number; gamesLost: number;
  gameDifferential: number;
  updatedAt: number;
}
```

Add `matchType?: DivisionMatchType` to `HeadToHead` (existing `player1Id`/`player2Id` fields hold team IDs for doubles rows — `buildH2HMap` already treats them as opaque strings).

### `packages/shared/src/scoring/rankingEngine.ts`

Refactor, do not duplicate. Extract the existing sort/rank body of `computeRankings` (`:16-35`) and `compareRankings` (`:49-68`) into a generic internal `rankEntities<T>(entities, keyOf, headToHeads)`, so the tiebreak order (matches won → sets won → games won → game differential → head-to-head → name) stays defined once. Then:

- `computeRankings(...)` — unchanged public signature, now a thin wrapper.
- `computeDoublesRankings(inputs: DoublesTeamRankingInput[], headToHeads: HeadToHead[]): DoublesTeamRanking[]` — new wrapper keyed on `teamId`.

`extractMatchTotals` (`:104-121`) and `updateRankingWithMatchResult` (`:70-87`) are already side-based and reused as-is.

### `packages/shared/src/types/export.ts`

`CsvExportType` → `'matches' | 'rankings' | 'doublesRankings'`.

### `packages/shared/src/index.ts`

Export the two new modules.

---

## 2. `firebase/` — functions, rules, indexes

### New collection

`divisions/{divisionId}/doublesRankings/{teamId}` — deliberately a **sibling** of `rankings/{userId}`, not the same collection. `recalculateRankings` prunes any ranking doc not in its computed set (`matchFunctions.ts:713-722`); mixing team docs in would make that prune wrong, and existing standings queries would pool singles and doubles rows.

### `firebase/src/matches/matchFunctions.ts`

- `validateMatchCompleteness` (`:39-53`) — keep the `player1Id`/`player2Id` requirement (captains are always set); additionally require, when `matchType === 'doubles'`, that `side1`/`side2` each carry exactly 2 non-empty player IDs.
- `rankingsRelevantFieldsChanged` (`:241-252`) — add `matchType`, `side1`, `side2` to the comparison.
- `recalculateRankings` (`:499-779`) — after the existing per-match loop, add a **second accumulation pass** over completed doubles matches:
  - Key stats by `doublesTeamId(sidePlayerIds(match, side))`; both partners' totals accrue to the one team row.
  - Team display name from the roster display names already loaded at `:528-563`, via `formatDoublesTeamName`.
  - Skip a team if any member is outside the division roster (mirrors the existing `player1Included`/`player2Included` gate at `:624-629`).
  - `computeDoublesRankings` → write `divisions/{id}/doublesRankings/{teamId}` on the same `bulkWriter`, prune stale team docs the same way.
  - Doubles head-to-head into the existing `headToHead` collection under `doublesHeadToHeadId(...)` with `matchType: 'doubles'`, accumulated in the **same** `h2hAccum` map so the existing prune at `:760-770` stays correct.
  - Do **not** touch `users/{uid}.rankingSummary` — it is a single object and its only role is a fallback for legacy singles data.

- Notification helpers (`notifyMatchProposed` `:254`, `notifyMatchAccepted` `:278`, `notifyMatchProposalCancelled` `:302`, `notifyOpponentOfSubmission` `:324`, `notifyLeaderOfDispute` `:361`) — fan out to every member of the target side via `sidePlayerIds` instead of the single opposing uid. The opponent resolution at `:331-334` becomes `sidePlayerIds(match, opposingSide(sideOfPlayer(match, submittedBy)))`.

- `recordHistoricMatch` (`:955-1073`) and `recordMatchOnBehalf` (`:1079-1189`) — accept optional `side1PlayerIds`/`side2PlayerIds`. When present: validate 2 IDs per side, all four distinct, all in the division (extend the existing `isInDivision` check at `:1136-1144`), and write the doubles document shape above. The `safePlayer1Id === safePlayer2Id` guard at `:1102` becomes a whole-`playerIds` uniqueness check.

### New: `firebase/src/matches/doublesFunctions.ts`

`createDoublesMatch` HTTPS callable — creates a doubles match with `status: 'proposed'` or `'scheduled'`.

Rationale for a callable rather than a client write: the existing `allow create` rule pins `playerIds` to a literal 2-element array (`firestore.rules:390`) and validating four players' division membership in rules would need four `get()` calls, against the 10-document-access cap. A callable using the Admin SDK sidesteps both and mirrors the existing `recordMatchOnBehalf` pattern. Export from `firebase/src/index.ts` and `firebase/src/targetedDeployIndex.ts`.

### `firebase/src/matches/scheduleFunctions.ts`

Round-robin doubles is **out of scope**, so add a guard rather than leaving it silently broken: reject with `failed-precondition` when the resolved level `matchType === 'doubles'` (today it would happily create 1v1 matches inside a doubles level).

### `firebase/src/reports/generateReport.ts`

Replace the two-user fetch at `:29-38` with a fetch over `sidePlayerIds(match, 'player1' | 'player2')`, joining resolved display names with `formatDoublesTeamName`. The downstream uses (`:78-83`, `:106`, `:118`) then work unchanged since they consume `p1Name`/`p2Name`.

### `firebase/src/divisions/divisionFunctions.ts`

- Matches CSV: already falls back to `side1?.displayName` (`:1471-1472`) — verify only.
- Add a `doublesRankings` export branch reading the new subcollection.

### `firebase/firestore.rules`

Five changes; mind the documented 10-`let`-per-function cap noted at `:209-211`.

1. Two new helpers:
   ```
   function sideOnePlayerIds(data) { return data.get('side1', {}).get('playerIds', [data.player1Id]); }
   function sideTwoPlayerIds(data) { return data.get('side2', {}).get('playerIds', [data.player2Id]); }
   ```
2. `isMatchParticipant` (`:57-62`) — add `request.auth.uid in matchData.playerIds`. `firebase/storage.rules` already does exactly this, so this brings Firestore into line rather than loosening anything new.
3. `isAcceptProposalUpdate` (`:222-227`) — `request.auth.uid in sideTwoPlayerIds(existing)` so either opponent can accept.
4. `isValidConfirmOrDisputeUpdate` (`:251-277`) — replace `isNotSubmitter` with an **opposing-side** check, so a submitter's own partner cannot confirm their team's report. Extract it as a standalone helper function to stay under the `let` cap.
5. New read block for `divisions/{divisionId}/doublesRankings/{teamId}`, copying the `rankings` block at `:196-203` (`allow write: if false`).

`allow create` for matches stays singles-only by design — doubles creation goes through the callable.

### `firebase/firestore.indexes.json`

Add composites on `doublesRankings` mirroring the existing `rankings` ones: `seasonId ASC + rank ASC`, and `seasonId ASC + divisionLevelId ASC + rank ASC`. No new `matches` index is needed — both the server recompute and the client fallback read all completed division matches and filter by `matchType` in memory.

---

## 3. `packages/firebase-client`

- `src/collections.ts` — add `doublesRankingsCol(divisionId)` and `doublesRankingsQuery(divisionId, ...extra)` following the shape of `rankingsCol`/`rankingsQuery` (`:25-26`, `:73`).
- New `src/hooks/useDoublesRankings.ts` — mirrors `useRankings` (`:232-368`): live subscription to `doublesRankings`, with the same client-side recompute fallback from `completedDivisionMatchesQuery` (filtered to `matchType === 'doubles'`) so standings appear before the Cloud Function first runs. Reuse `computeDoublesRankings`. Accepts `{ seasonId?, divisionLevelId? }` filters like its sibling.
- `src/hooks/useMatch.ts` — add `createDoublesMatch`/`proposeDoublesMatch` callable wrappers; thread optional `side1PlayerIds`/`side2PlayerIds` through `recordHistoricMatch` (`:151`) and `recordMatchOnBehalf` (`:187`).

Note: `playerMatchesQuery` (`collections.ts:70`) is already `playerIds array-contains`, so a doubles partner's match list works with no change.

---

## 4. Web and mobile UI

Because team names ride in `player1Name`/`player2Name`, display is largely free. Four targeted categories:

### a. Participant checks (6 sites) — swap in `isMatchParticipant` / `sidePlayerIds`

- `apps/web/app/matches/[id]/page.tsx:71`
- `apps/web/app/matches/page.tsx:219,222` — the "Pending Invitations" / "Awaiting Opponent" filters must test side membership, not `player2Id === uid`
- `apps/mobile/app/match/[id].tsx:503`
- `apps/mobile/app/(tabs)/matches.tsx:493,497`

### b. Report confirm/dispute actor (2 sites)

`apps/web/app/matches/[id]/page.tsx:326-338` and `apps/mobile/app/match/[id].tsx:1364-1391` currently gate on `submittedBy !== uid`, which in doubles lets the submitter's partner confirm. Gate on opposing-side membership, matching the new rule.

### c. Doubles pickers — the bulk of the work

When the selected division level is doubles, the opponent picker becomes *partner + two opponents*. Four modals, all hand-rolled with no shared abstraction today:

- `apps/web/app/matches/page.tsx` — `ProposeMatchModal` (`:1196-1394`), `RecordPastMatchModal` (`:530-1194`)
- `apps/mobile/app/(tabs)/matches.tsx` — create/record modal (`:199-455`, UI `~:730-1000`), `ProposeMatchModal` (`:1067-1290`)

All four already run a debounced `searchDivisionPlayers(divisionId, text)` (`packages/firebase-client/src/divisions.ts:319`) against a single selection slot. Extract a small **`DoublesSideSelector`** per app (one in `apps/web/app/shared/`, one under `apps/mobile/components/`) that wraps that existing search into three slots, rather than hand-rolling a third and fourth copy. Guest opponents are singles-only — hide the guest toggle for doubles.

### d. Standings (2 screens)

- `apps/web/app/dashboard/page.tsx` — add a Singles/Doubles segment beside the existing Season (`:66-79`) and Level (`:83-94`) filters; on Doubles, source rows from `useDoublesRankings` and key on `teamId`. The row renderer (`RankingRow`, `:129-152`) needs only the name/key swap since it reads `displayName`.
- `apps/mobile/app/(tabs)/index.tsx` — same segment; note this screen currently passes only `seasonId` (`:32`).

### e. Round-robin guard (2 sites)

Disable the generator with an explanatory note when the selected level is doubles: `apps/web/app/admin/page.tsx` RR card (`:1379-1516`) and `apps/mobile/app/round-robin-scheduler.tsx`. Backs the server-side rejection above.

### Match detail nicety

Show the two individual partner names as a subtitle under each side's team name, via `sidePlayerIds` — one small block each in `apps/web/app/matches/[id]/page.tsx` and `apps/mobile/app/match/[id].tsx`.

---

## 5. Tests

- New `packages/shared/src/doubles/__tests__/doublesTeam.test.ts` — `doublesTeamId` order-independence and stability; `formatDoublesTeamName`; the `matchSides` accessors falling back correctly on a legacy singles match with no `side1`/`side2`.
- Extend `packages/shared/src/scoring/__tests__/rankingEngine.test.ts` — `computeDoublesRankings` across each tiebreak level, including team head-to-head; assert the refactor leaves the existing `computeRankings` cases passing.
- Extend `firebase/scripts/rules-smoke.mjs` — a partner (player 3 of 4) can read and update the match; either opponent can accept a proposal; a submitter's partner is **denied** confirm; `doublesRankings` is client-readable and not client-writable.

## 6. Docs and version

- `CLAUDE.md` — doubles match shape, the `doublesRankings` collection, `createDoublesMatch`, and the new shared modules.
- `README.md`, `SETUP.md`, `CHANGELOG.md` (`[Unreleased] → Added`), `VERSION_1_BASELINE.md`, and `docs/android-app-brief.md` (it documents the `Match` shape verbatim at `:63`).
- Version bump **1.0.5 → 1.1.0** in the root `package.json` plus all five workspace packages together, per the versioning rule in `CLAUDE.md`.

## Not in scope (deliberate)

- **Admin team management.** Teams are derived from the sorted player-ID pair, so there is no team CRUD, no renaming, and no retiring a partnership. Team display name is composed from members' current display names at recompute time. Adding a `divisions/{id}/teams/{teamId}` collection later is additive — `doublesTeamId` stays the doc ID.
- **Round-robin doubles scheduling** — guarded off on both apps and rejected server-side.
- **Per-partner serve rotation** and receiver-court tracking. `LiveScore` is unchanged, so no Swift (`apps/mobile/ios/TennisScoringWatch/`) or Kotlin (`apps/mobile/android/wear/`) changes; the watches show team names because `player1Name`/`player2Name` carry them.
- Per-individual doubles statistics (`MatchStats` stays per-side, so stats are team-aggregated).
- `users/{uid}.doublesRankingSummary`.

## Verification

1. `pnpm build && pnpm typecheck && pnpm lint` from the root — the build step is the gate that catches bad module paths for the two new shared modules.
2. `pnpm test:shared` — new doubles tests plus the untouched score-engine suite, which must stay green since `scoreEngine.ts` is not modified.
3. `pnpm check:firebase-rules && pnpm --filter @tennis/firebase-functions test:rules` — the rules guard plus the extended smoke test.
4. Against the emulators (`cd firebase && pnpm serve`), end to end on web (`pnpm --filter @tennis/web dev`):
   - Create a doubles division level in Admin; confirm the RR scheduler is disabled for it with a visible reason.
   - Propose a doubles match; verify all three other players see it in Pending Invitations and that any opponent can accept.
   - Play it live; confirm the scoreboard, set breakdown, and `formatScoreDisplay` output are identical in shape to singles.
   - Submit the report as one winner; verify the **partner cannot confirm** and an opponent can.
   - Check `divisions/{id}/doublesRankings` in the emulator UI: one doc per team, correct rank/sets/games, and a `headToHead/doubles_...` doc.
   - Dashboard → Doubles segment shows team rows; the Singles segment is unchanged.
   - Play a second doubles match with the same partnership and confirm totals accrue to the *same* `teamId`.
5. Regression pass: create and complete a **singles** match and confirm `divisions/{id}/rankings` and the existing standings are byte-identical in behavior to before.
6. Verify the generated PDF (`match.reportUrl`) names both sides as teams, and that `exportDivisionCsv` returns doubles rows.
