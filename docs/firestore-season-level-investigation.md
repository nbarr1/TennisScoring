# Firestore season/level data-flow investigation

## Investigation summary

The current web UI filters both the Matches page and Division Standings page by a generated season id such as `spring-2026`/`fall-2026`. The default filter is the current UTC half-year from `currentSeasonForDate()`. The Matches page always queries `matches` with `where("seasonId", "==", selectedSeasonId)`, and the Standings page queries completed matches and ranking documents with the same `seasonId` filter. Legacy match documents that predate season/level fields can therefore disappear from both filtered pages even though they still exist in Firestore.

The safest fix is not a permanent admin UI. Use the one-time script `scripts/backfill-division-season-level.mjs` to tag only the selected division's existing match documents with the chosen `seasonId`, `divisionLevelId`, and optional `matchType` when those fields are missing. The script also upserts season/level membership documents for affected users so the admin roster views stay consistent with the season/level model.

## UI/component/data-fetching files involved

| Area | File | Data flow |
| --- | --- | --- |
| Matches list | `apps/web/app/matches/page.tsx` | Builds season and division-level filters, then subscribes to `divisionMatchesQuery(divisionId, where("seasonId", "==", selectedSeasonId), where("divisionLevelId", "==", activeLevelId))`. Renders `MatchCard` fields from each returned match. |
| Standings | `apps/web/app/dashboard/page.tsx` | Builds the same season/level filters, calls `useRankings(divisionId, { seasonId, divisionLevelId })`, and renders `RankingRow` from `PlayerRanking` fields. |
| Rankings hook | `packages/firebase-client/src/hooks/useRankings.ts` | Subscribes to `divisions/{divisionId}/rankings`, completed `matches`, and `users` roster data. It prefers non-empty Firestore ranking stats, otherwise computes standings from completed matches. |
| Division options/memberships | `packages/firebase-client/src/hooks/useDivisionOptions.ts` | Subscribes to `divisions/{divisionId}/levels` and `divisions/{divisionId}/memberships` filtered by `seasonId` and optional `divisionLevelId`. |
| Firestore query helpers | `packages/firebase-client/src/collections.ts` | Defines collection paths and common queries, including `matches`, `divisions/{divisionId}/levels`, `divisions/{divisionId}/memberships`, and `divisions/{divisionId}/rankings`. |
| Shared types | `packages/shared/src/types/division.ts`, `packages/shared/src/types/match.ts`, `packages/shared/src/types/ranking.ts`, `packages/shared/src/types/user.ts` | Define the expected Firestore document fields consumed by the UI. |
| Firestore security rules | `firebase/firestore.rules` | Allows authenticated reads for division members/roster members/leaders/admins. `levels`, `memberships`, and `rankings` writes are blocked for clients and intended for backend/admin writes. |

## Rendered UI fields and transformations

### Matches page

1. User context comes from `useAuthUser()` and `useUserProfile()`.
2. The active division comes from `useActiveDivisionId()`, which checks `users/{uid}.divisionId`, `divisions` where `leaderIds` contains the user, and `divisions` where `playerIds` contains the user.
3. Season options are derived locally by `defaultSeasonOptions()`; the selected default is `currentSeasonForDate().id`.
4. Division-level options come from `divisions/{divisionId}/levels`, then are filtered client-side to `level.seasonId === selectedSeasonId`.
5. The match subscription reads `matches` where:
   - `divisionId == active division id`
   - `seasonId == selected season id`
   - optional `divisionLevelId == selected level id`
   - ordered by `createdAt desc`
6. Returned match cards render:
   - `status` through `getMatchStatusMetadata()` for label/icon/color.
   - `source === "manual"` as a historic badge.
   - `winner` plus `player1Name`/`player2Name` fallback labels.
   - `scheduledAt` formatted with `Date#toLocaleString()` or `Time TBD` fallback.
   - `liveScore` transformed with `formatScoreDisplay()`/`formatGameScore()`.
   - `player2IsGuest` as a `(Guest)` suffix.
7. The page further groups the fetched matches by `status` into live, proposed, scheduled, pending report, disputed, completed, and cancelled sections.

