# TennisScoring Version 1.0.0 Baseline

**Baseline date:** 2026-05-13  
**Baseline label:** `v1.0.0` / first functional deployable repository  
**Purpose:** capture the current repository condition before the next phase of mobile and web application feature work.

---

## Update — 2026-08-10 (`v1.0.1`)

Package/app version markers moved to `1.0.1` without this document being updated at the time; `v1.0.0` was also not tagged in git until this update. The version markers are corrected now and the sections below are current as of this update. Both tags now exist: `v1.0.0` points to commit `0211f1f` (2026-05-12), and `v1.0.1` points to commit `5151498` (2026-08-10). The original `v1.0.0` content is left below as historical record rather than rewritten, except where noted.

Changes since the `v1.0.0` snapshot that affect setup, deployment, or data shape:

- **New Cloud Functions**: `backfillMissingProfiles` (repairs `profiles/{uid}` docs missing due to a gap in the invite/add-by-email write paths, now fixed at the source), `health`, `readiness`.
- **Firestore rules**: `profiles/{userId}` now allows a signed-in user to self-write their own `displayName`/`avatarUrl`/`tutorialDone`/`id`/`updatedAt` (previously admin-only, which silently broke every non-admin profile save on both web and mobile since `updateUserProfile()` always batches a `profiles/{uid}` write). `role` and `divisionId` remain locked to admin/Cloud Functions on this path.
- **Known deferred limitation**: `onUserCreated` (the `identity.beforeUserCreated` blocking function) cannot be redeployed — this Firebase project is not on Google Cloud Identity Platform (GCIP), which blocking functions require. The function keeps running its previously-deployed code; self-registration is unaffected today. **Do not enable GCIP without first setting a real `ALLOWED_EMAIL_DOMAIN` value** in `firebase/.env.tennisscoring-40165` — the current (unreleased) version of this function fails closed and would reject all self-registration if it ever goes live with that value blank.
- **Dependency audit**: the CI OSV gate was failing on 50 known vulnerabilities in transitive dev/build-tool packages (none shipped to end users). 48 fixed via `pnpm.overrides` in the root `package.json`; the remaining 2 (`image-size`, via react-native's metro bundler, no upstream fix exists) are suppressed with justification in `osv-scanner.toml`.
- **Framework upgrades**: Next.js 14 → 16, React 18 → 19, Expo 51 → 57, React Native 0.74 → 0.86 (the "Deployable Components" section below has been updated in place to describe the current versions rather than what shipped at the `v1.0.0` snapshot).
- **Version marker gap fixed**: `firebase/package.json` still read `1.0.0` after every other manifest moved to `1.0.1`; it is now `1.0.1` too.

---

## Update — 2026-08-13 (`v1.0.2`)

Changes since the `v1.0.1` snapshot that affect data shape or user-visible capability:

- **New Cloud Function**: `deleteAccount` (`firebase/src/users/deleteAccount.ts`) — signed-in users delete their own account. Blocks with `failed-precondition` if the caller currently leads a division. Scrubs PII from `users/{uid}`/`profiles/{uid}` (kept, not deleted, so historical match/ranking records keep resolving) and deletes the Firebase Auth user via the Admin SDK.
- **New Firestore collection**: `messageReports/{reportId}` — UGC moderation reports against channel messages, scoped by `divisionId`. Readable/resolvable by the reporting division's leaders/admins; creatable by any authenticated user reporting their own submission.
- **New `User` fields**: `blockedUserIds?: string[]` (self-managed, client-side-enforced message block list), `accountDeleted?`/`deletedAt?`.
- **Firestore rules**: `users/{userId}` self-writable fields now include `blockedUserIds`. Division channel messages (`channels/{channelId}/messages/{messageId}`) can now additionally be deleted by that division's leaders/admins, not just direct-message participants deleting their own conversation, to support removing a reported message.
- **Mobile UI**: Profile tab gets a Delete Account flow (password re-auth + the callable above) and a Blocked Users list with unblock. Messages tab gets long-press → Report/Block on any other sender's message. Admin tab gets a Reported Messages review queue (dismiss or remove).
- **Version markers**: root, `apps/web`, `apps/mobile`, `packages/shared`, `packages/firebase-client`, and `firebase` package manifests moved to `1.0.2`; `apps/mobile/app.json` moved to `version: 1.0.2`, Android `versionCode: 2`, iOS `buildNumber: 2`.

---

## Update — 2026-08-13 (`v1.0.3`)

Changes since the `v1.0.2` snapshot that affect data shape or user-visible capability:

- **New Cloud Function**: `publishRoundRobinSchedule` (`firebase/src/matches/scheduleFunctions.ts`) — division leaders/admins generate and publish a round-robin fixture list for a season/division level in one step. Runs the Berger/circle-rotation algorithm from `packages/shared/src/scheduling/roundRobin.ts` and bulk-writes each fixture as a `Match` doc with `status: 'scheduled'`, `source: 'schedule'` directly (leader scheduling authority, not the player propose/accept flow — players can still postpone/cancel individual fixtures afterward). `clearExisting` only removes previously-generated (`source: 'schedule'`) fixtures for that division/season/level, never matches players scheduled themselves.
- **New shared module**: `packages/shared/src/scheduling/roundRobin.ts` — pure, order-agnostic `generateRoundRobinSchedule()`, unit-tested (`packages/shared/src/scheduling/__tests__/roundRobin.test.ts`).
- **`Match.source` widened**: `'live' | 'manual'` → `'live' | 'manual' | 'schedule'` (additive).
- **Mobile UI**: new Admin-only screen `apps/mobile/app/round-robin-scheduler.tsx` (season/level selection, player checklist, single/double round-robin toggle, interval + start-date controls, ranking-based seeding, live preview before publish), reached from a new "Round-Robin Scheduler" button on the Admin tab.
- **Version markers**: root, `apps/web`, `apps/mobile`, `packages/shared`, `packages/firebase-client`, and `firebase` package manifests moved to `1.0.3`; `apps/mobile/app.json` moved to `version: 1.0.3`, Android `versionCode: 3`, iOS `buildNumber: 3`.

---

## Update — 2026-08-14 (`v1.0.4`)

Changes since the `v1.0.3` snapshot that affect user-visible capability or Play Store readiness:

- **Privacy policy added** — TennisScoring previously had no privacy policy anywhere (mobile, web, or repo docs), an open blocker already flagged by this repo's own `play_store_readiness_report.md`. Content lives once in `packages/shared/src/legal/privacyPolicy.ts` and is rendered identically by a new mobile screen (`apps/mobile/app/privacy-policy.tsx`, linked from Profile) and a new **public** web page (`apps/web/app/privacy/page.tsx`). The policy is adapted from — not copied from — the reference Android app's version, corrected for what TennisScoring actually has (email/password auth only, no avatar upload) and what it has that the Android app doesn't (web app, wearable companions, PDF reports in Cloud Storage, feedback relayed to GitHub issues).
- **`apps/web/middleware.ts`** — the auth-redirect matcher now excludes `privacy` alongside `login`/`invite/`, so the page renders for signed-out visitors instead of bouncing them to `/login`. This is the one change in this update that would silently break the whole feature if missed; verified directly against a running server (`curl` returned `200` with full page content, no redirect).
- **Play Store follow-up (manual, outside this repo)**: once `apps/web` is deployed, the resulting `https://<web-domain>/privacy` URL should be entered in Google Play Console under App Content → Privacy Policy.
- **Version markers**: root, `apps/web`, `apps/mobile`, `packages/shared`, `packages/firebase-client`, and `firebase` package manifests moved to `1.0.4`; `apps/mobile/app.json` moved to `version: 1.0.4`, Android `versionCode: 4`, iOS `buildNumber: 4`.

---

## Update — 2026-08-17 (`v1.0.5`)

Changes since the `v1.0.4` snapshot that affect Play Store readiness:

- **Mobile privacy policy screen bug fix** — `apps/mobile/app/privacy-policy.tsx` existed since `v1.0.4` but was unreachable for signed-out users: `AuthGuard` in `apps/mobile/app/_layout.tsx` redirected any route other than `(auth)` straight to `/login` while signed out, so the privacy policy could only be viewed after creating an account. `AuthGuard` now exempts the `privacy-policy` route from that redirect, matching how the web app's `/privacy` route is already excluded from its auth middleware.
- **Mobile login/signup screen** (`apps/mobile/app/(auth)/login.tsx`) gets a "Privacy Policy" link below the sign-in/sign-up toggle, mirroring the equivalent link already on the web login page (`apps/web/app/login/page.tsx`). This makes the policy discoverable before account creation on mobile, not just from the Profile tab afterward.
- **`play_store_readiness_report.md`** — the Privacy Policy & Compliance section (previously stale, written before `v1.0.4` added the policy) is corrected to reflect the current in-repo state and calls out the one step that still has to happen manually in Google Play Console: entering the deployed `https://<web-domain>/privacy` URL under App Content → Privacy Policy.
- **Version markers**: root, `apps/web`, `apps/mobile`, `packages/shared`, `packages/firebase-client`, and `firebase` package manifests moved to `1.0.5`; `apps/mobile/app.json` moved to `version: 1.0.5`, Android `versionCode: 5`, iOS `buildNumber: 5`.

---

## Update — 2026-09-05 (`v1.1.0`)

Changes since the `v1.0.5` snapshot:

- **Doubles match tracking** — four-player matches with two fixed partnerships can be proposed, scored, reported, and confirmed on web and mobile. `Match` now populates the previously unused `matchType`, `side1`, and `side2` fields; `player1Id`/`player2Id` hold each side's first member and `player1Name`/`player2Name` mirror the team display name, so existing indexes, rules, queries, and renderers keep working. Singles documents are unchanged and no data migration is required.
- **Team standings** — `divisions/{divisionId}/doublesRankings/{teamId}` holds one row per fixed partnership, written by `recalculateRankings()` via the new `computeDoublesRankings()`. A team is identified by the sorted pair of its members' user ids (`doublesTeamId`), so a partnership accumulates one row across a season with no registration step. The collection is a sibling of `rankings` so the two prune independently.
- **New Cloud Function** — `createDoublesMatch` creates doubles matches server-side, since the client `allow create` rule pins `playerIds` to a two-element array and validating four players' division membership in rules would exceed the per-request document access limit. `recordHistoricMatch` and `recordMatchOnBehalf` also accept doubles side rosters.
- **Security rules** — `isMatchParticipant` now consults `playerIds` so a doubles partner can read and update their match (matching what `storage.rules` already did); either opponent can accept a doubles proposal; and report confirmation requires the *opposing* side, so a submitter's partner can no longer confirm their own team's report.
- **Scoring engine untouched** — `Player` was already a side label rather than a person, so `scoreEngine.ts` and the `LiveScore` shape needed no changes, and neither wearable module was modified. Serving is tracked at side level; there is no per-partner serve rotation.
- **Deliberately out of scope** — round-robin doubles scheduling (rejected server-side and disabled in both admin surfaces rather than silently creating unplayable 1v1 fixtures), admin team management, and per-individual doubles statistics.
- **Version markers**: root, `apps/web`, `apps/mobile`, `packages/shared`, `packages/firebase-client`, and `firebase` package manifests moved to `1.1.0`; `apps/mobile/app.json` moved to `version: 1.1.0`, Android `versionCode: 6`, iOS `buildNumber: 6`.

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

A Git tag named `v1.0.0` points to the commit containing this baseline (`0211f1f`), and a `v1.0.1` tag points to the commit containing the 2026-08-10 update above (`5151498`).

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
  - `/privacy` (public, excluded from the auth middleware)

### Mobile application

- Location: `apps/mobile`
- Framework: Expo 57 / React Native 0.86 with Expo Router
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
  - account management: `deleteAccount`
  - scheduling: `publishRoundRobinSchedule`
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

- Wear OS app/module code exists under `apps/mobile/android/wear`, `apps/mobile/android/app/src/main/java/com/companytennisleague/app/wear`, and `apps/mobile/modules/wear-os`.
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
- Send and receive in-app messages; report a message for moderation or block a sender.
- Division leaders/admins review and resolve reported messages.
- Delete your own account (blocked while leading a division, until leadership is transferred).
- Division leaders/admins auto-generate and publish a round-robin match schedule for a season/division level.
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
