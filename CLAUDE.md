# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Full-stack tennis league scoring application (currently at version 1.0.5, built on the `v1.0.0` baseline) with real-time scoring, ranking calculations, match report workflows, division/player management, feedback submission, and native wearable support (Apple Watch + Wear OS). pnpm + Turbo monorepo with a Next.js web app, Expo mobile app, Firebase client package, shared domain package, and Firebase backend.

**Prerequisites:** Node.js 22, pnpm 9.15.5+, Firebase CLI, and EAS CLI.

`.nvmrc` is the single source of truth for the Node version: every CI workflow reads it via `setup-node`'s `node-version-file`, so bumping the major means editing that one file. The declarations that cannot read it must be moved in step — the root and `firebase/` `engines.node` fields, `apps/web/package.json`'s `engines.node` (which is what Vercel reads, since `apps/web` is its root directory), and the four `node` pins in `apps/mobile/eas.json`. They drifted once already: EAS built on 20.19.2 and Vercel on 24.x while CI ran 22.


## Versioning

- Treat `v1.0.0` as the first functional/deployable repository baseline; a Git tag named `v1.0.0` should point at the baseline commit.
- The root `package.json` and all five workspace packages currently carry version `1.0.5` and are bumped together — never let them drift apart.
- Update README, SETUP, VERSION_1_BASELINE, CHANGELOG, and package/app version markers whenever a feature changes setup, deployment, data shape, or user-visible capabilities.

## Commands

### Monorepo (run from root)

```bash
pnpm install               # Install all dependencies (--frozen-lockfile in CI)
pnpm build                 # Build all packages in dependency order
pnpm dev                   # Start all dev servers in parallel
pnpm lint                  # Lint all packages
pnpm typecheck             # Type-check all packages
pnpm test                  # Run tests (currently @tennis/shared only)
pnpm clean                 # Remove all dist/build artifacts and node_modules
pnpm test:shared            # Alias for `pnpm --filter @tennis/shared test`
pnpm check:firebase-rules    # Static guard against dangerous Firestore/Storage rules patterns
pnpm check:mobile-codegen    # Run RN codegen over every autolinked native module (catches EAS-only failures)
pnpm backfill:season-level   # One-off script: backfill division season/level data in Firestore
pnpm backfill:profiles       # One-off script: backfill missing profiles/{uid} docs
```

### Filtered (single package)

```bash
pnpm --filter @tennis/shared test          # Run shared package tests
pnpm --filter @tennis/shared build         # Build shared package only
pnpm --filter @tennis/web dev              # Next.js dev server (port 3000)
pnpm --filter @tennis/mobile start         # Expo dev server
pnpm --filter @tennis/mobile android       # Run on Android device/emulator
pnpm --filter @tennis/mobile ios           # Run on iOS simulator
pnpm --filter @tennis/mobile build:android # EAS cloud build (Android)
pnpm --filter @tennis/mobile build:ios     # EAS cloud build (iOS)
```

### Single test file

```bash
cd packages/shared && pnpm test -- --testPathPattern="scoreEngine"
```

### Firebase local emulation

```bash
cd firebase && pnpm serve                  # Firestore :8080, Auth :9099, Functions :5001, Storage :9199, UI :4000
cd firebase && pnpm test:rules              # Firestore/Storage emulator rules smoke test (used by CI)
```

### Firebase deployment

