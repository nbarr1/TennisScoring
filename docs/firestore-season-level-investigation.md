# Firestore Season/Level Investigation

**Current stable baseline:** `1.0.1`  
**Status:** resolved and operationalized  
**Last reviewed:** 2026-06-10

## Current state

Season and division-level data is part of the stable data model. The repository includes shared division season/level types, Firebase Functions for `upsertDivisionLevel`, `upsertDivisionMembership`, and `backfillDivisionSeasonLevel`, plus a root maintenance script for controlled backfills.

## Operational commands

```bash
pnpm backfill:season-level -- --help
pnpm --filter @tennis/firebase-functions build:targeted-deploy
pnpm --filter @tennis/firebase-functions test:rules
```

## Data contract expectations

- Keep season and level values consistent across shared types, Firebase Functions, web onboarding/admin flows, mobile onboarding/admin flows, and rules.
- Run backfills only against the intended Firebase project.
- Preserve dry-run or execution logs with the release/maintenance record when changing historical division membership data.

## Historical note

This file formerly tracked investigation work. There is no open investigation attached to the current stable baseline; it now documents the resolved operating model.