### Division Standings page

1. User/division/season/level selection follows the same pattern as the Matches page.
2. `useRankings()` reads three sources:
   - `divisions/{divisionId}/rankings` ordered by `rank`, filtered by `seasonId` and optional `divisionLevelId`.
   - completed `matches` where `divisionId`, `status == "completed"`, and the same season/level filters match.
   - `users` where `divisionId == active division id` for roster fallback rows.
3. Computed rankings skip matches when:
   - `winner` is missing.
   - `isDivisionMatch === false`.
   - `liveScore.sets` is missing/empty.
4. For computed standings, `extractMatchTotals()` calculates sets/games, guest matches are excluded for the guest side, and head-to-head tiebreak inputs are derived in memory.
5. `RankingRow` renders `displayName`, `matchesWon`, `matchesLost`, `setsWon/(setsWon + setsLost)`, `gamesWon/(gamesWon + gamesLost)`, and signed `gameDifferential`.

## Firestore dependency map

### `matches/{matchId}`

- Document id strategy: generated Firestore id.
- Required by filtered pages:
  - `divisionId: string`
  - `seasonId: string` (`spring-YYYY` or `fall-YYYY`)
  - `divisionLevelId: string` when division-level filtering is used
  - `createdAt: number` for ordering
  - `status: MatchStatus`
- Required for match cards/details:
  - `player1Id: string`, `player2Id: string`, `playerIds: string[]`
  - `player1Name?: string`, `player2Name?: string`, `player2IsGuest?: boolean`
  - `liveScore: LiveScore`, `stats: MatchStats`, `winner?: "player1" | "player2"`
  - `scheduledAt?: number`, `startedAt?: number`, `completedAt?: number`
  - `source?: "live" | "manual"`, `isDivisionMatch?: boolean`
  - `matchType?: "singles" | "doubles"`
- Example valid document excerpt:

```json
{
  "divisionId": "division_123",
  "seasonId": "spring-2026",
  "divisionLevelId": "level_abc",
  "matchType": "singles",
  "player1Id": "uid_a",
  "player2Id": "uid_b",
  "playerIds": ["uid_a", "uid_b"],
  "player1Name": "Alex Player",
  "player2Name": "Blake Player",
  "status": "completed",
  "winner": "player1",
  "isDivisionMatch": true,
  "createdAt": 1770000000000,
  "completedAt": 1770003600000
}
```

### `divisions/{divisionId}`

- Document id strategy: generated or existing division id.
- Required fields used in active division resolution and access:
  - `id: string`, `name: string`
  - `leaderIds: string[]`, `playerIds: string[]`
  - `activeSeasonId?: string`
  - `createdAt: number`, `updatedAt: number`

### `divisions/{divisionId}/levels/{levelId}`

- Document id strategy: generated level id or caller-provided id.
- Required by filter dropdown and script validation:
  - `id: string`, `divisionId: string`, `seasonId: string`
  - `year: number`, `seasonHalf: "spring" | "fall"`
  - `name: string`, `skillLevel: string`, `matchType: "singles" | "doubles"`
  - `rankingsEnabled: boolean`, `active: boolean`, `sortOrder: number`
  - `createdAt: number`, `updatedAt: number`

### `divisions/{divisionId}/memberships/{membershipId}`

- Document id strategy: `${seasonId}_${divisionLevelId}_${userId}`.
- Required by season/level roster views:
  - `id: string`, `divisionId: string`, `seasonId: string`, `divisionLevelId: string`
  - `userId: string`, `displayNameSnapshot: string`
  - `role: "player" | "division_leader"`, `status: "active" | "waitlisted" | "removed"`
  - `source: "registered_user" | "placeholder" | "imported" | "migration"`
  - `assignedBy: string`, `createdAt: number`, `updatedAt: number`
- Optional snapshots: `emailSnapshot?: string`, `phoneSnapshot?: string`.

### `divisions/{divisionId}/rankings/{userId}`