```bash
firebase deploy --only firestore,storage
pnpm --filter @tennis/firebase-functions deploy   # Functions only
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

### Branch cleanup

```bash
scripts/cleanup-branches.sh               # Dry run: lists merged local branches
scripts/cleanup-branches.sh --delete      # Deletes merged local branches
scripts/cleanup-branches.sh --remote      # Also prunes remote-tracking refs
```

## Architecture

### Monorepo layout

```text
apps/web/          # Next.js 16.3.2 web app (@tennis/web)
apps/mobile/       # Expo 57 / React Native 0.86 mobile app (@tennis/mobile)
packages/shared/   # Core business logic (scoring, ranking, types) — no framework deps (@tennis/shared)
packages/firebase-client/  # Firebase SDK wrapper with React hooks (@tennis/firebase-client)
firebase/          # Cloud Functions, Firestore rules, indexes (@tennis/firebase-functions)
```

Turbo enforces build order: `shared` → `firebase-client` → `web` / `mobile`. Always build `shared` first when making changes to it. The `typecheck` task also depends on `^build` (upstream dist must exist).

### Shared package — pure business logic

**`packages/shared/src/scoring/scoreEngine.ts`** is the scoring brain:

- `applyPoint(score: LiveScore, scorer: Player, format: MatchFormat_Config): ScoreResult` — pure function, no side effects.
- `createInitialScore(format: MatchFormat_Config): LiveScore` — creates a blank score for a given format.
- `formatScoreDisplay(score: LiveScore): string` and `formatGameScore(score: LiveScore): string` — display helpers.
- Handles 0-15-30-40-Ad-Deuce, tiebreaks (7-point win-by-2), set completion, match completion.
- When `format.finalSetTiebreak` is `false`, the deciding set skips the tiebreak at 6-6 and plays advantage-set style (win by 2 games).
- `ScoreResult` shape: `{ nextScore: LiveScore, tips: TipTrigger[], matchWinner?: Player, setCompleted?: boolean, gameCompleted?: boolean }`.
- `ScoreResult.tips` is a `TipTrigger[]` — values: `'service_change' | 'tiebreak_start' | 'deuce' | 'advantage' | 'game_point' | 'set_point' | 'match_point' | 'new_set' | 'match_complete'`.
- All live score state flows through here — never mutate `LiveScore` directly.

**`packages/shared/src/scoring/rankingEngine.ts`**:

- `computeRankings(inputs: RankingInput[], headToHeads: HeadToHead[]): PlayerRanking[]` — sorted by matches won → sets won → games won → game differential → head-to-head.
- `updateRankingWithMatchResult(existing, won, setsWon, setsLost, gamesWon, gamesLost): RankingInput` — helper to update a single player's running totals.
- `extractMatchTotals(sets): { p1Sets, p2Sets, p1Games, p2Games }` — derives set/game counts from a completed match's set array.

**`packages/shared/src/tips/tips.ts`** — tip display logic consumed by UI layers.

**`packages/shared/src/profile/profileUtils.ts`** — availability-editor logic shared by both apps' profile screens: `createDefaultAvailabilitySlot()`, `addAvailabilitySlot()`, `updateAvailabilitySlot()`, `removeAvailabilitySlot()`, `cycleAvailabilitySlotDay()`, `validateAvailabilitySlots()`, `buildAvailability()`, and `buildUserProfileUpdates()`.

**`packages/shared/src/legal/privacyPolicy.ts`** — `PRIVACY_POLICY_SECTIONS`, `PRIVACY_POLICY_INTRO`, `PRIVACY_POLICY_LAST_UPDATED`: the single source of truth for the privacy policy copy, rendered identically by the mobile screen (`apps/mobile/app/privacy-policy.tsx`) and the public web page (`apps/web/app/privacy/page.tsx`) so the two never drift apart.

**`packages/shared/src/scheduling/roundRobin.ts`**:

- `generateRoundRobinSchedule(playerIds: string[], options?: { doubleRoundRobin?: boolean }): RoundRobinMatchup[]` — pure Berger/circle-rotation round-robin generator. Order-agnostic (pre-sort `playerIds` by ranking for seeded pairings); odd counts get a synthetic bye that rotates through the pool but never produces a matchup. `doubleRoundRobin` reruns the same rotation and mirrors it with sides swapped, continuing round numbers from where leg 1 ended.

**`packages/shared/src/types/`** — all shared types; import from `@tennis/shared`, never duplicate in apps:

- `match.ts` — `TennisPoint`, `MatchFormat`, `MatchStatus` (`'proposed' | 'scheduled' | 'in_progress' | 'pending_report' | 'completed' | 'disputed' | 'cancelled'`), `MATCH_STATUS_METADATA`, `getMatchStatusMetadata`, `ServiceSide`, `Player`, `MatchFormat_Config`, `LiveScore`, `Match` (`source?: 'live' | 'manual' | 'schedule'`), `DEFAULT_FORMAT`, etc.
- `ranking.ts` — `PlayerRanking`, `HeadToHead`.
- `user.ts` — `UserRole`, `User`, `UserProfile`, `Availability`, `AvailabilitySlot`, `DayOfWeek`, `DAYS_OF_WEEK`, `DAY_LABELS`. `User` also carries `availability?: Availability`, `rankingSummary?` (a denormalized snapshot of the player's current standings written by Cloud Functions on every ranking recalc), `blockedUserIds?: string[]` (self-managed message-sender block list), and `accountDeleted?`/`deletedAt?` (set by the `deleteAccount` callable).
- `message.ts` — `Channel`, `Message`, `MatchReport`, `MessageReport`, `MessageReportReason` (`'harassment' | 'spam' | 'inappropriate' | 'other'`), `MessageReportStatus`.
- `division.ts` — the season/level/membership model as well as `Division`: `Season`, `SeasonHalf`, `SeasonStatus`, `DivisionLevel`, `DivisionSkillLevel`, `DivisionMatchType`, `DivisionMembership` (+ `DivisionMembershipRole`/`Status`/`Source`), and helpers `seasonId()`, `divisionMembershipId()`, `formatSeasonName()`, `currentSeasonForDate()`, `defaultSeasonOptions()`, `formatDivisionLevelName()`.
- `invite.ts` — `Invite`.
- `feedback.ts` — `FeedbackCategory`, `SubmitFeedbackInput`, `SubmitFeedbackResult`.
- `export.ts` — `CsvExportType`, `CsvExportRequest`, `CsvExportResult`, plus the `escapeCsvValue()`/`toCsv()` helpers shared by the `exportDivisionCsv` callable and its callers.

### Firebase client package — SDK wrapper

**`packages/firebase-client/src/config.ts`** does multi-platform Firebase initialization:

- Reads `EXPO_PUBLIC_FIREBASE_*` (mobile) or `NEXT_PUBLIC_FIREBASE_*` (web) env vars.
- Handles SSR (isBrowser/isReactNative checks) and uses AsyncStorage for React Native persistence.
- Exports singletons: `app`, `db`, `auth`, `storage`, `functions`, `getMessagingIfSupported()`.

**`packages/firebase-client/src/collections.ts`** — typed Firestore collection/document refs and query helpers (`matchesCol`, `matchDoc`, `divisionMatchesQuery`, `completedDivisionMatchesQuery`, `liveMatchesQuery`, `playerMatchesQuery`, `messageReportsCol`, `divisionMessageReportsQuery`).

**`packages/firebase-client/src/divisions.ts`** — division-related Firestore helpers.

**`packages/firebase-client/src/moderation.ts`** — UGC moderation helpers: `reportMessage()`, `useDivisionMessageReports()` (pending reports for a division leader/admin's review queue), `resolveMessageReport()` (dismiss, or remove the offending message and mark resolved), `blockUser()`/`unblockUser()` (writes to the caller's own `users/{uid}.blockedUserIds`).

**`packages/firebase-client/src/account.ts`** — `deleteAccountCallable()`, a thin wrapper around the `deleteAccount` Cloud Function callable.

**`packages/firebase-client/src/feedback.ts`** — `submitFeedback()`, the client wrapper around the `submitFeedback` Cloud Function. Apps call this; they never talk to GitHub directly.

**`packages/firebase-client/src/schedule.ts`** — `previewRoundRobinSchedule()` (runs `generateRoundRobinSchedule()` from `@tennis/shared` entirely client-side, optionally pre-sorting by ranking, for an instant preview) and `publishRoundRobinSchedule()` (`httpsCallable` wrapper for the `publishRoundRobinSchedule` Cloud Function that actually writes the generated matches).

**Typed React hooks** in `packages/firebase-client/src/hooks/`:

- `useMatch` — real-time match subscription. Also exports `proposeMatch()`, `acceptMatchProposal()`, `declineMatchProposal()` for the scheduling workflow.
- `useRankings` — division rankings subscription. Falls back to recomputing rankings directly from completed matches (via `completedDivisionMatchesQuery` + `computeRankings`) when Firestore rankings are absent or stale.
- `useMessages` — channel/message subscription.
- `useUser` — user profile subscription.
- `useDivisionOptions` — the divisions a given user belongs to (also exported as the one-shot `getUserDivisionOptions()`), used by the division switchers on both apps.

Note that `useNotifications` (FCM setup and token registration) is **not** in this package — it lives in `apps/mobile/hooks/useNotifications.ts`, and the web equivalent is `apps/web/app/FcmProvider.tsx`.

All Firestore reads go through these hooks; all writes go through operations exported from `collections.ts` and `divisions.ts`. Never call Firestore directly from apps.

### Cloud Functions — data pipeline

**`firebase/src/matches/matchFunctions.ts`**:

- `onMatchUpdate` (Firestore trigger) fires on every match write:
  - Match proposed (new doc with `status: 'proposed'`) → FCM notification to opponent.
  - Proposal accepted (`proposed` → `scheduled`) → FCM notification to proposer.
  - Proposal cancelled (`proposed` → `cancelled`) → FCM notification to proposer.
  - Report submitted → FCM notification to opponent.
  - Report confirmed → calls `recalculateRankings()` (reads all completed matches in division, recomputes via `computeRankings()` from `@tennis/shared`, writes to `divisions/{divId}/rankings/{userId}`, `headToHead/{h2hId}`, and a denormalized `rankingSummary` on `users/{userId}`).
  - Report disputed → FCM notification to division leader.
- `resolveDisputedReport` — HTTPS callable; division leaders resolve disputed reports.
- `recalculateDivisionRankings` — HTTPS callable; leaders/admins manually trigger ranking recalculation.
- Rankings are **never** incrementally updated — always recomputed from scratch.

**`firebase/src/reports/generateReport.ts`** — Firestore trigger on match completion; generates a PDF report via `pdf-lib` and stores it in Cloud Storage.

**`firebase/src/messaging/onNewMessage.ts`** — Firestore trigger on new message creation; updates channel `lastMessage` and sends FCM push notifications to channel participants.

**`firebase/src/auth/onUserCreated.ts`** — `identity.beforeUserCreated` trigger that creates a default user document in Firestore when a new user authenticates.

**`firebase/src/divisions/divisionFunctions.ts`** — division/player management callables: `createDivision`, `joinDivisionByCode`, `addPlayerToDivisionByEmail`, `addDivisionMemberPlaceholder`, `mergeDivisionPlayerRecords`, `updateDivisionPlayerEmail`, `upsertDivisionLevel`, `upsertDivisionMembership`, `backfillDivisionSeasonLevel`, `backfillMissingProfiles` (repairs `profiles/{uid}` docs missing due to a past gap in the invite/add-by-email write paths), `exportDivisionCsv`.

**`firebase/src/users/sendInvite.ts`** — invite callables: `sendInvite`, `getInvitePreview`, `acceptInvite`.

**`firebase/src/users/deleteAccount.ts`** — `deleteAccount` HTTPS callable; the signed-in user deletes their own account. Blocks the call with `failed-precondition` if the caller currently leads a division (leadership must be transferred first). Scrubs PII from `users/{uid}` and `profiles/{uid}` (display name replaced with "Deleted User", email/phone/avatar/availability/FCM tokens cleared, `accountDeleted: true` set) rather than deleting the docs outright, so historical match/ranking records that reference the uid keep resolving instead of dangling; removes the uid from their division's `playerIds`; then deletes the Firebase Auth user via the Admin SDK.

**`firebase/src/matches/scheduleFunctions.ts`** — `publishRoundRobinSchedule` HTTPS callable; division leaders/admins generate and publish a round-robin fixture list. Validates every supplied `playerId` belongs to the division (same check `recordMatchOnBehalf` uses), runs `generateRoundRobinSchedule()` from `@tennis/shared`, and bulk-writes each matchup as a `Match` doc with `status: 'scheduled'` and `source: 'schedule'` directly (not `proposed`) since the leader has scheduling authority — players can still postpone/cancel individual fixtures afterward. `clearExisting` only deletes previously-generated (`source: 'schedule'`) scheduled matches for that division/season/level, never matches players scheduled themselves.

**`firebase/src/health/health.ts`** — `health` and `readiness` HTTP endpoints for uptime/deploy checks.

### Auth flow

**Web**: Firebase email/password authentication is handled on the client in `apps/web/app/login/page.tsx`. After sign in/sign up, the page posts the Firebase ID token to `/api/auth/login`; `next-firebase-auth-edge` middleware intercepts that route and sets the `tennis-auth` httpOnly session cookie (max age 12 days). Unauthenticated protected requests redirect to `/login`; logout is handled by `/api/auth/logout`. `middleware.ts`'s `matcher` excludes `login`, `invite/`, `privacy`, `robots.txt`, `sitemap.xml`, `auth/`, and a handful of `api/*` routes (`api/health`, `api/readiness`, `api/functions/`, `api/auth/logout`) from the auth check — any future public-facing page or crawler-facing file must be added to that exclusion list or it will silently redirect signed-out visitors (and every crawler) to `/login`.

**Mobile**: Firebase email/password authentication is handled in `apps/mobile/app/(auth)/login.tsx`. `AuthGuard` in `apps/mobile/app/_layout.tsx` enforces: auth → division selection → tutorial → main tabs. State lives in Zustand (`apps/mobile/store/appStore.ts`): `{ user: User | null, divisionId: string | null }`.

### Web routes (`apps/web/app/`)

```text
page.tsx               # Root redirect
layout.tsx             # Root layout
login/                 # Login page
dashboard/             # Main dashboard
matches/               # Matches list + [id]/ match detail (includes Pending/Awaiting/Upcoming scheduling sections)
messages/              # Messaging (includes per-message report/block actions)
profile/               # User profile (includes availability editor, blocked users list, account deletion)
admin/                 # Admin panel (includes round-robin scheduler and reported-message review queue)
feedback/              # Feedback submission form
invite/accept/         # Invite code acceptance
onboarding/tutorial/   # Onboarding tutorial
onboarding/division/   # Division creation / join-by-code onboarding
privacy/                # Public privacy policy page (excluded from the auth middleware matcher — must render for signed-out visitors)
api/auth/login/        # Session-cookie login endpoint intercepted by auth middleware (route.ts fallback returns 401)
api/auth/logout/       # Logout handler (route.ts)
api/health/            # Health check endpoint
api/readiness/         # Readiness check endpoint
api/functions/add-division-member/  # Server-side proxy (Admin SDK auth) to the division-member-placeholder callable
api/firebase-messaging-sw/          # Firebase Cloud Messaging service worker route
robots.ts              # Generated /robots.txt
sitemap.ts             # Generated /sitemap.xml
FcmProvider.tsx        # Web FCM setup/token registration (mounted from the root layout)
shared/                # Cross-page UI: AppNav, StatusBadge, ViewModeToggle, viewMode.tsx
```

### Mobile routes (`apps/mobile/app/`)

Uses Expo Router with file-based group routing:

```text
(auth)/          # Auth group (login/signup screens)
(onboarding)/    # Onboarding group
(tabs)/          # Main tabbed navigation (matches list includes scheduling; profile includes availability editor and a Privacy Policy link; admin includes the round-robin scheduler entry point)
match/           # Match detail screens
round-robin-scheduler.tsx  # Admin-only: generate/preview/publish a round-robin fixture list for a season + division level
privacy-policy.tsx  # Static privacy policy screen, content shared with the web page via @tennis/shared
```

### Match scheduling and report workflow

Matches progress: `proposed` → `scheduled` → `in_progress` → `pending_report` → `completed` (or `disputed`; cancelled proposals/matches use `cancelled`):

1. Proposer calls `proposeMatch()` — creates a match with `status: 'proposed'`, sends FCM to opponent.
2. Opponent calls `acceptMatchProposal()` (→ `scheduled`) or `declineMatchProposal()` (→ `cancelled`). Proposer can also withdraw via `declineMatchProposal()`.
3. Players set weekly preferred play times (`Availability`) on their profile pages; this is advisory and shown to opponents when proposing.
4. Once started, winner calls `submitMatchReport()` — sets status to `pending_report`, sends FCM to opponent.
5. Opponent calls `confirmMatchReport()` or `disputeMatchReport()`.
6. Confirmed → `onMatchUpdate` trigger recalculates rankings and generates PDF report.
7. Disputed → division leader resolves via `resolveDisputedReport()` callable.

### Round-robin match scheduling

Division leaders/admins generate a full season's fixtures from the Admin tab's "Round-Robin Scheduler" (mobile: `apps/mobile/app/round-robin-scheduler.tsx`; web: the "Round-Robin Scheduler" card on `/admin`): pick a season + division level, select players (defaults to that season/level's active `DivisionMembership` roster), configure single/double round robin, round interval, start date, and optional ranking-based seeding, then "Generate Preview" (client-side, via `previewRoundRobinSchedule()`) before "Publish Schedule" (server-side, via `publishRoundRobinSchedule()`) actually creates the matches. Preview and publish share the same `generateRoundRobinSchedule()` algorithm from `@tennis/shared`, so the preview is guaranteed to match what gets created.

### Account deletion

Users delete their own account from Profile (web `/profile`, mobile Profile tab). The client re-authenticates with the user's password (`reauthenticateWithCredential`) as a UX safeguard, then calls the `deleteAccount` callable, which does the actual PII scrub + Firebase Auth deletion server-side (see `firebase/src/users/deleteAccount.ts` above). Division leaders must transfer leadership before they can delete their account. On web, after the callable succeeds the client also signs out of Firebase Auth and posts to `/api/auth/logout` to clear the session cookie before redirecting to `/login`.

### Message reporting & blocking

Any channel participant can report a message (reason: `harassment | spam | inappropriate | other`, optional note) via `reportMessage()`, which writes a `messageReports/{reportId}` doc scoped to the reporter's `divisionId`. Division leaders/admins see pending reports for their division via `useDivisionMessageReports()` (mobile: Admin tab; web: the "Reported Messages" card on `/admin`) and resolve them with `resolveMessageReport()`, either dismissing the report or removing the offending message (Firestore rules let leaders/admins delete any message in their division's channel; DM participants can already delete their own conversation's messages). Independently, any user can block another user's messages via `blockUser()`/`unblockUser()`, which write to the caller's own `users/{uid}.blockedUserIds` — this is a client-side filter (blocked senders' messages are hidden from the message list and excluded from DM search results on both web and mobile) rather than a server-enforced send restriction. Both apps' Profile screens list currently-blocked users with an unblock action.

### Wearable support

**`apps/mobile/modules/apple-watch/`** — Expo native module (TypeScript + Swift):

- `sendScoreToWatch(score: LiveScore): void`
- `isAppleWatchConnected(): boolean`
- `addWatchScoreInputListener(handler)` / `addWatchConnectedListener(handler)`

**`apps/mobile/modules/wear-os/`** — Expo native module (TypeScript + Kotlin):

- `sendScoreToWear(score: LiveScore): Promise<void>`
- `isWearOsAvailable(): boolean`
- `addWearScoreInputListener(handler)`

Changes to the `LiveScore` type shape **must** be reflected in both native modules.

## Key Conventions

### TypeScript

- TypeScript 6.0 strict mode across all packages (`strict: true`, `ignoreDeprecations: "6.0"`).
- `moduleResolution: bundler`, `module: ESNext`, `target: ES2020`.
- Shared types live in `packages/shared/src/types/` — import from `@tennis/shared`, never duplicate.
- `firebase-client` exports are the only sanctioned way to read/write Firestore from apps.

### Build tooling

Both `packages/shared` and `packages/firebase-client` use custom `scripts/tsup-build.mjs` wrappers that resolve the `tsup` CLI from either the package's own `node_modules` or the workspace root. Similarly, `apps/web` uses `scripts/next-build.mjs` to locate the Next.js CLI robustly across hoisted/non-hoisted Vercel install layouts. Do not replace these with bare `tsup` or `next build` calls in `package.json` scripts.

### Environment variables

```text
# Web (NEXT_PUBLIC_*) / Mobile (EXPO_PUBLIC_*) — same Firebase project
NEXT_PUBLIC_FIREBASE_API_KEY / EXPO_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN / EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID / EXPO_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET / EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID / EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID / EXPO_PUBLIC_FIREBASE_APP_ID

# Web session cookie / Next.js
NEXTAUTH_SECRET, NEXTAUTH_URL

# Public site origin for robots.txt / sitemap.xml / page metadata (build-time inlined)
NEXT_PUBLIC_SITE_URL

# Cloud Functions only
FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY
GITHUB_OWNER, GITHUB_REPO, GITHUB_FEEDBACK_LABELS

# Firebase Functions secret storage only
GITHUB_TOKEN
```

GitHub credentials must never use `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`; web and mobile feedback code calls Firebase Functions only, and `firebase/src/feedback/submitFeedback.ts` is the single GitHub API integration point.

See `SETUP.md`, `.env.example`, and `apps/mobile/.env.example` for the full setup list. Note that Version 1.0.0 uses Firebase email/password auth; legacy PingID/OIDC placeholders in older local env files should not be treated as active app requirements unless that auth flow is intentionally reintroduced.

### Testing

- Tests live in `packages/shared/src/**/__tests__/` following `*.test.ts` naming.
- Test files cover the score engine, ranking engine, round-robin scheduler, profile utilities, division/season helpers, and match status metadata.
- Only `@tennis/shared` has tests. CI runs `pnpm --filter @tennis/shared test` on pushes and pull requests targeting `main` or `claude/**`, and only when the `shared_or_root` path filter matches.
- Test runner: Jest 29 + ts-jest. Build tool: tsup 8.
- Add tests when modifying scoring or ranking logic — the score engine is extensively tested.

### CI

Defined in `.github/workflows/ci.yml`. Triggers: push **and** pull request to `main`/`claude/**`. Node 22, pnpm 9.15.5. A `changes` job path-filters which downstream jobs run. **Every filter also includes `.github/workflows/ci.yml` itself** — otherwise a PR editing only `ci.yml` would land a change to a filtered job with that very job skipped. Keep that entry in any new filter you add.

- `lint_typecheck` (always runs): install (`--frozen-lockfile`) → typecheck → lint → **build**. This is the unconditional gate. The build step runs last (it is the most expensive) and exists because only a real bundler catches a bad module path that `typecheck` waves through behind an `as any`.
- `shared_tests` (filter `shared_or_root`: `packages/shared/**`, root `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`/`tsconfig.base.json`): `pnpm --filter @tennis/shared test`.
- `firebase_rules_tests` (filter `firebase`: `firebase/**` or `packages/shared/**`): sets up Temurin JDK 21 (firebase-tools 15 refuses to start the emulators on anything older), then `pnpm check:firebase-rules` → `pnpm --filter @tennis/firebase-functions test:rules` → `pnpm audit --audit-level=high`. The rules checks deliberately run **before** the audit, so a failing audit can never suppress the rules signal. The audit step is `continue-on-error` only so the `google/osv-scanner-action` fallback step casts the deciding vote; the pair together is still blocking. Suppressed advisories with justifications live in `osv-scanner.toml`.
- `mobile_bundle` (filter `mobile`: `apps/mobile/**`, `packages/**`, root manifests): builds the workspace deps, runs `pnpm check:mobile-codegen`, bundles for release with `expo export:embed`, then compiles that bundle with the exact pinned `hermesc` the Android Gradle build uses. Nothing else exercises Metro or Hermes, and each stage catches a distinct class of EAS-only failure.
- `mobile_native` (same `mobile` filter): the only job that compiles C++. Sets up JDK 17 and NDK `27.1.12297006` (pinned by react-native 0.86.2's version catalog), then runs `./gradlew :app:assembleRelease` for `arm64-v8a` only — the failures it catches (C++ API and codegen mismatches) are architecture-independent, and the APK is unsigned because the job exists to prove the code compiles, not to ship anything.

The mobile jobs use deliberate `ci-placeholder` values for the `EXPO_PUBLIC_FIREBASE_*` vars, not secrets: `app.config.js` hard-fails when `CI=true` and they are unset, and real secrets would make both jobs unusable on fork and Dependabot pull requests. Do not replace them with repository secrets.

Other workflows run independently of `ci.yml`: `.github/workflows/codeql.yml` (CodeQL JavaScript/TypeScript analysis on push/PR to `main` and a weekly schedule) and `.github/workflows/firebase-safety-guard.yml` (blocks `allow read, write: if true` patterns landing in `firebase/**/*.rules` on PRs touching `firebase/**`, plus its own rules smoke test).

`.github/workflows/eas-build.yml` — manual `workflow_dispatch` trigger for Android mobile or Wear OS preview APK builds via EAS. EAS profiles pre-build `@tennis/shared` and `@tennis/firebase-client`. Firebase env vars come from GitHub secrets.

`.github/workflows/deploy-firebase-function.yml` — targeted Firebase Functions deploy workflow for selected Functions. It builds the targeted bundle, validates GitHub feedback configuration and `GITHUB_TOKEN` access, writes Firebase params, and deploys selected Functions.

`.github/workflows/andorid-ai-agent.yml` — a Python-based review/apply agent (the filename is misspelled as committed; match it exactly when referencing the workflow) that runs on push to any branch and via `workflow_dispatch` with a `review`/`apply` mode input. It holds `contents: write`; its helper scripts live in `.github/scripts/`.

### Dependency constraints

`.github/dependabot.yml` and the root `pnpm.overrides` encode constraints that were each learned from a broken build. Read the comments there before bumping anything in this set:

- **`react-native` is pinned by the Expo SDK.** Dependabot ignores its minor/patch bumps; it must be moved *with* every Expo SDK upgrade to the version in `expo/bundledNativeModules.json`. Leaving it behind on 0.83.1 under SDK 57 (which wants 0.86.2) broke the Android native build.
- **TypeScript majors are manual.** TypeScript 7 is the native (tsgo) port and drops the JS compiler API that `tsup --dts`, `ts-jest`, and typescript-eslint all need.
- **`react-native-reanimated` minors/majors are ignored**, because its version is dictated by the `react-native-worklets` peer range `expo-modules-core` accepts, not by what reanimated publishes.
- **The Babel toolchain stays on 7.** `babel-preset-expo` asserts `^7.0.0-0`, so `@babel/core` 8 fails the Metro transform outright. The `^7.29.6` override pins it; a major bump defeats the override rather than being blocked by it.
- Expo-constrained packages are grouped separately (`expo-toolchain`) from everything else (`monorepo-npm`) so one blocked native package cannot hold back unrelated updates.
- **Web React is overridden to 18.2.0.** `apps/web/package.json` declares `react`/`react-dom` 19.2.8, but the root `@tennis/web>react` / `@tennis/web>react-dom` overrides force 18.2.0, which is what actually installs. Change the override, not just the app manifest, or the two will keep disagreeing.
- `pnpm.neverBuiltDependencies` skips install scripts for `react-native-screens`, `react-native-reanimated`, and `react-native-gesture-handler`.
