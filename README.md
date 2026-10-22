# 🎾 TennisScoring

**GE Vernova Tennis League — Version 1.2.0**

> **Native mobile migration (in progress):** the goal is a Kotlin Android client and a Swift iOS client replacing the Expo app. Kotlin domain and repository sources live under `apps/mobile/android/app/src/main/java`, and Swift sources under `apps/mobile/ios`. Both compile alongside the shipping client, which is still Expo/React Native: `MainActivity` is a `ReactActivity` and the Android app hosts Metro and a JavaScript runtime as before. A native UI takes over as the launcher only after it reaches the acceptance gates in [`docs/native-mobile-parity-inventory.md`](docs/native-mobile-parity-inventory.md), and the Expo sources are removed only after that.

Native entry points are `pnpm android:test` (Kotlin unit tests), `pnpm android:build`, `pnpm android:release`, `pnpm ios:test`, and `pnpm ios:typecheck`. The Android Gradle build resolves its React Native and Expo plugins through Node, so run `pnpm install` before any `android:*` task. `ios:test` runs the tests of `apps/mobile/ios/TennisKit`, the Swift package that holds the iOS client's scoring and ranking engines and view models, and works on macOS or Linux with Swift 6. There is no Xcode project yet, so `ios:typecheck` (macOS only) typechecks the SwiftUI app and watch sources against the simulator SDKs instead of building them; [`apps/mobile/ios/README.md`](apps/mobile/ios/README.md) covers what the iOS client does and how to create the project. Platform Firebase files come from the existing environment credential workflow rather than from migration commits.

TennisScoring is a functional, deployable pnpm/Turborepo monorepo for league tennis scoring across a Next.js web app, an Expo React Native mobile app, Firebase Cloud Functions, Firestore/Storage security rules, and companion wearable code for Wear OS and Apple Watch. Version `1.0.1` marked the first documented repository baseline that is ready to build, test, deploy, and extend with the next round of web and mobile features; `1.0.2` added mobile account deletion and message reporting/blocking; `1.0.3` added the round-robin match scheduler; `1.0.4` adds a privacy policy (in-app screen and a public web page); `1.0.5` fixes the mobile privacy policy screen so it's reachable before signing in, and links it from the login/signup screen; `1.1.0` adds doubles match tracking and fixed-partnership team standings; `1.2.0` adds required email verification, a dark theme that follows the device setting on web and mobile, portrait tablet layouts, leader resolution of match results, password reset, and 10-point match tiebreaks for hand-recorded results. [CHANGELOG.md](./CHANGELOG.md) lists every change.

**Status:** the web application is live and functional. The mobile application is usable today via a sideloaded Android APK build, but is still being refined — the Google Play Store listing is being finalized ahead of a public release.

---

## ✅ Current v1 Condition

- **Version marker:** `1.2.0` in the workspace manifests and Expo app metadata.
- **Web app:** live and functional in production.
- **Mobile app:** functional and installable via a sideloaded Android APK; still being refined ahead of finalizing the Google Play Store listing.
- **Repository shape:** monorepo with web, mobile, Firebase Functions, Firebase client utilities, and shared domain logic.
- **Auth model:** Firebase Authentication email/password on web and mobile. The web app exchanges Firebase ID tokens for an httpOnly `tennis-auth` session cookie through `next-firebase-auth-edge` middleware.
- **Data model:** Firestore collections for users, divisions, matches, channels/messages, head-to-head data, and division ranking subcollections.
- **Deploy targets:** Vercel/Next.js for web, EAS/Expo for mobile Android/iOS builds, and GitHub Actions workflows for targeted Cloud Functions deploys and for Firestore/Storage rules and Firestore indexes.
- **Validation status:** CI runs type checks, lint, a full build, the shared Jest tests, the Firestore/Storage rules and Cloud Functions tests against the Firebase emulators, a dependency audit, a release bundle and native Android build with Kotlin unit tests, and (on macOS) the Swift `TennisKit` tests. Point-in-time security and UI/UX reviews are kept in this repository.

---

## 🌟 Product Capabilities

### League and division management

- Create and join divisions using invite codes.
- Document Spring/Fall seasons and division levels/flights such as Beginner Singles, Beginner Doubles, Intermediate Singles, and Intermediate Doubles.
- Play doubles: propose, score, report, and confirm four-player matches, with standings kept per fixed partnership alongside the singles table.
- Add players by email, create placeholder division members, update placeholder/player email records, and merge historical placeholder records into real user accounts.
- Role-aware admin and division-leader flows for managing divisions and records.

### Match lifecycle

- Propose, accept, decline, cancel, postpone, delete, and start matches.
- Score live matches with shared tennis scoring logic.
- Record historic results and leader-entered results.
- Support guest opponents, later linking guest matches to registered users.
- Edit completed/pending scores when correction is needed.
- Submit reports, confirm reports, and dispute reports. Division leaders and admins settle disputed results and reports the opposing side has not answered.
- Record a hand-entered result with a 10-point match tiebreak in place of a deciding set.

