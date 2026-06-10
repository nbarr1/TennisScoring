# Production Release Readiness

**Current stable baseline:** `1.0.1`  
**Status:** stable release checklist  
**Last reviewed:** 2026-06-10

## Release readiness summary

The repository is considered stable and releasable when the required automated gates pass and environment-specific credentials are configured outside source control. This document is the current stable release checklist.

## Required automated checks

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

## Environment checks

- Confirm web `NEXT_PUBLIC_FIREBASE_*` variables target the intended Firebase project.
- Confirm mobile `EXPO_PUBLIC_FIREBASE_*` variables target the intended Firebase project.
- Confirm Firebase deploy workflows use the intended `FIREBASE_PROJECT_ID`.
- Confirm `GITHUB_TOKEN` exists in Firebase Secret Manager and can create feedback issues in the configured repository.
- Confirm EAS profiles have required Expo, Android, Apple, and Firebase credentials.
- Confirm web auth cookie secrets are set for the deployment environment.

## Manual smoke tests

- Login and logout on web and mobile.
- Tutorial onboarding and division onboarding.
- Division creation and invite-code join.
- Match proposal, acceptance/decline, live scoring, completion, report submission, confirmation, dispute, and resolution.
- Messaging and notification-relevant flows.
- Feedback submission through the Cloud Function.
- Profile edit and availability validation.
- Admin/division-leader functions that are enabled for the release environment.

## Rollback expectations

- Web: redeploy the previous Vercel build or revert the release commit.
- Firebase Functions: redeploy the previous targeted bundle or revert the Functions/shared change and redeploy.
- Rules/indexes: restore the previous rules/indexes from version control and deploy them.
- Mobile: submit a patched EAS build or roll back distribution according to store/internal distribution policy.

## Documentation gate

Any release that changes commands, versions, Firebase data contracts, environment variables, deploy paths, quality gates, or user-visible workflows must update `README.md`, `SETUP.md`, `VERSION_1_BASELINE.md`, and the relevant file under `docs/`.
