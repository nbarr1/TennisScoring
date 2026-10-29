# TennisScoring Setup Guide

This guide reflects version 1.2.0. The app uses Firebase email/password authentication, Firestore, Storage, Cloud Functions, Firebase Cloud Messaging, Next.js, Expo/EAS, and pnpm/Turborepo.

## Native client migration

The shipping mobile client is still Expo/React Native while Kotlin and Swift sources are built up beside it. See [`docs/native-mobile-parity-inventory.md`](docs/native-mobile-parity-inventory.md) for the gates a native client passes before it takes over.

Android requires JDK 17, Android SDK 35, and NDK `27.1.12297006`. Run `pnpm install` first: `apps/mobile/android/settings.gradle` resolves the React Native and Expo Gradle plugins through `node --print require.resolve(...)`, so Gradle fails while evaluating the settings file if `node_modules` is missing. Restore the environment-specific `google-services.json` into `apps/mobile/android/app/` through the credential workflow, then run `apps/mobile/android/gradlew -p apps/mobile/android :app:assembleDebug`, or `pnpm android:test` for the Kotlin unit tests.

iOS requires macOS, Xcode 16 or later, the production signing team/profiles, APNs capability, associated domains, and an untracked `GoogleService-Info.plist`. The platform-neutral half of the client, the `apps/mobile/ios/TennisKit` Swift package, builds and tests anywhere Swift 6 runs: `pnpm ios:test`. No Xcode project is committed yet, so the app itself is checked by `pnpm ios:typecheck` (macOS only), which typechecks `apps/mobile/ios/TennisScoring` against the iOS simulator SDK and `apps/mobile/ios/TennisScoringWatch` against the watchOS simulator SDK. To create `TennisScoring.xcodeproj`, follow [`apps/mobile/ios/README.md`](apps/mobile/ios/README.md): keep bundle identifier `com.companytennisleague.app`, link the local `TennisKit` package and Firebase Auth, Firestore, and Functions (Firebase 11 or later) through Swift Package Manager, and include `TennisScoringWatch` as a watchOS target; then replace that script with `xcodebuild test`. A debug build without `GoogleService-Info.plist` runs on built-in demo data. Apple project generation, signing, archive, and target integration cannot be validated on Linux.

---

## Prerequisites

