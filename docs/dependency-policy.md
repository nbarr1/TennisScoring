# Dependency Policy

**Current stable baseline:** `1.0.1`  
**Last reviewed:** 2026-06-10

## Supported runtime and package manager

- Workspace scripts and Firebase Functions target Node.js `22`.
- The workspace package manager is `pnpm@9.15.5`.
- EAS build profiles pin Node `20.19.2` and pnpm `9.15.5` for Expo cloud builds.

## Current framework baselines

- Next.js `16.2.6` and React `19.2.6` for `@tennis/web`.
- Expo `55`, React Native `0.83.1`, and React `19.2.0` for `@tennis/mobile`.
- Firebase Web SDK `12.13.0` and Firebase Admin SDK `13.10.0` across workspace packages.
- Firebase Functions SDK `7.2.5` in `@tennis/firebase-functions`.
- TypeScript `6.0.3`.

## Update rules

- Update dependencies through `package.json` plus `pnpm-lock.yaml` together.
- Keep Firebase packages compatible across web, mobile, shared client code, and Functions.
- Keep React, React DOM, React Native, Expo, and Expo modules aligned with the Expo SDK compatibility matrix before changing mobile dependencies.
- For framework or runtime upgrades, update `README.md`, `SETUP.md`, this file, and any affected CI/EAS workflow configuration.
- Do not manually edit lockfile conflicts; resolve package manifests first and regenerate the lockfile with pnpm.

## Security audit gates

Run for release-impacting dependency updates:

```bash
pnpm audit --audit-level=high
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For Firebase-impacting changes also run:

```bash
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

The CI Firebase job falls back to OSV Scanner when `pnpm audit` does not produce a usable result.

## Dependency hygiene

- Avoid adding new runtime dependencies when the same outcome can be achieved safely with existing packages.
- Prefer maintained packages with clear release notes and TypeScript support.
- Do not add install scripts or native build dependencies without documenting the reason.
- Keep secrets out of dependency configuration, `.npmrc`, and build logs.
