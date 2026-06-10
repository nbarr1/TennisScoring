# TennisScoring Setup

This guide reflects the current stable `1.0.1` repository state.

## Prerequisites

- Node.js `22` for local workspace scripts and Firebase Functions builds.
- pnpm `9.15.5` or newer within the `9.x` line.
- Firebase CLI for emulator, rules, and Functions workflows.
- EAS CLI only when building Expo apps in the cloud.
- GitHub, Firebase, Apple, and Android credentials only for the deploy/build paths that need them.

## Install

```bash
corepack enable
corepack prepare pnpm@9.15.5 --activate
pnpm install --frozen-lockfile
```

## Validate the workspace

Run these checks before merging release-impacting work:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Useful targeted checks:

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
pnpm --filter @tennis/web build
pnpm --filter @tennis/mobile typecheck
```

## Web app

The web app lives in `apps/web` and uses Next.js `16.2.6` with React `19.2.6`.

```bash
pnpm --filter @tennis/web dev
pnpm --filter @tennis/web build
pnpm --filter @tennis/web start
```

Required public Firebase variables use the `NEXT_PUBLIC_FIREBASE_*` prefix. Configure auth-edge cookie secrets for authenticated routes and API endpoints.

## Mobile app

The mobile app lives in `apps/mobile` and uses Expo `55`, React Native `0.83.1`, and React `19.2.0`.

```bash
pnpm --filter @tennis/mobile start
pnpm --filter @tennis/mobile android
pnpm --filter @tennis/mobile ios
```

Required public Firebase variables use the `EXPO_PUBLIC_FIREBASE_*` prefix. EAS profiles live in `apps/mobile/eas.json` and build shared packages before native builds.

## Firebase

Firebase source, rules, indexes, and emulator config live in `firebase`.

```bash
pnpm --filter @tennis/firebase-functions build
pnpm --filter @tennis/firebase-functions build:targeted-deploy
pnpm --filter @tennis/firebase-functions test:rules
pnpm check:firebase-rules
```

The targeted deploy bundle is built from `firebase/src/targetedDeployIndex.ts`. Full Function exports are available from `firebase/src/index.ts` for manual full backend deployments.

## Feedback integration

Feedback is submitted through the `submitFeedback` Cloud Function. Keep GitHub tokens out of web/mobile code. Store the issue-creation token in Firebase Secret Manager as `GITHUB_TOKEN`, then configure:

```bash
GITHUB_OWNER="your-org-or-user"
GITHUB_REPO="your-feedback-repo"
GITHUB_FEEDBACK_LABELS="feedback"
GITHUB_API_URL="https://api.github.com"
```

See `firebase/DEPLOYMENT.md` for IAM and deploy preflight details.

## Data backfills

Repository scripts are available for controlled maintenance:

```bash
pnpm backfill:profiles -- --help
pnpm backfill:season-level -- --help
```

Run backfills only against the intended Firebase project and keep dry-run output with the release or maintenance record.

## Secrets policy

Do not commit `.env` files, service account keys, GitHub tokens, Apple credential files, Android signing material, or production Firebase admin credentials. Public Firebase web/mobile API keys may exist in environment configuration, but restrict API keys and project access in Google Cloud/Firebase settings.
