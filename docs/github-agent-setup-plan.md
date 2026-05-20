# GitHub Agent Setup Plan (TennisScoring)

This plan proposes concrete GitHub automation “agents” for this monorepo and maps each one to file locations, triggers, and protections.

## Goals

- Keep feedback fast for contributors.
- Enforce Firebase safety checks before merge/deploy.
- Reduce manual triage/review work.
- Make production releases predictable and auditable.

## Current Baseline

Existing workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/eas-build.yml`
- `.github/workflows/deploy-firebase-function.yml`

The plan below extends these with additional workflows and repo settings.

---

## 1) CI Agent (enhance existing)

### Workflow
- File: `.github/workflows/ci.yml` (existing; update)

### Changes
- Add `concurrency` to cancel older runs on same branch/PR.
- Split checks into separate jobs:
  - `lint_typecheck`
  - `shared_tests`
  - `firebase_rules_tests`
- Add path filters at job level using `dorny/paths-filter` so only relevant jobs run.
- Upload junit/artifacts for failed tests for easier debugging.

### Trigger
- `pull_request` to `main`
- `push` to `main` and long-lived branches only

### Required status checks
- `lint_typecheck`
- `firebase_rules_tests`
- `shared_tests`

---

## 2) Mobile Build Agent (EAS)

### Workflow
- File: `.github/workflows/eas-build.yml` (existing; update)

### Changes
- Trigger only when `apps/mobile/**` or shared package files change.
- Add build matrix for profile/channel (`preview`, `production`) if desired.
- Prevent production build on PRs from forks.
- Upload build metadata (commit SHA, profile, artifact URL) to run summary.

### Trigger
- `pull_request` for preview builds (optional)
- `push` to `main` for production candidate builds
- `workflow_dispatch` for manual rebuilds

---

## 3) Firebase Deploy Agent (guarded deploy)

### Workflow
- File: `.github/workflows/deploy-firebase-function.yml` (existing; update)

### Changes
- Deploy only when `apps/firebase-functions/**` (or your actual functions path) changes.
- Add explicit dependency on successful CI checks.
- Use GitHub Environment protection:
  - `staging` auto-deploy on merge to `main`
  - `production` requires manual approval
- Add pre-deploy `firebase emulators:exec` or existing smoke rules checks.

### Trigger
- `push` to `main`
- `workflow_dispatch` for manual promotion

---

## 4) Security Agent (new)

### Workflows
- Add `.github/workflows/codeql.yml`
- Enable Dependabot config at `.github/dependabot.yml`

### CodeQL scope
- JavaScript/TypeScript analysis
- Weekly scheduled scans + PR scans

### Dependabot scope
- `github-actions` ecosystem weekly
- `npm` ecosystem grouped updates for monorepo workspaces

### Repo settings
- Enable secret scanning and push protection.
- Enable Dependabot security updates.

---

## 5) PR Review Agent (new)

### Workflow
- Add `.github/workflows/pr-policy.yml`

### Responsibilities
- Validate PR template checklist completion.
- Fail if critical areas changed without tests:
  - `packages/shared/**`
  - Firebase rules/functions
- Enforce minimum reviewers for sensitive paths.
- Comment with summary of touched domains (`web/mobile/firebase/shared`).

### Trigger
- `pull_request` events: `opened`, `synchronize`, `edited`, `ready_for_review`

### Supporting files
- Add/maintain `.github/pull_request_template.md`
- Add `CODEOWNERS`

---

## 6) Triage Agent (new)

### Workflow
- Add `.github/workflows/triage.yml`

### Responsibilities
- Auto-label issues/PRs by path/title keywords.
- Auto-assign reviewers based on labels/paths.
- Mark stale issues after inactivity with warning and delayed close.

### Trigger
- `issues` and `pull_request_target`
- Scheduled daily stale run

---

## 7) Firebase Safety Guard Agent (new, high priority)

### Workflow
- Add `.github/workflows/firebase-safety-guard.yml`

### Responsibilities
- Diff-check Firebase rules files.
- Fail when dangerous broad-permission patterns are introduced.
- Require emulator smoke test pass before merge if rules changed.

### Trigger
- `pull_request` where Firebase config/rules files are touched

### Initial patterns to block (examples)
- `allow read, write: if true`
- wildcard broad writes without auth constraints

---

## Branch Protection & Repository Rules

Configure branch protection for `main`:

- Require pull request before merge.
- Require status checks to pass:
  - CI checks (`lint_typecheck`, `firebase_rules_tests`, `shared_tests`)
  - `firebase-safety-guard`
  - `codeql` (on default branch)
- Require up-to-date branch before merge.
- Require at least 1–2 approvals.
- Dismiss stale approvals when new commits are pushed.
- Restrict force pushes and branch deletion.

---

## Suggested Implementation Order (1 week)

1. **Day 1–2:** Harden CI and branch protection.
2. **Day 2–3:** Add Firebase safety guard and deploy gating.
3. **Day 3–4:** Add CodeQL + Dependabot + secret scanning settings.
4. **Day 4–5:** Add PR policy + CODEOWNERS.
5. **Day 5:** Add triage workflow and tune labels.

---

## Acceptance Criteria

- Every PR to `main` receives deterministic CI checks scoped to changed areas.
- Firebase rules changes cannot merge without explicit safety tests.
- Production deploys require controlled promotion and approvals.
- Security scanning and dependency updates are automated.
- Reviewer routing and labeling are automated with minimal maintainer overhead.
