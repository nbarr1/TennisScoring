# Tennis League App — Setup Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- Firebase CLI (`npm i -g firebase-tools`)
- Expo CLI (`npm i -g eas-cli`)
- Xcode 15+ (for iOS / Apple Watch builds)
- Android Studio (for Android / Wear OS builds)

## 1. Firebase Project

1. Create a Firebase project at console.firebase.google.com
2. Enable **Firestore**, **Authentication**, **Storage**, **Cloud Functions**
3. In Authentication → Sign-in methods, add **OIDC provider** for PingID:
   - Provider name: PingID
   - Client ID / Secret from your PingID application
   - Issuer URL: your PingID tenant URL
4. Download `google-services.json` → `apps/mobile/android/app/`
5. Download `GoogleService-Info.plist` → `apps/mobile/ios/TennisScoring/`

## 2. Environment Variables

Copy `.env.example` to `.env.local` in each app:

```
cp .env.example apps/mobile/.env
cp .env.example apps/web/.env.local
cp .env.example firebase/.env
```

Fill in Firebase config values and PingID OIDC credentials.

**Mobile** uses `EXPO_PUBLIC_*` prefix.
**Web** uses `NEXT_PUBLIC_*` prefix.
**Firebase Functions** reads runtime configuration from Functions params/config and secrets.

Never put GitHub credentials in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables. Web and mobile feedback submissions must call the `submitFeedback` Firebase Function, and only that function may call the GitHub API. Store the GitHub token or app installation token in Functions secret storage:

```bash
firebase functions:secrets:set GITHUB_TOKEN
```

Set Cloud Functions env config:

```bash
firebase functions:config:set pingid.issuer_url="..." pingid.client_id="..."
```

## Shared Package Guidelines

`packages/shared` is the canonical workspace for cross-platform tennis domain logic. Use it for types, scoring/ranking utilities, tips, and reusable profile helpers such as availability slot updates, validation, and profile update normalization. Import these helpers from `@tennis/shared` in web, mobile, Firebase client, and Cloud Functions code instead of copying equivalent logic into each app.

The web app keeps repeated top-level navigation markup and styles in `apps/web/app/shared/AppNav.tsx`.

## 3. Install & Build

```bash
# Install all dependencies
pnpm install

# Build shared + firebase-client packages
pnpm build --filter @tennis/shared --filter @tennis/firebase-client

# Deploy Firestore rules + indexes
cd firebase && firebase deploy --only firestore

# Deploy Storage rules
firebase deploy --only storage

# Deploy Cloud Functions
firebase deploy --only functions
```

## 4. Run Locally

```bash
# Start Firebase emulators (Firestore + Auth + Functions + Storage)
cd firebase && firebase emulators:start

# In another terminal — web app
pnpm --filter @tennis/web dev

# In another terminal — mobile app (requires Expo Go or simulator)
pnpm --filter @tennis/mobile start
```

## 5. Mobile Build (EAS)

```bash
# Configure EAS project (first time)
cd apps/mobile && eas init

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## 6. Apple Watch Extension

The Watch app is a WatchKit Extension target inside the Xcode project at
`apps/mobile/ios/TennisScoring.xcworkspace`. After running `expo prebuild`:

```bash
cd apps/mobile && npx expo prebuild
```

Open the workspace in Xcode, add the `TennisScoringWatch` target, and link
`WatchSessionManager.swift` + `ScoreView.swift`. Build and run on a paired
Apple Watch simulator.

## 7. Wear OS Module

After `expo prebuild`, the Android project is at `apps/mobile/android/`.
The `:wear` Gradle module at `apps/mobile/android/wear/` builds the Wear OS APK.

```bash
cd apps/mobile/android
./gradlew :wear:assembleDebug
# Install on a paired Wear OS emulator or physical watch via Android Studio
```

## 8. PingID SSO Configuration

Register two redirect URIs in your PingID application:

- **Mobile**: `tennisleague://` (custom scheme for `expo-auth-session`)
- **Web**: `https://your-domain.com/api/auth/callback`

## 9. Web Deployment

```bash
cd apps/web && pnpm build
firebase deploy --only hosting
```

## Verification Commands

```bash
# Shared package unit tests
pnpm --filter @tennis/shared test -- --runInBand

# Full workspace type checking, linting, and tests
pnpm typecheck
pnpm lint
pnpm test
```

## Branch Cleanup (Repository Maintenance)

To identify and remove stale local branches that are already merged:

```bash
# Preview merged branches (dry run)
./scripts/cleanup-branches.sh --default-branch work

# Delete merged branches
./scripts/cleanup-branches.sh --default-branch work --delete

# Optional: prune stale remote-tracking refs first
./scripts/cleanup-branches.sh --default-branch work --remote --delete
```

> Tip: change `--default-branch` to `main`/`master` if your local default branch name differs.

## Architecture Overview

```
Expo (React Native) mobile app
  ↕ Firestore real-time listeners (onSnapshot)
  ↕ Firebase Auth (PingID OIDC)
  ↕ Cloud Functions (rankings, reports, conflict resolution)
  ↕ WatchConnectivity / Wearable Data Layer
    → Apple Watch (SwiftUI/WatchKit)
    → Galaxy Watch (Wear OS / Jetpack Compose)

Next.js web app
  ↕ Same Firebase backend
  ↕ PingID OIDC callback → Firebase custom token
  ↕ next-firebase-auth-edge session management
```

## Tiebreaker Order (Rankings)

1. Matches won
2. Sets won
3. Games won
4. Game differential (gamesWon − gamesLost)
5. Head-to-head record
