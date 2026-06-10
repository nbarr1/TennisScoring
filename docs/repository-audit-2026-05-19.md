# Repository Audit Summary

**Current stable baseline:** `1.0.1`  
**Status:** historical audit updated for current state  
**Last reviewed:** 2026-06-10

## Current repository condition

The repository is a stable pnpm/Turborepo monorepo with web, mobile, Firebase Functions, Firebase rules, shared domain packages, Firebase client utilities, and wearable companion code. The previous audit findings have been converted into ongoing quality gates and operational documentation.

## Current validation commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

## Active governance

- CI runs typecheck and lint for PRs/pushes.
- Shared tests run when shared/root files change.
- Firebase audit/rules checks run when Firebase/shared files change.
- Firebase safety guard blocks broad rules grants in PRs.
- CodeQL runs on push, PR, and weekly schedule.
- Dependency policy is maintained in `docs/dependency-policy.md`.

## Historical note

This file no longer tracks an open remediation list. It remains as a point-in-time audit summary and points to current gates for ongoing maintenance.
