# GitHub Automation Setup

**Current stable baseline:** `1.0.1`  
**Status:** current workflow reference  
**Last reviewed:** 2026-06-10

## Active GitHub automation

- `ci.yml` runs typecheck and lint on pushes/PRs, shared tests when shared/root files change, and Firebase audit/rules checks when Firebase/shared files change.
- `firebase-safety-guard.yml` blocks broad Firebase rules grants on PRs and runs emulator rules smoke tests.
- `codeql.yml` runs JavaScript/TypeScript CodeQL analysis on push, PR, and weekly schedule.
- `eas-build.yml` builds Android preview artifacts through EAS for configured events/profiles.
- `deploy-firebase-function.yml` builds and deploys the targeted Firebase Functions bundle to the staging environment.
- `.github/pull_request_template.md` lists the current validation checklist.

## Required repository secrets and variables

- `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID` for Firebase deploy workflows.
- Firebase public client configuration secrets/variables for EAS builds.
- Expo/EAS secrets required by EAS cloud builds.
- `GITHUB_TOKEN` in Firebase Secret Manager for feedback issue creation; repository variables configure owner/repo/labels/API URL.

## Maintenance expectations

- Keep GitHub Actions on Node `22` and pnpm `9.15.5` unless the workspace baseline changes.
- Keep EAS profile Node/pnpm values aligned with Expo compatibility requirements.
- Update docs and PR template when validation gates or deploy paths change.

## Historical note

This file previously described setup planning. The workflows are now present in the repository and this document serves as the current automation reference.
