# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Full-stack tennis league scoring application at the Version 1.0.0 baseline with real-time scoring, ranking calculations, match report workflows, division/player management, feedback submission, and native wearable support (Apple Watch + Wear OS). pnpm + Turbo monorepo with a Next.js web app, Expo mobile app, Firebase client package, shared domain package, and Firebase backend.

**Prerequisites:** Node.js 22 (matches CI, the root workspace `engines` field, and Firebase Functions runtime/deploy parity), pnpm 9.15.5+, Firebase CLI, and EAS CLI.


## Version 1.0.0 baseline

- Treat `v1.0.0` as the first functional/deployable repository baseline.
- Update README, SETUP, VERSION_1_BASELINE, and package/app version markers whenever a future feature changes setup, deployment, data shape, or user-visible capabilities.
- A Git tag named `v1.0.0` should point at the baseline commit.

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
apps/web/          # Next.js 14.2.0 web app (@tennis/web)
apps/mobile/       # Expo 51 / React Native 0.74 mobile app (@tennis/mobile)
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

**`packages/shared/src/types/`** — all shared types; import from `@tennis/shared`, never duplicate in apps:

- `match.ts` — `TennisPoint`, `MatchFormat`, `MatchStatus` (`'proposed' | 'scheduled' | 'in_progress' | 'pending_report' | 'completed' | 'disputed' | 'cancelled'`), `MATCH_STATUS_METADATA`, `getMatchStatusMetadata`, `ServiceSide`, `Player`, `MatchFormat_Config`, `LiveScore`, `Match`, `DEFAULT_FORMAT`, etc.
- `ranking.ts` — `PlayerRanking`, `HeadToHead`.
- `user.ts` — `UserRole`, `User`, `UserProfile`, `Availability`, `AvailabilitySlot`, `DayOfWeek`, `DAYS_OF_WEEK`, `DAY_LABELS`. `User` also carries `availability?: Availability` and `rankingSummary?` (a denormalized snapshot of the player's current standings written by Cloud Functions on every ranking recalc).
- `message.ts` — `Channel`, `Message`, `MatchReport`.
- `division.ts` — `Division`.

### Firebase client package — SDK wrapper

**`packages/firebase-client/src/config.ts`** does multi-platform Firebase initialization:

- Reads `EXPO_PUBLIC_FIREBASE_*` (mobile) or `NEXT_PUBLIC_FIREBASE_*` (web) env vars.
- Handles SSR (isBrowser/isReactNative checks) and uses AsyncStorage for React Native persistence.
- Exports singletons: `app`, `db`, `auth`, `storage`, `functions`, `getMessagingIfSupported()`.

**`packages/firebase-client/src/collections.ts`** — typed Firestore collection/document refs and query helpers (`matchesCol`, `matchDoc`, `divisionMatchesQuery`, `completedDivisionMatchesQuery`, `liveMatchesQuery`, `playerMatchesQuery`).

**`packages/firebase-client/src/divisions.ts`** — division-related Firestore helpers.

**Typed React hooks** in `packages/firebase-client/src/hooks/`:

- `useMatch` — real-time match subscription. Also exports `proposeMatch()`, `acceptMatchProposal()`, `declineMatchProposal()` for the scheduling workflow.
- `useRankings` — division rankings subscription. Falls back to recomputing rankings directly from completed matches (via `completedDivisionMatchesQuery` + `computeRankings`) when Firestore rankings are absent or stale.
- `useMessages` — channel/message subscription.
- `useUser` — user profile subscription.
- `useNotifications` — Firebase Cloud Messaging setup and FCM token registration.

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

**`firebase/src/health/health.ts`** — `health` and `readiness` HTTP endpoints for uptime/deploy checks.

### Auth flow

**Web**: Firebase email/password authentication is handled on the client in `apps/web/app/login/page.tsx`. After sign in/sign up, the page posts the Firebase ID token to `/api/auth/login`; `next-firebase-auth-edge` middleware intercepts that route and sets the `tennis-auth` httpOnly session cookie (max age 12 days). Unauthenticated protected requests redirect to `/login`; logout is handled by `/api/auth/logout`.

**Mobile**: Firebase email/password authentication is handled in `apps/mobile/app/(auth)/login.tsx`. `AuthGuard` in `apps/mobile/app/_layout.tsx` enforces: auth → division selection → tutorial → main tabs. State lives in Zustand (`apps/mobile/store/appStore.ts`): `{ user: User | null, divisionId: string | null }`.

### Web routes (`apps/web/app/`)

```text
page.tsx               # Root redirect
layout.tsx             # Root layout
login/                 # Login page
dashboard/             # Main dashboard
matches/               # Matches list + [id]/ match detail (includes Pending/Awaiting/Upcoming scheduling sections)
messages/              # Messaging
profile/               # User profile (includes availability editor)
admin/                 # Admin panel
feedback/              # Feedback submission form
invite/accept/         # Invite code acceptance
onboarding/tutorial/   # Onboarding tutorial
onboarding/division/   # Division creation / join-by-code onboarding
api/auth/login/        # Session-cookie login endpoint intercepted by auth middleware (route.ts fallback returns 401)
api/auth/logout/       # Logout handler (route.ts)
api/health/            # Health check endpoint
api/readiness/         # Readiness check endpoint
api/functions/add-division-member/  # Server-side proxy (Admin SDK auth) to the division-member-placeholder callable
api/firebase-messaging-sw/          # Firebase Cloud Messaging service worker route
```

### Mobile routes (`apps/mobile/app/`)

Uses Expo Router with file-based group routing:

```text
(auth)/          # Auth group (login/signup screens)
(onboarding)/    # Onboarding group
(tabs)/          # Main tabbed navigation (matches list includes scheduling; profile includes availability editor)
match/           # Match detail screens
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
- Test files cover score engine, ranking engine, profile utilities, and match status metadata.
- Only `@tennis/shared` has tests. CI runs `pnpm --filter @tennis/shared test` on pushes to `main` or `claude/**` branches.
- Test runner: Jest 29 + ts-jest. Build tool: tsup 8.
- Add tests when modifying scoring or ranking logic — the score engine is extensively tested.

### CI

Defined in `.github/workflows/ci.yml`. Triggers: push to `main`/`claude/**`, PRs to `main`. Node 22, pnpm 9.15.5. A `changes` job path-filters which downstream jobs run:

- `lint_typecheck` (always runs): install (`--frozen-lockfile`) → typecheck → lint → build. This is the unconditional gate.
- `shared_tests` (only if `packages/shared/**`, root `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`/`tsconfig.base.json` changed): `pnpm --filter @tennis/shared test`.
- `firebase_rules_tests` (only if `firebase/**` or `packages/shared/**` changed): Firestore/Storage emulator rules smoke test (`pnpm check:firebase-rules`, `pnpm --filter @tennis/firebase-functions test:rules`), then `pnpm audit --audit-level=high` — non-blocking (`continue-on-error: true`), falling back to a `google/osv-scanner-action` step that casts the actual deciding vote when the audit step fails.

Two more workflows run independently of `ci.yml`: `.github/workflows/codeql.yml` (CodeQL JavaScript/TypeScript analysis on push/PR to `main` and a weekly schedule) and `.github/workflows/firebase-safety-guard.yml` (blocks `allow read, write: if true` patterns landing in `firebase/**/*.rules` on PRs touching `firebase/**`, plus its own rules smoke test).

`.github/workflows/eas-build.yml` — manual `workflow_dispatch` trigger for Android mobile or Wear OS preview APK builds via EAS. EAS profiles pre-build `@tennis/shared` and `@tennis/firebase-client`. Firebase env vars come from GitHub secrets.

`.github/workflows/deploy-firebase-function.yml` — targeted Firebase Functions deploy workflow for selected Functions. It builds the targeted bundle, validates GitHub feedback configuration and `GITHUB_TOKEN` access, writes Firebase params, and deploys selected Functions.
