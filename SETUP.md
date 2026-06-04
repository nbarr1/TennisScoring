# TennisScoring Setup Guide

This guide reflects the Version 1.0.0 baseline. The app uses Firebase email/password authentication, Firestore, Storage, Cloud Functions, Firebase Cloud Messaging, Next.js, Expo/EAS, and pnpm/Turborepo.

---

## Prerequisites

- Node.js 20+ for local web/mobile development and CI parity.
- Node.js 22 for Firebase Functions runtime/deploy parity.
- pnpm 9.15.5 or newer.
- Firebase CLI (`npm i -g firebase-tools`) for emulators, rules, and Functions deployment.
- EAS CLI (`npm i -g eas-cli`) for mobile cloud builds.
- Android Studio for Android and Wear OS builds.
- Xcode 15+ and Apple developer tooling for iOS/Apple Watch builds.
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

NEXTAUTH_SECRET="replace-with-a-long-random-string"
NEXTAUTH_URL="http://localhost:3000"

FIREBASE_ADMIN_PROJECT_ID=""
FIREBASE_ADMIN_CLIENT_EMAIL=""
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`NEXTAUTH_SECRET` signs the `tennis-auth` httpOnly session cookie used by `next-firebase-auth-edge` middleware. Do not reuse the development fallback value in production.

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
APP_BASE_URL="https://your-web-domain.example"
ALLOWED_EMAIL_DOMAIN="" # optional; set to a corporate domain to restrict signup/invites where functions enforce it
GITHUB_OWNER="your-github-org-or-user"
GITHUB_REPO="your-feedback-repo"
GITHUB_API_URL="https://api.github.com"
GITHUB_FEEDBACK_LABELS="feedback"
```

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

Deploy Firestore rules/indexes and Storage rules from the `firebase` directory or repository root with Firebase CLI:

```bash
firebase deploy --only firestore
firebase deploy --only storage
```

Build Functions locally:

```bash
pnpm --filter @tennis/firebase-functions build
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

Deploy Functions manually:

```bash
pnpm --filter @tennis/firebase-functions deploy
```

See [firebase/DEPLOYMENT.md](./firebase/DEPLOYMENT.md) for IAM, Secret Manager, and targeted GitHub Actions deploy details.

---

## 6. Web Deployment

The web app is a standard Next.js app under `apps/web`.

Recommended deployment steps:

1. Build shared packages first when your platform does not automatically run Turbo dependency builds.
2. Set all `NEXT_PUBLIC_FIREBASE_*`, `NEXTAUTH_*`, and `FIREBASE_ADMIN_*` variables in the hosting provider.
3. Configure Firebase Auth authorized domains for the deployed URL.
4. Run:

```bash
pnpm --filter @tennis/web build
pnpm --filter @tennis/web start
```

The repository includes `apps/web/vercel.json` for Vercel output/build behavior.

---

## 7. Mobile and Wearable Builds

Mobile app metadata currently identifies v1 as:

- Expo version: `1.0.0`
- iOS build number: `1`
- Android version code: `1`

Build with EAS:

```bash
pnpm --filter @tennis/mobile build:android
pnpm --filter @tennis/mobile build:ios
```

The `apps/mobile/eas.json` profiles run this prebuild command before cloud builds:

```bash
pnpm --filter @tennis/shared build && pnpm --filter @tennis/firebase-client build
```

Wear OS preview APK builds use the `wear-preview` EAS profile. The GitHub Actions `EAS Build (Android APKs)` workflow can build either the mobile APK or Wear OS APK through the `target` input.

---

## 8. GitHub Actions and CI/CD

### CI

`.github/workflows/ci.yml` runs on pushes to `main`/`claude/**` and pull requests to `main`:

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level=high
pnpm typecheck
pnpm lint
pnpm --filter @tennis/shared test
```

### Targeted Firebase Functions deploy

`.github/workflows/deploy-firebase-function.yml` runs on pushes to `main` that touch Firebase/shared/function workflow paths and on manual dispatch. It builds the targeted Functions bundle, validates GitHub feedback configuration, writes Firebase params, and deploys selected Functions.

Required GitHub Actions secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

Optional/recommended GitHub Actions variables:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_API_URL`
- `GITHUB_FEEDBACK_LABELS`

### EAS Android APK workflow

`.github/workflows/eas-build.yml` is manually triggered and requires:

- `EXPO_TOKEN`
- Firebase public config secrets mapped into `EXPO_PUBLIC_FIREBASE_*` environment variables.

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

Division leaders can use the Admin screen in both the web and mobile apps to document season-specific division levels. Seasons use canonical IDs such as `spring-2026` and `fall-2026`, and levels record the season, skill level, singles/doubles match type, optional description, ranking flag, and active flag under `divisions/{divisionId}/levels`.

The same Admin screen exposes CSV export actions for match results and ranking rows. CSV generation runs through the protected `exportDivisionCsv` Cloud Function so exports consistently enforce division-leader/admin permissions and can be shared from mobile or downloaded from web.