- Node.js 22 for local web/mobile/Firebase Functions development and CI parity. `.nvmrc` is the single source of truth — CI workflows read it directly, and the root/`firebase/`/`apps/web` `engines.node` fields, plus the `node` pins in `apps/mobile/eas.json`, are all held at 22 to match.
- pnpm 9.15.5 or newer.
- Firebase CLI (`npm i -g firebase-tools`) for emulators, rules, and Functions deployment.
- EAS CLI (`npm i -g eas-cli`) for mobile cloud builds.
- Android Studio for Android and Wear OS builds.
- Xcode 16 or later and Apple developer tooling for iOS/Apple Watch builds.
- JDK 17, Android SDK 35, and NDK `27.1.12297006` for native Android builds (see [Native client migration](#native-client-migration)).
- Google Cloud CLI (`gcloud`) when validating Firebase deployer IAM and Secret Manager access.

---

## 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

Useful baseline checks:

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm typecheck
pnpm lint
pnpm test
```

---

## 2. Firebase Project Setup

Create or select a Firebase project, then enable:

1. **Authentication** with the **Email/Password** provider.
2. **Cloud Firestore**.
3. **Cloud Storage**.
4. **Cloud Functions**.
5. **Firebase Cloud Messaging** for push notification support.

Download platform config files:

- Android: download `google-services.json` and place it at `apps/mobile/android/app/google-services.json`. A root-level `apps/mobile/google-services.json` is also present for Expo tooling compatibility. For EAS builds, upload that file as a file environment variable named `GOOGLE_SERVICES_JSON` in each EAS environment used by Android builds (`preview` and `production`).
- iOS: download `GoogleService-Info.plist` and place it at `apps/mobile/GoogleService-Info.plist` or the path expected by the active native iOS project configuration. For EAS builds, upload that file as `GOOGLE_SERVICE_INFO_PLIST` (or `GOOGLE_SERVICES_PLIST`) in each EAS environment used by iOS builds.
- Web: copy the Firebase web app config values into `NEXT_PUBLIC_FIREBASE_*` variables.

---

## 3. Environment Variables

### Web app (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=""
NEXT_PUBLIC_FIREBASE_VAPID_KEY=""
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

NEXTAUTH_SECRET="replace-with-a-long-random-string"

FIREBASE_ADMIN_PROJECT_ID=""
FIREBASE_ADMIN_CLIENT_EMAIL=""
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`NEXTAUTH_SECRET` signs the `tennis-auth` httpOnly session cookie used by `next-firebase-auth-edge` middleware. There is no fallback: without it, the middleware sends every page request to `/login` and answers API requests with an error. Use a long random value, and a different one in production.

`NEXT_PUBLIC_SITE_URL` is the public origin used by `robots.txt`, `sitemap.xml`, and page metadata. `NEXT_PUBLIC_*` values are inlined at build time, so set it in the build environment (for example, Vercel). `NEXT_PUBLIC_FIREBASE_VAPID_KEY` is the Web Push certificate key that web push registration needs.

`/api/readiness` reports the web app as not ready while any of `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXTAUTH_SECRET`, or the three `FIREBASE_ADMIN_*` variables is missing. Two optional variables are also read: `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` (the Functions region for the add-division-member proxy route, default `us-central1`) and `NEXT_PUBLIC_APP_VERSION` (attached to feedback submissions).

### Mobile app (`apps/mobile/.env`)

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=""
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=""
EXPO_PUBLIC_FIREBASE_PROJECT_ID=""
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=""
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
EXPO_PUBLIC_FIREBASE_APP_ID=""
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=""
```

`EXPO_PUBLIC_*` values are bundled into the mobile app and must not contain secrets.

### Firebase Functions params (`firebase/.env.<PROJECT_ID>`)

```bash
APP_BASE_URL="https://your-web-domain.example" # required in production; must be the web app's https:// origin
ALLOWED_EMAIL_DOMAIN="" # fails closed: the onUserCreated blocking function REJECTS ALL self-registration while this is blank. Set it to a real domain (e.g. "yourcompany.com") before that function is live, or self-signup is completely disabled.
GITHUB_OWNER="your-github-org-or-user"
GITHUB_REPO="your-feedback-repo"
GITHUB_API_URL="https://api.github.com"
GITHUB_FEEDBACK_LABELS="feedback"
```

`APP_BASE_URL` is the origin that invite links and match emails point at. In production, `sendInvite` and `recordMatchOnBehalf` fail with `failed-precondition` when it is unset or does not start with `https://`; only the emulator and non-production runs fall back to `http://localhost:3000`. The targeted deploy workflow writes it from the `APP_BASE_URL` repository variable and stops before deploying when that variable is missing (see [Targeted Firebase Functions deploy](#targeted-firebase-functions-deploy)).

`onUserCreated` is an `identity.beforeUserCreated` blocking function, which Firebase can only wire up on projects with Google Cloud Identity Platform (GCIP) enabled. On a project without GCIP, `firebase deploy --only functions` deploys the function's *code* successfully but fails to update its blocking-trigger config with `Blocking Functions may only be configured for GCIP projects` — the previously-deployed version (if any) keeps running. Enable GCIP in Cloud Console before relying on a new deploy of this function to take effect, and always set `ALLOWED_EMAIL_DOMAIN` first per the warning above.

Store the feedback token in Secret Manager only:

```bash
firebase functions:secrets:set GITHUB_TOKEN
```

Never put GitHub credentials in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables. Web and mobile feedback submissions call the `submitFeedback` Firebase Function, and only that function calls the GitHub API.

---

## 4. Local Development

### Web

```bash
pnpm --filter @tennis/web dev
```

The web app runs on `http://localhost:3000` by default.

### Mobile

```bash
pnpm --filter @tennis/mobile start
pnpm --filter @tennis/mobile android
pnpm --filter @tennis/mobile ios
```

Expo Router handles the mobile auth/onboarding/tab route flow.

### Firebase emulators

```bash
cd firebase
pnpm serve
```

Configured emulator ports:

- Auth: `9099`
- Functions: `5001`
- Firestore: `8080`
- Storage: `9199`
- Emulator UI: `4000`

If you want web/mobile to point to emulators, add emulator connection code or environment-specific initialization before relying on local data. The v1 client config primarily initializes against configured Firebase project values.

---

## 5. Firebase Rules, Indexes, and Functions

Deploy Firestore rules, Storage rules, and Firestore indexes with the **Deploy Firebase rules** GitHub Actions workflow (`.github/workflows/deploy-firebase-rules.yml`). Run it by hand from the Actions tab: pick the commit, the targets, and `dry-run` first to see the diff against the live rules, then run again in `deploy` mode. Rules that tighten access go out only after the web and mobile clients that handle them are live; the workflow header describes the full ordering.

The workflow uses the `staging` GitHub environment's `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID` secrets, the same ones the functions workflow uses. The service account needs the Firebase Rules Admin role, plus Cloud Datastore Index Admin to deploy indexes.

The same deploy from a local checkout, from the `firebase` directory:

```bash
firebase deploy --only firestore
firebase deploy --only storage
```

Build Functions locally:

```bash
pnpm --filter @tennis/firebase-functions build
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

Deploy Functions manually. The `deploy` script uploads whatever `firebase/lib/index.js` the last build wrote, so run the full `build` first; after `build:targeted-deploy`, it would deploy only the targeted functions:

```bash
pnpm --filter @tennis/firebase-functions build
pnpm --filter @tennis/firebase-functions deploy
```

See [firebase/DEPLOYMENT.md](./firebase/DEPLOYMENT.md) for IAM, Secret Manager, and targeted GitHub Actions deploy details.

---

## 6. Web Deployment

The web app is a standard Next.js app under `apps/web`.

Recommended deployment steps:

1. Build shared packages first when your platform does not automatically run Turbo dependency builds.
2. Set all `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_SECRET`, and `FIREBASE_ADMIN_*` variables in the hosting provider.
3. Configure Firebase Auth authorized domains for the deployed URL.
4. Run:

```bash
pnpm --filter @tennis/web build
pnpm --filter @tennis/web start
```

The repository includes `apps/web/vercel.json`, which installs from the workspace root and builds `@tennis/shared` and `@tennis/firebase-client` before `@tennis/web`.

---

## 7. Mobile and Wearable Builds

Mobile app metadata in `apps/mobile/app.json` currently reads:

- Expo version: `1.2.0`
- iOS build number: `6` (the EAS `production` profile auto-increments it)
- Android version code: `6` in the file. Release builds from the EAS workflow replace it with `VERSION_CODE_OFFSET + github.run_number` (see [EAS Android workflow](#eas-android-workflow)).
- Android application ID (Google Play package name): `com.companytennisleague.app`

The Android application ID is set in `apps/mobile/app.json` (`android.package`) and mirrored in the native project at `apps/mobile/android/app/build.gradle` (`namespace`/`applicationId`) and `apps/mobile/android/wear/build.gradle` (`applicationId`, which must stay identical to the phone app's so the Wear OS Data Layer API can pair them). Before building a release intended for the Play Console, register (or confirm) an Android app with this exact package name in the Firebase project console and replace `apps/mobile/google-services.json` / `apps/mobile/android/app/google-services.json` with the file Firebase generates for it — EAS builds overwrite the in-repo copy from the `GOOGLE_SERVICES_JSON` secret at build time (see `apps/mobile/scripts/prepare-eas-credentials.js`), so that secret must point at the matching file too.

Build with EAS:

```bash
pnpm --filter @tennis/mobile build:android
pnpm --filter @tennis/mobile build:ios
```

The `apps/mobile/eas.json` profiles run this prebuild command before cloud builds:

```bash
pnpm --filter @tennis/shared build && pnpm --filter @tennis/firebase-client build
```

Wear OS preview APK builds use the `wear-preview` EAS profile, which is debug-signed for internal distribution only — Play does not accept debug-signed release artifacts. A real Play submission uses the `wear-production` EAS profile instead, which builds an app bundle (`:wear:bundleRelease`) and leaves the signing config unset in `apps/mobile/android/wear/build.gradle` so EAS-managed release signing applies (register the Wear module's release keystore with `eas credentials --platform android`, run from `apps/mobile`, before the first `wear-production` build). The GitHub Actions `EAS Build (Android APKs)` workflow builds the mobile preview APK, the phone release bundle, the Wear OS preview APK, or the Wear OS production bundle through the `target` input (`mobile`, `production`, `wear`, `wear-production`).

`:app` and `:wear` share an `applicationId` (see the comment in `apps/mobile/android/wear/build.gradle`), so both can live under one Play Store listing. `:wear` takes its `versionCode` as `1000000 +` the phone's, which keeps the two distinct.

---

## 8. GitHub Actions and CI/CD

### CI

`.github/workflows/ci.yml` runs on pushes to `Main`/`main` and pull requests to `Main`/`main`/`claude/**`, on Node 22. A path-filter job decides which of these run:

```bash
# lint_typecheck — always runs
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build

# shared_tests — only if packages/shared/** or root workspace files changed
pnpm --filter @tennis/shared test

# firebase_rules_tests — only if firebase/** or packages/shared/** changed
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules       # emulator: signed-out smoke test, then the authenticated rules suite
pnpm --filter @tennis/firebase-functions test:functions   # emulator: Cloud Functions handler tests
pnpm audit --audit-level=high   # an OSV-scanner step decides the final verdict when the audit fails
```

The mobile jobs (`mobile_bundle`, `mobile_native`) run when `apps/mobile/**`, `packages/**`, or root manifests change. `mobile_bundle` runs native-module codegen and bundles the app for release with Metro and Hermes; `mobile_native` builds the watch and phone apps with Gradle and runs the Kotlin unit tests. `.github/workflows/native-mobile.yml` runs the Swift `TennisKit` tests and iOS typecheck on macOS when `apps/mobile/ios/**` changes. Code scanning runs through GitHub's CodeQL default setup, configured in the repository settings.

### Targeted Firebase Functions deploy

`.github/workflows/deploy-firebase-function.yml` runs on manual dispatch, and on pushes to the default branch (or `main`, kept listed in case the default is renamed) that touch `firebase/**`, `packages/shared/**`, or the workflow itself. It builds the targeted Functions bundle, validates GitHub feedback configuration, writes Firebase params, and deploys selected Functions. Every run shares one concurrency group and is never cancelled part-way.

It deploys to the Firebase project configured for the GitHub `staging` environment, and only that one — there is no production job. To promote, point the staging environment's `FIREBASE_PROJECT_ID` at the target project, or add a second job with its own environment once production credentials exist. Note also that the workflow's `GITHUB_TOKEN` feedback check runs before the deploy and fails the whole run if the token is missing or expired, regardless of which functions you are deploying.

Required GitHub Actions secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

Required GitHub Actions variable:

- `APP_BASE_URL`: the web app's `https://` origin. The workflow fails before deploying when it is missing or doesn't start with `https://`.

Optional GitHub Actions variables:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_API_URL`
- `GITHUB_FEEDBACK_LABELS`

### EAS Android workflow

`.github/workflows/eas-build.yml` runs only on manual dispatch: choose `mobile` (preview APK), `production` (release AAB, default branch only), `wear`, or `wear-production` (default branch only). Merges and pull requests do not start a build. For `production` and `wear-production`, `scripts/stamp-android-version-code.mjs` sets the release `versionCode` from the workflow's run number before the build. It requires:

- `EXPO_TOKEN`
- The `NEXT_PUBLIC_FIREBASE_*` repository secrets, which the workflow maps to `EXPO_PUBLIC_FIREBASE_*` environment variables.

### Debug APK workflow

`.github/workflows/debug-apk.yml` runs only on manual dispatch. It builds an installable, debug-signed `arm64-v8a` release APK with the real Firebase config from the same `NEXT_PUBLIC_FIREBASE_*` secrets, and uploads it as a workflow artifact for 14 days. It fails if the bundle still carries the `ci-placeholder` values that CI builds use. Uninstall any Play-signed or EAS-signed copy before installing it. The same run builds the Wear OS watch APK (`debug-wear-apk-<sha>`), signed with the same debug keystore. Install the phone and watch APKs from one run, because the phone and watch exchange scores only when they share a signing key.

---

## 9. Version 1 Baseline Commands

After setup, use these commands to confirm a working baseline before feature work:

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

With JDK 21 or later installed (firebase-tools 15 requires it to start the emulators), run the Firebase rules and Cloud Functions tests as CI does:

```bash
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions test:functions
```

If cloud credentials are configured, also validate:

```bash
pnpm --filter @tennis/firebase-functions build:targeted-deploy
pnpm --filter @tennis/mobile build:android
```

---

## 10. Troubleshooting Notes

- If web auth redirects to `/login` after sign in, verify `FIREBASE_ADMIN_*`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_FIREBASE_API_KEY`, and Firebase Auth authorized domains.
- If feedback submission fails, verify `GITHUB_TOKEN` exists in Secret Manager and the `GITHUB_OWNER`/`GITHUB_REPO` params point to a repository where the token can create issues.
- If Functions deploy fails with `iam.serviceaccounts.actAs` or Secret Manager IAM errors, use the remediation steps in `firebase/DEPLOYMENT.md`.
- If EAS builds cannot resolve workspace packages, confirm the EAS profile prebuild command completed and that pnpm 9.15.5 is available in the build environment.
- If Admin shows `Unable to load division levels ... Missing or insufficient permissions`, verify the signed-in user is authenticated in Firebase Auth and that Firestore allows reads to `divisions/{divisionId}/levels/{levelId}` for that user. Reads are allowed only for app admins, users whose `users/{uid}.divisionId` matches the division, or users present in that division's `leaderIds`/`playerIds` roster.

## Seasons, division levels, and CSV exports

Doubles play is available in any division: pick Doubles when proposing a match (web reads it from the selected division level; mobile offers a Singles/Doubles toggle in the proposal modal), then choose a partner and both opponents. Team standings are kept per fixed partnership — a team is the sorted pair of its members' user ids, so no team registration step is needed — and appear under the Doubles toggle on the standings screens. Round-robin scheduling remains singles-only.

Doubles ranking and head-to-head document IDs are opaque implementation details. Read `playerIds`, `seasonId`, and `divisionLevelId` from document fields rather than splitting an ID. After deploying a release that changes the ID encoding or ranking bucket scheme, run the existing admin ranking recalculation once for each affected division; recalculation writes the canonical documents and prunes superseded IDs.

Division leaders can use the Admin screen in both the web and mobile apps to document season-specific division levels. Seasons use canonical IDs such as `spring-2026` and `fall-2026`, and levels record the season, skill level, singles/doubles match type, optional description, ranking flag, and active flag under `divisions/{divisionId}/levels`.

On the web, `/admin` picks the season once in the page header and scopes the whole page to it. Division levels live on the **Divisions** tab; the roster, player creation, and division assignment live on the **Roster** tab; the round-robin scheduler, reported-message queue, ranking repair, and CSV exports live on the **Tools** tab.

Assigning a player to a division level calls `upsertDivisionMembership`, which requires a level. Moving a player back to "Unassigned", or removing them from a season on the roster, calls `removeDivisionMembership`, which marks the season's rostered membership documents (`active` and `waitlisted`) `status: 'removed'` rather than deleting them. Deploy `removeDivisionMembership` alongside a release that ships this admin page, or both actions fail with `functions/not-found`; it is exported from `firebase/src/targetedDeployIndex.ts` and listed in `.github/workflows/deploy-firebase-function.yml`, so the targeted deploy workflow ships it. Adding a callable means adding it in **three** places: the export in `targetedDeployIndex.ts`, and both the `FILTERS` and `DEPLOY_FUNCTIONS` lists in the workflow. The workflow's "verify deploy filters exist in targeted bundle" step only checks the names it is given, so a function missing from the lists passes CI and then fails in production with `functions/not-found`.

Removing a player who holds no membership in any other season of the division also takes them out of `divisions.playerIds` and clears their `users/{uid}.divisionId`. Without that the roster, which is built from both, would re-render them immediately as an unassigned row.

The Admin screen's Tools tab exposes CSV export actions for match results and ranking rows. CSV generation runs through the protected `exportDivisionCsv` Cloud Function so exports consistently enforce division-leader/admin permissions and can be shared from mobile or downloaded from web.
