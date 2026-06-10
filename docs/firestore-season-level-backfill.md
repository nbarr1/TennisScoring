# Firestore Season/Level Backfill

**Current stable baseline:** `1.0.1`  
**Status:** active maintenance procedure  
**Last reviewed:** 2026-06-10

## Purpose

Use the season/level backfill only when existing division membership or ranking data needs to be normalized to the current season/level model.

## Commands

Inspect usage:

```bash
pnpm backfill:season-level -- --help
```

Build the corresponding targeted Functions bundle before deploy work:

```bash
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

Validate Firebase rules for affected data paths:

```bash
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
```

## Procedure

1. Confirm the target Firebase project and environment.
2. Run a dry run when supported by the script options.
3. Review affected division IDs, season values, level values, and membership counts.
4. Run the backfill against only the intended scope.
5. Recalculate rankings if historical match or membership changes affect ranking output.
6. Keep logs with the maintenance record.

## Safety notes

- Do not run backfills from a shell configured for production unless the production maintenance window is approved.
- Do not mix staging and production service account credentials.
- Update shared types, Functions, rules, web, and mobile together if the season/level contract changes.