### Scoring and rankings

- Shared scoring engine for standard tennis points, deuce/advantage, set completion, tiebreaks, and match completion.
- Optional advanced stats tracking for aces, winners, opponent errors, and derived serving/receiving totals.
- Ranking recalculation from completed matches with head-to-head support and denormalized user ranking summaries.
- Admin CSV export for season-scoped match results and ranking rows so historical records can be preserved outside the app.
- PDF match report generation from Cloud Functions.

### Communication, feedback, and notifications

- Division/user channels and direct messaging.
- Firebase Cloud Messaging support for match proposals, accepted matches, report submissions, disputes, and new messages.
- Web and mobile feedback forms that call the `submitFeedback` Cloud Function; GitHub issue creation happens only server-side through a Functions secret.

### Profiles and onboarding

- Email/password sign in, sign up, password reset, and explicit sign out on web and mobile. A new account must verify its email address before it can use the app.
- Division selection/onboarding tutorial gates.
- A light and a dark theme on web and mobile that follow the device's setting, with no in-app toggle.
- Profile editing for display name, phone, avatar URL, contact preferences, weekly availability, and scoring tips preference.
- Shared profile utility functions for availability validation and profile update payloads.

### Platform coverage

- **Web:** Next.js App Router application under `apps/web`.
- **Mobile:** Expo Router application under `apps/mobile`.
- **Backend:** Firebase Functions and rules under `firebase`.
- **Wearables:** Wear OS Kotlin module/app and Apple Watch Swift/module files under `apps/mobile`.

---

## 🚀 Tech Stack

- **Monorepo:** pnpm workspaces and Turborepo.
- **Language:** TypeScript with strict settings for app/package code.
- **Web app:** Next.js 16, React 18.2 (the root `pnpm.overrides` pin it, although `apps/web/package.json` declares React 19), Firebase Web SDK, `next-firebase-auth-edge`.
- **Mobile app:** Expo 57, React Native 0.86, Expo Router, Firebase Web SDK, native Android/iOS companion modules.
- **Backend:** Firebase Cloud Functions (2nd gen), Firestore, Storage, Authentication, FCM, `firebase-admin`, `pdf-lib`.
- **Shared packages:** `@tennis/shared` for domain logic and `@tennis/firebase-client` for Firebase SDK wrappers/hooks.
- **Testing:** Jest/ts-jest for `@tennis/shared`, `node:test` suites against the Firebase emulators for rules and Cloud Functions, Kotlin unit tests for the Android module, and XCTest for the Swift `TennisKit` package.

---

## 🏗️ Project Structure

```text
apps/
  mobile/                 Expo React Native app, Android project, Wear OS app/module, native iOS and watchOS sources
  web/                    Next.js web app, API routes, auth middleware, shared web UI components
firebase/                 Cloud Functions source, Firebase config, Firestore indexes/rules, Storage rules
packages/
  firebase-client/        Shared Firebase config, typed collections, callable wrappers, and React hooks
  shared/                 Shared TypeScript types, scoring/ranking engines, profile utilities, and tips
fixtures/mobile-contract/ Engine parity fixture shared by the TypeScript, Kotlin, and Swift tests
scripts/                  Repository maintenance, backfill, rules-guard, codegen, and fixture scripts
design/                   Standalone design previews
docs/                     Plans, references, and point-in-time audits
.github/workflows/        CI, native iOS checks, EAS Android builds, debug APK build, and Firebase Functions and rules deploy workflows
```

---

## 📦 Shared Code Contract

The `@tennis/shared` package is the canonical location for reusable domain code. Current exports include:

- Tennis match, user, division, season, division level, invite, message, feedback, CSV export, and ranking types.
- `MATCH_STATUS_METADATA` and `getMatchStatusMetadata` for consistent status labels, colors, tones, icons, and accessibility labels.
- Scoring helpers such as `createInitialScore`, `applyPoint`, `formatScoreDisplay`, and `formatGameScore`.
- Ranking helpers such as `computeRankings`, `computeDoublesRankings`, `updateRankingWithMatchResult`, and `extractMatchTotals`.
- `getMatchMoment` for the live match's current moment (deuce, break point, tiebreak, and so on), and `validateRecordedSets`/`buildRecordedMatchScore` for hand-recorded results.
- Match side and doubles team helpers such as `sidePlayerIds`, `sideOfPlayer`, `isDoublesMatch`, `canRespondToReport`, and `doublesTeamId`.
- `generateRoundRobinSchedule` for round-robin fixtures, and roster-import helpers such as `parseRosterPaste`.
- Tip metadata and trigger-to-tip helpers.
- The privacy policy copy (`PRIVACY_POLICY_SECTIONS`) shown by both apps.
- Profile availability helpers such as `addAvailabilitySlot`, `updateAvailabilitySlot`, `removeAvailabilitySlot`, `cycleAvailabilitySlotDay`, `validateAvailabilitySlots`, `buildAvailability`, and `buildUserProfileUpdates`.

