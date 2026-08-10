# TennisScoring Version 1.0.0 Baseline

**Baseline date:** 2026-05-13  
**Baseline label:** `v1.0.0` / first functional deployable repository  
**Purpose:** capture the current repository condition before the next phase of mobile and web application feature work.

---

## Update — 2026-08-10 (`v1.0.1`)

Package/app version markers moved to `1.0.1` without this document being updated at the time; `v1.0.0` was also never tagged in git. The version markers are corrected now and the sections below are current as of this update, but **neither `v1.0.0` nor `v1.0.1` has an actual git tag yet** — no commit has been identified as the `v1.0.0` point, so none should be invented here. Tagging is a pending follow-up, not a completed fact. The original `v1.0.0` content is left below as historical record rather than rewritten, except where noted.

Changes since the `v1.0.0` snapshot that affect setup, deployment, or data shape:

- **New Cloud Functions**: `backfillMissingProfiles` (repairs `profiles/{uid}` docs missing due to a gap in the invite/add-by-email write paths, now fixed at the source), `health`, `readiness`.
- **Firestore rules**: `profiles/{userId}` now allows a signed-in user to self-write their own `displayName`/`avatarUrl`/`tutorialDone`/`id`/`updatedAt` (previously admin-only, which silently broke every non-admin profile save on both web and mobile since `updateUserProfile()` always batches a `profiles/{uid}` write). `role` and `divisionId` remain locked to admin/Cloud Functions on this path.
- **Known deferred limitation**: `onUserCreated` (the `identity.beforeUserCreated` blocking function) cannot be redeployed — this Firebase project is not on Google Cloud Identity Platform (GCIP), which blocking functions require. The function keeps running its previously-deployed code; self-registration is unaffected today. **Do not enable GCIP without first setting a real `ALLOWED_EMAIL_DOMAIN` value** in `firebase/.env.tennisscoring-40165` — the current (unreleased) version of this function fails closed and would reject all self-registration if it ever goes live with that value blank.
- **Dependency audit**: the CI OSV gate was failing on 50 known vulnerabilities in transitive dev/build-tool packages (none shipped to end users). 48 fixed via `pnpm.overrides` in the root `package.json`; the remaining 2 (`image-size`, via react-native's metro bundler, no upstream fix exists) are suppressed with justification in `osv-scanner.toml`.
- **Framework upgrades**: Next.js 14 → 16, React 18 → 19, Expo 51 → 55, React Native 0.74 → 0.83 (the "Deployable Components" section below has been updated in place to describe the current versions rather than what shipped at the `v1.0.0` snapshot).
- **Version marker gap fixed**: `firebase/package.json` still read `1.0.0` after every other manifest moved to `1.0.1`; it is now `1.0.1` too.

---

## Summary

Version 1.0.0 is the first documented, functional, deployable baseline for TennisScoring. The repository contains working web, mobile, Firebase backend, shared-domain, Firebase-client, and wearable companion code. This baseline is intended to be the rollback/reference point for future features.

---

## Version Markers

The following manifests identify this baseline as `1.0.0`:

- Root workspace: `package.json`
- Web app: `apps/web/package.json`
- Mobile app: `apps/mobile/package.json`
- Shared package: `packages/shared/package.json`
- Firebase client package: `packages/firebase-client/package.json`
- Firebase Functions package: `firebase/package.json`
- Expo app metadata: `apps/mobile/app.json` (`version: 1.0.0`, Android `versionCode: 1`, iOS `buildNumber: 1`)

A Git tag named `v1.0.0` should point to the commit containing this baseline, and a `v1.0.1` tag should point to the commit containing the 2026-08-10 update above — **neither tag exists in the repository yet** (`git tag -l` is empty as of this update). Cutting both tags is an open follow-up.

---

## Deployable Components

### Web application

- Location: `apps/web`
- Framework: Next.js App Router with React 19
- Authentication: Firebase email/password client auth with `next-firebase-auth-edge` session-cookie middleware
- Major routes:
  - `/login`
  - `/dashboard`
  - `/matches`
  - `/matches/[id]`
  - `/messages`
  - `/profile`
  - `/admin`
  - `/feedback`
  - `/invite/accept`
  - `/onboarding/tutorial`

### Mobile application

- Location: `apps/mobile`
- Framework: Expo 55 / React Native 0.83 with Expo Router
- Authentication: Firebase email/password sign in and sign up
- Major route groups:
  - `(auth)` for login/signup
  - `(onboarding)` for division selection and tutorial
  - `(tabs)` for dashboard, matches, messages, profile, and admin
  - `match/[id]` for setup, live scoring, reporting, guest linking, and score correction
  - `feedback` for user feedback submission

### Firebase backend

- Location: `firebase`
- Includes Cloud Functions, Firestore rules/indexes, Storage rules, and emulator configuration
- Major callable/event functions include:
  - match scoring/reporting/ranking functions: `scoreMatchPoint`, `recordHistoricMatch`, `recordMatchOnBehalf`, `resolveDisputedReport`, `recalculateDivisionRankings`, `repairAllDivisionRankings`, `onMatchUpdate`
  - division/player management functions: `createDivision`, `joinDivisionByCode`, `addPlayerToDivisionByEmail`, `addDivisionMemberPlaceholder`, `mergeDivisionPlayerRecords`, `updateDivisionPlayerEmail`, `upsertDivisionLevel`, `upsertDivisionMembership`, `backfillDivisionSeasonLevel`, `backfillMissingProfiles`, `exportDivisionCsv`
  - invite functions: `sendInvite`, `getInvitePreview`, `acceptInvite`
  - messaging and notification trigger: `onNewMessage`
  - feedback integration: `submitFeedback`
  - auth trigger: `onUserCreated` (see the 2026-08-10 update above for a known deployment limitation)
  - operational: `health`, `readiness`

### Shared package

- Location: `packages/shared`
- Provides reusable TypeScript types, scoring engine, ranking engine, profile utilities, tips, and tests.
- Should remain the first destination for logic shared by web, mobile, Firebase Functions, or future apps.

### Firebase client package

- Location: `packages/firebase-client`
- Provides Firebase initialization, typed collection helpers, query builders, React hooks, and Cloud Function wrappers for web/mobile consumers.

### Wearable code

- Wear OS app/module code exists under `apps/mobile/android/wear`, `apps/mobile/android/app/src/main/java/com/tennisleague/app/wear`, and `apps/mobile/modules/wear-os`.
- Apple Watch Swift/module code exists under `apps/mobile/ios/TennisScoringWatch` and `apps/mobile/modules/apple-watch`.
- Wearable code should be kept in sync with shared `LiveScore` shape changes.

---

## Core v1 Workflows

- Email/password sign up and sign in.
- Auth-gated onboarding into division selection/tutorial.
- Create/join divisions and manage division rosters.
- Create proposed, scheduled, live, historic, guest, and leader-entered matches.
- Score live matches with shared tennis scoring logic.
- Track optional advanced match stats.
- Submit, confirm, dispute, and resolve match reports.
- Generate report artifacts and recalculate rankings from completed matches.
- Send and receive in-app messages.
- Send web/mobile feedback through a Firebase Function backed by a GitHub token stored only in Secret Manager.
- Receive Firebase Cloud Messaging notifications where platform setup is complete.

---

## Validation Commands

Use these commands to verify the baseline before and after future feature branches:

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Additional deployment checks:

```bash
pnpm audit --audit-level=high
pnpm --filter @tennis/firebase-functions build:targeted-deploy
pnpm --filter @tennis/mobile build:android
pnpm --filter @tennis/mobile build:ios
```

Cloud/mobile build commands may require configured Firebase, EAS, Apple, Android, and GitHub credentials.

---

## Known Follow-up Areas

The baseline is functional and deployable, but the following documents intentionally remain as follow-up references:

- `SECURITY_REVIEW_2026-05-12.md` for production hardening, dependency/audit, auth/domain, and deployment safeguards.
- `ui-ux-review.md` for accessibility, interaction, responsive layout, and design-system improvements.
- `firebase/DEPLOYMENT.md` for the IAM and Secret Manager permissions needed by the targeted Functions deploy workflow.

---

## Rules for Future Feature Work

1. Start future web/mobile work from the `v1.0.0` baseline tag or a branch that contains it.
2. Keep cross-platform logic in `packages/shared`.
3. Keep Firestore/Auth/Functions access in `packages/firebase-client` where practical.
4. Update Firestore rules/indexes and shared TypeScript types together when changing the data model.
5. Add/update tests for scoring, ranking, profile, and status workflows.
6. Update README/setup/version documentation whenever functionality, deployment, or required environment variables change.
