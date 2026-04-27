# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Full-stack tennis league scoring application with real-time scoring, ranking calculations, match report workflows, and native wearable support (Apple Watch + Wear OS). pnpm + Turbo monorepo with a Next.js web app, Expo mobile app, and Firebase backend.

## Commands

### Monorepo (run from root)

```bash
pnpm install               # Install all dependencies
pnpm build                 # Build all packages in dependency order
pnpm dev                   # Start all dev servers in parallel
pnpm lint                  # Lint all packages
pnpm typecheck             # Type-check all packages
pnpm test                  # Run tests (currently @tennis/shared only)
pnpm clean                 # Remove all dist/build artifacts and node_modules
```

### Filtered (single package)

```bash
pnpm --filter @tennis/shared test          # Run shared package tests
pnpm --filter @tennis/shared build         # Build shared package only
pnpm --filter @tennis/web dev              # Next.js dev server (port 3000)
pnpm --filter @tennis/mobile start         # Expo dev server
```

### Single test file

```bash
cd packages/shared && pnpm test -- --testPathPattern="scoreEngine"
```

### Firebase local emulation

```bash
cd firebase && firebase emulators:start    # Firestore :8080, Auth :9099, Functions :5001, Storage :9199, UI :4000
```

### Firebase deployment

```bash
firebase deploy --only functions,firestore,storage,hosting
```

## Architecture

### Monorepo layout

```
apps/web/          # Next.js 14 web app
apps/mobile/       # Expo 51 / React Native 0.74 mobile app
packages/shared/   # Core business logic (scoring, ranking, types) — no framework deps
packages/firebase-client/  # Firebase SDK wrapper with React hooks
firebase/          # Cloud Functions, Firestore rules, indexes
```

Turbo enforces build order: `shared` → `firebase-client` → `web` / `mobile`. Always build `shared` first when making changes to it.

### Shared package — pure business logic

`packages/shared/src/scoring/scoreEngine.ts` is the scoring brain:
- `applyPoint(score, servingPlayer)` → `ScoreResult` — pure function, no side effects.
- Handles 0-15-30-40-Ad-Deuce, tiebreaks (7-point win-by-2), set completion, match completion.
- Returns `tips` array (`TipTrigger` values like `"deuce"`, `"match_point"`, `"service_change"`) consumed by the tips system and UI.
- All live score state flows through here — never mutate `LiveScore` directly.

`packages/shared/src/ranking/rankingEngine.ts`:
- `computeRankings(matches, players)` → `PlayerRanking[]` sorted by: matches won → sets won → games won → game differential → head-to-head.

### Firebase client package — SDK wrapper

`packages/firebase-client/src/config.ts` does multi-platform Firebase initialization:
- Reads `EXPO_PUBLIC_*` (mobile) or `NEXT_PUBLIC_*` (web) env vars from the same underlying Firebase project.
- Exports singletons: `app`, `db`, `auth`, `storage`, `functions`, `getMessagingIfSupported()`.

All Firestore reads are done through typed hooks (`useMatch`, `useRankings`, `useMessages`, `useUser`). All writes go through the operations in `packages/firebase-client/src/match/` (e.g., `scorePoint`, `undoLastPoint`, `submitMatchReport`).

### Cloud Functions — ranking pipeline

`firebase/src/matchFunctions.ts` contains the critical data pipeline:
- `onMatchUpdate` (Firestore trigger) fires on every match write:
  - Report submitted → FCM notification to opponent.
  - Report confirmed → calls `recalculateRankings()`.
  - Report disputed → FCM notification to division leader.
- `recalculateRankings()` re-reads **all** completed matches in a division, re-computes via `computeRankings()` (imported from `@tennis/shared`), and writes to `divisions/{divId}/rankings/{userId}` and `headToHead/{h2hId}`.
- Rankings are never incrementally updated — always recomputed from scratch.

### Auth flow

**Web**: `next-firebase-auth-edge` middleware in `apps/web/middleware.ts` validates the Firebase session cookie on every request. Unauthenticated requests redirect to `/login`. PingID OIDC is the identity provider; the callback is handled at `/api/auth/login`.

**Mobile**: `AuthGuard` in `apps/mobile/app/_layout.tsx` enforces a three-step flow: auth → division selection → tutorial → main tabs. Expo Auth Session handles the PingID OIDC flow. State (user, selected division) lives in Zustand (`apps/mobile/src/store/appStore.ts`).

### Match report workflow

Matches progress through statuses: `live` → `pending_report` → `confirmed` (or `disputed`). The reporting flow:
1. Winner calls `submitMatchReport()` — sets status to `pending_report`, sends FCM to opponent.
2. Opponent calls `confirmMatchReport()` or `disputeMatchReport()`.
3. Confirmed → `onMatchUpdate` trigger recalculates rankings.
4. Disputed → division leader resolves via `resolveDisputedReport()` callable.

### Wearable support

`apps/mobile/modules/apple-watch/` and `apps/mobile/modules/wear-os/` are Expo native modules. They expose a bidirectional bridge so live score state can be sent to and controlled from Apple Watch / Wear OS. Changes to `LiveScore` shape must be reflected in these native modules.

## Key Conventions

### TypeScript

- TypeScript 6.0 strict mode across all packages.
- Shared types live in `packages/shared/src/types/` — import from `@tennis/shared`, never duplicate types in apps.
- `firebase-client` package exports are the only sanctioned way to read/write Firestore from apps.

### Environment variables

- Web uses `NEXT_PUBLIC_FIREBASE_*` prefix; mobile uses `EXPO_PUBLIC_FIREBASE_*` prefix — both point to the same Firebase project.
- Firebase Admin SDK vars (`FIREBASE_ADMIN_*`) are set only in the Cloud Functions environment.
- See `.env.example` at the root for the full variable list.

### Testing

- Tests live in `packages/shared/src/**/__tests__/` and follow the pattern `*.test.ts`.
- Only `@tennis/shared` has tests. CI runs `pnpm --filter @tennis/shared test` on pushes to `main` or `claude/**` branches.
- The score engine is extensively tested; add tests there when modifying scoring logic.

### CI

Defined in `.github/workflows/ci.yml`. Pipeline: install → typecheck → lint → test. All three checks must pass before merging to `main`.