When adding logic used by more than one app/package, add it to `packages/shared` and import it from `@tennis/shared` instead of duplicating it in web, mobile, or Firebase code.

---

## 🔥 Firebase Client Contract

The `@tennis/firebase-client` package centralizes client-side Firebase access for web and mobile:

- Initializes Firebase from `NEXT_PUBLIC_FIREBASE_*` or `EXPO_PUBLIC_FIREBASE_*` environment variables.
- Exports `app`, `db`, `auth`, `storage`, `functions`, and `getMessagingIfSupported`.
- Provides typed collection/document helpers and common query builders.
- Provides hooks for auth users, user profiles, matches, live matches, rankings, messages, channels, division options, and active division resolution.
- Wraps Cloud Function calls for division management, match workflows, ranking repair/recalculation, and feedback submission.

App code should prefer these exports over ad-hoc Firebase SDK wiring.

---

## 🚦 Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Create environment files:** use [SETUP.md](./SETUP.md) for web, mobile, Firebase Functions, and CI/deploy configuration.
3. **Run the baseline checks:**
   ```bash
   pnpm --filter @tennis/shared test -- --runInBand
   pnpm typecheck
   pnpm lint
   ```
4. **Run an app locally:**
   ```bash
   pnpm --filter @tennis/web dev
   pnpm --filter @tennis/mobile start
   cd firebase && pnpm serve
   ```

---

## 🧪 Test and Verification Commands

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

CI runs `lint_typecheck` (install, typecheck, lint, build) unconditionally, plus path-filtered jobs: `shared_tests` when `packages/shared/**` or root workspace files change; `firebase_rules_tests` when `firebase/**` or `packages/shared/**` changes (rules guard, emulator rules tests, emulator Cloud Functions tests, then `pnpm audit --audit-level=high` with an OSV-scanner fallback deciding the final verdict); and `mobile_bundle` and `mobile_native` when `apps/mobile/**`, `packages/**`, or root manifests change (Metro and Hermes release bundle, Kotlin unit tests, and a native Android build of the phone and watch apps). `.github/workflows/native-mobile.yml` runs the Swift tests and iOS typecheck on macOS. See [CLAUDE.md](./CLAUDE.md#ci) for the full pipeline breakdown.

---

## 📘 Supporting Documentation

- [SETUP.md](./SETUP.md) — local setup, environment variables, Firebase, web, mobile, wearable, and CI/deploy setup.
- [VERSION_1_BASELINE.md](./VERSION_1_BASELINE.md) — v1 baseline snapshot, deployable components, validation commands, and extension notes.
- [CHANGELOG.md](./CHANGELOG.md) — release history.
- [SECURITY.md](./SECURITY.md) — how to report a vulnerability privately, supported versions, and scope.
- [ACCESSIBILITY.md](./ACCESSIBILITY.md) — accessibility goals, supported platforms, known limitations, and how to report a barrier.
- [firebase/DEPLOYMENT.md](./firebase/DEPLOYMENT.md) — Firebase Functions deploy IAM, GitHub feedback secret, required workflow variables such as `APP_BASE_URL`, and targeted deploy notes.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to report bugs and open pull requests.
- [apps/mobile/ios/README.md](./apps/mobile/ios/README.md) — the native iOS and watchOS client and how to create its Xcode project.
- [docs/native-mobile-parity-inventory.md](./docs/native-mobile-parity-inventory.md) — the gate a native client passes before it replaces the Expo app.
- [SECURITY_REVIEW_2026-05-12.md](./SECURITY_REVIEW_2026-05-12.md) — point-in-time security review and deployment checklist.
- [ui-ux-review.md](./ui-ux-review.md) — point-in-time UI/UX/accessibility review and remediation plan.
- [docs/production-release-readiness-2026-05-28.md](./docs/production-release-readiness-2026-05-28.md) — practical release checklist for mobile/watch distribution, Google Play publication readiness, web production rollout, and feedback-driven patch operations.
- [CLAUDE.md](./CLAUDE.md) — agent/developer reference for architecture and conventions.

---

## 🎨 Design Previews

Open `design/live-scoring-layout-preview.html` in a browser to review and edit a standalone mock of the mobile live scoring layout. Use the **Copy feedback JSON** button to capture layout notes that can be applied back to `apps/mobile/app/match/[id].tsx`.

---

## 🧭 Version 1 Extension Guidance

The v1 baseline should be treated as the known-good starting point for future feature work. Before adding features:

1. Keep cross-platform types and rules in `packages/shared`.
2. Keep Firebase SDK access behind `@tennis/firebase-client` where practical.
3. Add or update shared tests for scoring, ranking, profile, and match status changes.
4. Run the baseline checks in this README.
5. Revisit the security and UI/UX review checklists before production rollout changes.

---

**GE Vernova Tennis League — All skill levels welcome!**
