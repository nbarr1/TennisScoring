# Dependency Policy

This workspace uses one dependency lockfile (`pnpm-lock.yaml`) and should be
installed with `pnpm install --frozen-lockfile` in CI. The root workspace runs on
Node 22 to match the Firebase Functions runtime and `package.json` engines.

All workspace packages, including the mobile app, track the root `typescript@^6.0.0`
line (`apps/mobile` pins `~6.0.3`). The mobile app was previously held back on
`typescript@~5.3.3` while on Expo 51; it was re-tested and aligned to the root
TypeScript version as part of the Expo 51 → 55 / React Native 0.74 → 0.83 upgrade.
Re-test mobile typechecking the same way after any future Expo or React Native
major upgrade before assuming the root TypeScript version still applies.

Firebase Functions build tooling must be declared directly in `firebase/package.json`
when invoked by package scripts; do not rely on transitive binaries from other
workspace packages.
