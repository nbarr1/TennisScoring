# Quality Gates

**Current stable baseline:** `1.0.1`  
**Status:** active release checklist  
**Last reviewed:** 2026-06-10

This file is the current quality-gate reference for releasable changes.

## Required gates for release-impacting work

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Firebase gates

Run when Firebase Functions, Firestore rules, Storage rules, indexes, shared backend contracts, or auth-sensitive behavior changes:

```bash
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

## Shared domain gates

Run when scoring, rankings, profile utilities, shared types, match status metadata, or tips change:

```bash
pnpm --filter @tennis/shared test -- --runInBand
pnpm --filter @tennis/shared typecheck
pnpm --filter @tennis/shared build
```

## Web gates

Run when `apps/web`, `packages/firebase-client`, or web-facing environment contracts change:

```bash
pnpm --filter @tennis/web typecheck
pnpm --filter @tennis/web lint
pnpm --filter @tennis/web build
```

## Mobile gates

Run when `apps/mobile`, mobile route code, native modules, or Expo/EAS configuration changes:

```bash
pnpm --filter @tennis/mobile typecheck
pnpm --filter @tennis/mobile lint
pnpm --filter @tennis/mobile build:android
pnpm --filter @tennis/mobile build:ios
```

EAS build commands require configured credentials and are not expected to succeed in a generic local container.

## Manual release checks

- Verify the target Firebase project is not accidentally production for staging/test deploys.
- Confirm `GITHUB_TOKEN` exists in Firebase Secret Manager before deploying feedback changes.
- Confirm web and mobile Firebase public variables point to the intended project.
- Smoke test login, onboarding, match creation/scoring, report submission, messaging, feedback, and profile updates.
- Review Firebase rules diffs for broad read/write grants.
- Update documentation when commands, versions, env vars, release gates, or deploy targets change.