- Document id strategy: user id.
- Required by standings if server rankings exist:
  - `userId: string`, `displayName: string`, `divisionId: string`, `season: string`
  - `seasonId?: string`, `divisionLevelId?: string`, `matchType?: "singles" | "doubles"`
  - `rank: number`, win/loss/set/game fields as numbers, `gameDifferential: number`, `updatedAt: number`
- Note: the one-time script intentionally does not tag or rewrite ranking documents. If ranking documents are missing for the filtered season, the current UI can compute standings from completed matches after those matches have the correct `seasonId`/`divisionLevelId`.

### `users/{uid}`

- Document id strategy: Firebase Auth uid or placeholder/import id.
- Used by roster fallback and membership generation:
  - `displayName: string`, `email: string`, `phone?: string`
  - `divisionId?: string`, `role: UserRole`, `rankingSummary?: object`
  - `createdAt: number`, `updatedAt: number`

## Root cause

The displayed issue is consistent with stale/missing data rather than a rendering bug: legacy `matches` documents can be missing the `seasonId` and/or `divisionLevelId` fields now required by the filtered Matches and Division Standings pages. Because the current pages apply Firestore `where("seasonId", "==", selectedSeasonId)` filters, Firestore does not return those legacy documents. Missing season/level membership documents can also make the admin season roster incomplete.

## One-time update tool

Script: `scripts/backfill-division-season-level.mjs`

What it does:

- Validates the requested `divisions/{divisionId}` exists.
- Validates `divisions/{divisionId}/levels/{divisionLevelId}` exists and belongs to the requested `seasonId`.
- Scans only `matches` where `divisionId == requested divisionId`.
- In default mode, updates only missing `seasonId`, `divisionLevelId`, and `matchType`; existing assignments are preserved.
- With `--overwrite-existing`, replaces existing season/level/matchType assignments for that division's matches.
- Logs every match and membership document that would change.
- Writes a JSON backup of every affected document before mutation, including `null` for newly-created memberships.
- Upserts `divisions/{divisionId}/memberships/{seasonId}_${divisionLevelId}_${userId}` for affected existing users.
- Uses batched writes in chunks and is idempotent because subsequent runs produce no changes unless source data changed.
- Does not delete data and does not rewrite ranking documents.

### Dry-run

```bash
node scripts/backfill-division-season-level.mjs \
  --division-id DIVISION_ID \
  --season-id spring-2026 \
  --division-level-id LEVEL_ID \
  --match-type singles
```

### Live update

```bash
node scripts/backfill-division-season-level.mjs \
  --division-id DIVISION_ID \
  --season-id spring-2026 \
  --division-level-id LEVEL_ID \
  --match-type singles \
  --live
```

### Optional backup path

```bash
node scripts/backfill-division-season-level.mjs \
  --division-id DIVISION_ID \
  --season-id spring-2026 \
  --division-level-id LEVEL_ID \
  --backup-file firestore-backups/my-backup.json
```

## Verification steps

1. Run the dry-run command and review every logged `matches/{matchId}` and `divisions/{divisionId}/memberships/{membershipId}` change.
2. Confirm the generated backup JSON exists and contains the pre-update data.
3. Run the live command only after the logged changes match the intended division/season/level.
4. Re-run the dry-run command. It should print `No changes required.` when the migration is idempotent.
5. Open the web app Matches page, select the same season and division level, and confirm the expected matches now appear.
6. Open Division Standings, select the same filters, and confirm standings reflect completed division matches.
7. No redeploy is required for this data-only fix unless the deployed web app/functions are older than the season/level filtering code documented here.

## Risks, assumptions, and unresolved questions

- The script assumes all legacy matches in the selected division belong to the same requested season/level unless they already have values and `--overwrite-existing` is omitted.
- If legacy data spans multiple seasons or levels, run the script separately with narrower criteria after adding custom selection logic, or use `--overwrite-existing` only with extreme care.
- Server ranking documents may remain untagged or stale. The current UI can compute filtered standings from completed matches, but a future backend ranking repair may still be desirable for exports or server-authoritative standings.
- Firestore Admin credentials are required; client security rules intentionally block direct writes to `levels`, `memberships`, and `rankings`.
