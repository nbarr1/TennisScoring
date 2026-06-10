# 🎾 TennisScoring

**Current stable release baseline: `1.0.1`**  
**Repository status:** stable, releasable, and ready for routine maintenance or feature work.

TennisScoring is a pnpm/Turborepo monorepo for GE Vernova Tennis League scoring. It includes a Next.js web app, an Expo React Native mobile app, Firebase Cloud Functions, Firestore/Storage rules, shared TypeScript domain packages, and companion Wear OS / Apple Watch code.

---

## Current Release State

- **Version:** `1.0.1` in the root workspace, web app, mobile app, shared package, and Firebase client package manifests. The Firebase Functions package remains `1.0.0` as an internal deploy package.
- **Runtime:** Node.js `22` for workspace scripts and Firebase Functions; EAS build profiles pin Node `20.19.2` for Expo cloud builds.
- **Package manager:** `pnpm@9.15.5`.
- **Web stack:** Next.js `16.2.6`, React `19.2.6`, Firebase Web SDK, `next-firebase-auth-edge`, and Zustand.
- **Mobile stack:** Expo `55`, React Native `0.83.1`, React `19.2.0`, Expo Router, Firebase Web SDK, and Zustand.
- **Backend stack:** Firebase Authentication, Firestore, Storage, FCM, Cloud Functions, `firebase-admin`, `firebase-functions`, and `pdf-lib`.
- **CI/CD:** GitHub Actions for lint/typecheck, selected tests, Firebase rules smoke tests, CodeQL, EAS Android preview builds, Firebase safety checks, and targeted Firebase Functions deploys.

---

## Product Capabilities

### League and division management

- Create divisions and join them by invite code.
- Manage season/level metadata and division memberships.
- Add invited players by email and handle placeholder player records until users register.
- Merge placeholder records into registered user accounts.
- Export division CSV data for records and review.

### Match lifecycle and scoring

- Propose, accept, decline, cancel, postpone, delete, start, and complete matches.
- Score live matches with shared tennis scoring rules.
- Record historical matches and leader-entered results.
- Submit, confirm, dispute, and resolve match reports.
- Support guest opponents and corrections to pending/completed scores.

### Rankings and reports

- Recalculate division rankings from completed match data.
- Maintain ranking summaries and head-to-head context.
- Generate PDF match reports through Firebase Functions.

### Communication and feedback

- Use division/user channels and direct messaging.
- Send Firebase Cloud Messaging notifications for supported match and messaging events.
- Submit feedback from web or mobile through the `submitFeedback` Cloud Function. GitHub credentials stay server-side in Firebase Secret Manager.

### Profiles and onboarding

- Sign up, sign in, and sign out with Firebase email/password auth.
- Use tutorial and division onboarding gates.
- Edit display name, phone, avatar URL, contact preferences, availability, and scoring-tip preference.

### Platform coverage

- **Web:** Next.js App Router under `apps/web/app`.
- **Mobile:** Expo Router under `apps/mobile/app`.
- **Backend:** Firebase Functions and Firebase rules under `firebase`.
- **Shared packages:** `packages/shared` and `packages/firebase-client`.
- **Wearables:** Wear OS code under `apps/mobile/android/wear` and `apps/mobile/modules/wear-os`; Apple Watch code under `apps/mobile/ios/TennisScoringWatch` and `apps/mobile/modules/apple-watch`.

---

## Repository Layout

```text
apps/
  mobile/                 Expo app, native Android project, Wear OS app/module, Apple Watch files
  web/                    Next.js app, API routes, auth middleware, shared web UI components
firebase/                 Cloud Functions, Firebase config, Firestore indexes/rules, Storage rules
packages/
  firebase-client/        Firebase SDK config, typed collection helpers, callable wrappers, React hooks
  shared/                 Types, scoring/ranking engines, profile utilities, tips, tests
scripts/                  Repository maintenance and backfill scripts
design/                   Standalone design previews
docs/                     Current operational notes plus historical audit summaries
.github/workflows/        CI, security, Firebase, and EAS workflows
```

---

## Primary Commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Targeted commands:

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
pnpm --filter @tennis/web build
pnpm --filter @tennis/mobile typecheck
```

Cloud and mobile build commands may require Firebase, EAS, Apple, Android, or GitHub credentials that are not stored in the repository.

---

## Environment Variables

### Web public Firebase variables

`apps/web` reads Firebase client configuration from `NEXT_PUBLIC_FIREBASE_*` variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional)
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (required for web push)

### Mobile public Firebase variables

`apps/mobile` reads the corresponding Expo public variables:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional)
- `EXPO_PUBLIC_FIREBASE_VAPID_KEY` (optional for native builds)

### Server and deploy variables

- `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID` are used by Firebase deploy workflows.
- `GITHUB_TOKEN` is stored as a Firebase Functions secret for feedback issue creation.
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_FEEDBACK_LABELS`, and `GITHUB_API_URL` configure feedback issue routing.
- `APP_BASE_URL` configures absolute links generated by Functions.
- `NEXT_FIREBASE_AUTH_COOKIE_SECRET_CURRENT`, `NEXT_FIREBASE_AUTH_COOKIE_SECRET_PREVIOUS`, and related auth-edge values configure the web session cookie middleware.

Never commit `.env` files, service-account keys, GitHub tokens, Apple credential files, or production Firebase admin credentials.

---

## Documentation Map

- `SETUP.md` — local development and environment setup.
- `firebase/DEPLOYMENT.md` — Firebase deploy prerequisites and feedback secret setup.
- `docs/dependency-policy.md` — dependency update and audit policy.
- `docs/quality-gates-plan.md` — current quality gates for stable releases.
- `VERSION_1_BASELINE.md` — release baseline summary for `1.0.1`.
- `SECURITY_REVIEW_2026-05-12.md` and `ui-ux-review.md` — historical reviews updated with current status notes.
