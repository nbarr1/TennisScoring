# Dependency Policy

This workspace uses one dependency lockfile (`pnpm-lock.yaml`) and should be
installed with `pnpm install --frozen-lockfile` in CI. The root workspace runs on
Node 22 to match the Firebase Functions runtime and `package.json` engines.

Most TypeScript packages intentionally track the root `typescript@^6.0.0` line.
The Expo 51 mobile app remains pinned to `typescript@~5.3.3` until the Expo/React
Native toolchain is validated against a newer compiler. When upgrading Expo or
React Native, re-test mobile typechecking before aligning it with the root
TypeScript version.

Firebase Functions build tooling must be declared directly in `firebase/package.json`
when invoked by package scripts; do not rely on transitive binaries from other
workspace packages.
