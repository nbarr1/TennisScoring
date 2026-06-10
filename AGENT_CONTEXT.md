# Agent Context

**Current stable baseline:** `1.0.1`  
**Last reviewed:** 2026-06-10

This repository is a stable, releasable pnpm/Turborepo monorepo. Treat documentation, code, Firebase rules, and shared contracts as production-impacting unless the task says otherwise.

## Repository map

- `apps/web` — Next.js `16.2.6` web app with React `19.2.6`.
- `apps/mobile` — Expo `55` app with React Native `0.83.1` and React `19.2.0`.
- `firebase` — Firebase Functions, Firestore rules/indexes, Storage rules, and emulator config.
- `packages/shared` — canonical shared TypeScript types, scoring/ranking engines, profile utilities, status metadata, tips, and tests.
- `packages/firebase-client` — Firebase SDK config, typed collection helpers, callable wrappers, and React hooks.
- `docs` — operational documentation and historical audit summaries updated for the current baseline.

## Required development checks

Use the narrowest relevant checks during development and the full gate for release-impacting changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

## Cross-platform contract rules

- Shared match, division, user, invite, message, feedback, and ranking types belong in `packages/shared`.
- Data model changes must be reflected in web, mobile, Functions, rules, and wearable code where applicable.
- Cloud Function exported names are API contracts; update all callers when changing them.
- Firestore rules must be checked before assuming a data-access bug is only client-side.
- Timestamp fields should use Firestore timestamp values rather than arbitrary strings.

## Security rules

- Never commit `.env` files, service-account keys, GitHub tokens, Apple credential files, Android signing material, or production Firebase admin credentials.
- GitHub feedback credentials belong only in Firebase Secret Manager as `GITHUB_TOKEN`.
- Do not add secrets to `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables.
- Keep role checks consistent between Functions, client UI affordances, and Firebase rules.
- Avoid broad Firebase rules grants; run rules guards and emulator smoke tests for rules changes.

## Dependency rules

- Use pnpm and update manifests plus `pnpm-lock.yaml` together.
- Do not manually edit lockfile conflicts; regenerate with pnpm.
- Keep Expo, React Native, React, Firebase, and TypeScript versions compatible with their ecosystems.
- See `docs/dependency-policy.md` before dependency upgrades.

## UX rules

- Provide accessible names for controls.
- Preserve adequate touch target sizes and WCAG AA contrast.
- Avoid status-by-color-only designs.
- Include visible loading/error/empty states for user-facing async flows.

## Documentation rules

Update `README.md`, `SETUP.md`, `VERSION_1_BASELINE.md`, and the relevant file in `docs/` whenever commands, versions, environment variables, data contracts, deploy paths, or release gates change.
