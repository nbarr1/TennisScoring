# Claude / Agent Instructions

**Current stable baseline:** `1.0.1`  
**Last reviewed:** 2026-06-10

This file mirrors the active repository guidance for AI coding agents.

## Current repository state

TennisScoring is stable and releasable. It contains:

- Next.js web app in `apps/web`.
- Expo React Native mobile app in `apps/mobile`.
- Firebase Functions, rules, indexes, and emulator config in `firebase`.
- Shared domain logic in `packages/shared`.
- Firebase client utilities in `packages/firebase-client`.
- Wear OS and Apple Watch companion code under `apps/mobile`.

## Before changing code

1. Inspect the relevant files and shared contracts.
2. Check whether a change affects web, mobile, Functions, rules, shared packages, or wearables.
3. Keep data model and API contract changes synchronized across all affected platforms.
4. Do not introduce secrets or environment-specific credentials.

## Common commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

## Firebase guidance

- Verify rules and role checks before treating permission errors as client-only bugs.
- Keep callable/HTTPS Function input and output contracts documented in shared types or adjacent code.
- Do not rename exported Functions without updating every caller and deployment reference.
- Keep feedback GitHub tokens in Firebase Secret Manager only.

## Documentation guidance

If a change affects versions, setup steps, commands, release gates, environment variables, Firebase deploy behavior, or user-facing workflows, update the relevant Markdown files in the same change.

## Pull request guidance

Use `.github/pull_request_template.md` and include what changed, why, validation commands, release impact, risk level, and rollback plan.
