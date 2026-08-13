# 🎾 TennisScoring

**GE Vernova Tennis League — Version 1.0.3 baseline**

TennisScoring is a functional, deployable pnpm/Turborepo monorepo for league tennis scoring across a Next.js web app, an Expo React Native mobile app, Firebase Cloud Functions, Firestore/Storage security rules, and companion wearable code for Wear OS and Apple Watch. Version `1.0.1` marked the first documented repository baseline that is ready to build, test, deploy, and extend with the next round of web and mobile features; `1.0.2` added mobile account deletion and message reporting/blocking; `1.0.3` adds the round-robin match scheduler.

**Status:** the web application is live and functional. The mobile application is usable today via a sideloaded Android APK build, but is still being refined — the Google Play Store listing is being finalized ahead of a public release.

---

## ✅ Current v1 Condition

- **Version marker:** `1.0.3` in the workspace manifests and Expo app metadata.
- **Web app:** live and functional in production.
- **Mobile app:** functional and installable via a sideloaded Android APK; still being refined ahead of finalizing the Google Play Store listing.
- **Repository shape:** monorepo with web, mobile, Firebase Functions, Firebase client utilities, and shared domain logic.
- **Auth model:** Firebase Authentication email/password on web and mobile. The web app exchanges Firebase ID tokens for an httpOnly `tennis-auth` session cookie through `next-firebase-auth-edge` middleware.
- **Data model:** Firestore collections for users, divisions, matches, channels/messages, head-to-head data, and division ranking subcollections.
- **Deploy targets:** Vercel/Next.js for web, EAS/Expo for mobile Android/iOS builds, Firebase CLI/GitHub Actions for targeted Cloud Functions deploys, and Firebase rules/indexes for Firestore/Storage.
- **Validation status:** shared Jest tests, TypeScript type checks, lint tasks, CI workflow, security review, and UI/UX review are documented in this repository.

---

## 🌟 Product Capabilities

### League and division management

- Create and join divisions using invite codes.
- Document Spring/Fall seasons and division levels/flights such as Beginner Singles, Beginner Doubles, Intermediate Singles, and Intermediate Doubles.
- Add players by email, create placeholder division members, update placeholder/player email records, and merge historical placeholder records into real user accounts.
- Role-aware admin and division-leader flows for managing divisions and records.

### Match lifecycle

- Propose, accept, decline, cancel, postpone, delete, and start matches.
- Score live matches with shared tennis scoring logic.
- Record historic results and leader-entered results.
- Support guest opponents, later linking guest matches to registered users.
- Edit completed/pending scores when correction is needed.
- Submit reports, confirm reports, dispute reports, and resolve disputed reports.

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

- Email/password sign in, sign up, and explicit sign out on web and mobile.
- Division selection/onboarding tutorial gates.
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
- **Web app:** Next.js 16, React 19, Firebase Web SDK, `next-firebase-auth-edge`.
- **Mobile app:** Expo 55, React Native 0.83, Expo Router, Firebase Web SDK, native Android/iOS companion modules.
- **Backend:** Firebase Cloud Functions v2/v1 mix, Firestore, Storage, Authentication, FCM, `firebase-admin`, `pdf-lib`.
- **Shared packages:** `@tennis/shared` for domain logic and `@tennis/firebase-client` for Firebase SDK wrappers/hooks.
- **Testing:** Jest/ts-jest for shared scoring, ranking, profile, and status metadata tests.

---

## 🏗️ Project Structure

```text
apps/
  mobile/                 Expo React Native app, Android project, Wear OS app/module, Apple Watch files
  web/                    Next.js web app, API routes, auth middleware, shared web UI components
firebase/                 Cloud Functions source, Firebase config, Firestore indexes/rules, Storage rules
packages/
  firebase-client/        Shared Firebase config, typed collections, callable wrappers, and React hooks
  shared/                 Shared TypeScript types, scoring/ranking engines, profile utilities, and tips
scripts/                  Repository maintenance scripts
design/                   Standalone design previews
.github/workflows/        CI, EAS Android APK build, and targeted Firebase Functions deploy workflows
```

---

## 📦 Shared Code Contract

The `@tennis/shared` package is the canonical location for reusable domain code. Current exports include:

- Tennis match, user, division, season, division level, invite, message, feedback, CSV export, and ranking types.
- `MATCH_STATUS_METADATA` and `getMatchStatusMetadata` for consistent status labels, colors, tones, icons, and accessibility labels.
- Scoring helpers such as `createInitialScore`, `applyPoint`, `formatScoreDisplay`, and `formatGameScore`.
- Ranking helpers such as `computeRankings`, `updateRankingWithMatchResult`, and `extractMatchTotals`.
- Tip metadata and trigger-to-tip helpers.
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

CI runs `lint_typecheck` (install → typecheck → lint → build) unconditionally, plus path-filtered jobs: `shared_tests` when `packages/shared/**`/root workspace files change, and `firebase_rules_tests` when `firebase/**` changes (rules smoke test, then `pnpm audit --audit-level=high` with an OSV-scanner fallback deciding the final verdict). See [CLAUDE.md](./CLAUDE.md#ci) for the full pipeline breakdown.

---

## 📘 Supporting Documentation

- [SETUP.md](./SETUP.md) — local setup, environment variables, Firebase, web, mobile, wearable, and CI/deploy setup.
- [VERSION_1_BASELINE.md](./VERSION_1_BASELINE.md) — v1 baseline snapshot, deployable components, validation commands, and extension notes.
- [CHANGELOG.md](./CHANGELOG.md) — release history.
- [firebase/DEPLOYMENT.md](./firebase/DEPLOYMENT.md) — Firebase Functions deploy IAM, GitHub feedback secret, and targeted deploy notes.
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
