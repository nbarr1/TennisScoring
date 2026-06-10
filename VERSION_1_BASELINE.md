# Version 1 Stable Baseline

**Current stable baseline:** `1.0.1`  
**Status:** stable and releasable  
**Last reviewed:** 2026-06-10

## Release identity

The repository is treated as the stable Version 1 baseline for maintenance and future feature work. The root workspace, web app, mobile app, shared package, and Firebase client package are versioned `1.0.1`. The Firebase Functions package is an internal deploy package that remains versioned `1.0.0`.

## Baseline scope

The stable baseline includes:

- Web app routes for login, dashboard, matches, match detail, messages, feedback, profile, admin, invite acceptance, tutorial onboarding, and division onboarding.
- Mobile app routes for login, tutorial onboarding, division onboarding, tabs for dashboard/matches/messages/profile/admin, feedback, and match detail/live scoring.
- Shared scoring, ranking, profile, type, status metadata, and tips utilities.
- Firebase Functions for match workflows, scoring, ranking recalculation/repair, reports, messaging notifications, user onboarding, invites, division management, CSV export, feedback, health, and readiness.
- Targeted Firebase Functions deploy support for the functions exported from `firebase/src/targetedDeployIndex.ts`.
- Firestore and Storage rules plus emulator smoke tests.
- Wear OS and Apple Watch companion code that should stay aligned with shared live-score data shapes.

## Release gates

Before a release branch or production deploy, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

Additional platform gates:

```bash
pnpm --filter @tennis/web build
pnpm --filter @tennis/mobile typecheck
pnpm --filter @tennis/mobile build:android
pnpm --filter @tennis/mobile build:ios
```

The EAS build commands require configured Expo, Android, Apple, and Firebase credentials.

## Maintenance expectations

- Keep shared data contracts synchronized across web, mobile, Functions, rules, and wearable code.
- Keep feedback GitHub credentials only in Firebase Secret Manager.
- Run Firebase rules smoke tests for rules or backend authorization changes.
- Update this file, `README.md`, `SETUP.md`, and the relevant `docs/` file whenever release gates, versions, deploy targets, or required environment variables change.
