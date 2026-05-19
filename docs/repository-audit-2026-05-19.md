# Repository Audit — 2026-05-19

This audit was completed retroactively against the standards in `AGENT_CONTEXT.md`.

## Scope
- Monorepo-wide architecture and policy alignment review.
- Firebase auth and permission posture review (`firestore.rules`, `storage.rules`, and callable function patterns).
- Dependency/version and branch hygiene checks from repository manifests and ignore patterns.
- Baseline compile verification through `pnpm typecheck`.

## Commands Run
- `rg --files | rg 'AGENTS\\.md|AGENT_CONTEXT\\.md'`
- `cat AGENT_CONTEXT.md`
- `sed -n '1,220p' README.md`
- `sed -n '1,220p' firebase/firestore.rules`
- `sed -n '1,220p' firebase/storage.rules`
- `sed -n '1,220p' .gitignore`
- `rg "onCall\\(|https\\.onCall|request\\.auth|context\\.auth|allow read, write: if true|Editor|Owner" firebase/src -n`
- `pnpm typecheck`

## Findings Summary

### 1) Authentication & Permissions (AGENT_CONTEXT Rule 1)
**Status:** Mostly compliant with one follow-up recommendation.

- Firestore and Storage rules are not globally open and include role- and membership-based checks; no `allow read, write: if true` anti-pattern found.
- Callable Cloud Functions appear to consistently enforce `request.auth` checks before privileged operations.
- Administrative behavior is tied to user role checks (admin/app_developer) rather than broad public access.

**Recommendation:** Add an explicit periodic rules regression test suite (emulator-based) if not already present, to prevent accidental rule drift.

### 2) Dependency & Version Management (AGENT_CONTEXT Rule 2)
**Status:** Partially compliant.

- Repository is consistently using pnpm and has a single lockfile (`pnpm-lock.yaml`), which supports deterministic installs.
- Typecheck execution reports Node engine mismatch (`wanted node 22`, running node 20.20.2), indicating local/runtime drift from declared expectations.

**Action Needed:** Align CI and local dev runtime to Node 22 where the project declares that requirement.

### 3) Version Control & Secrets Hygiene (AGENT_CONTEXT Rule 3)
**Status:** Needs correction.

- `.gitignore` includes `GoogleService-Info.plist` and several `.env` variants, which is good.
- `.gitignore` does **not** currently include `google-services.json`, despite AGENT_CONTEXT guidance that Android Firebase config should be excluded from source control.

**Action Needed (high priority):** Add `google-services.json` ignore coverage (root and/or Android path-specific patterns).

### 4) Cross-Platform Consistency (AGENT_CONTEXT Rule 4)
**Status:** Structurally aligned.

- Repository includes explicit multi-platform structure (web, mobile, Firebase, wearables) and centralized shared packages (`@tennis/shared`, `@tennis/firebase-client`) that support model/API consistency.
- README documents shared contract expectations for shared domain logic.

### 5) Debugging & Completion Gate (AGENT_CONTEXT Rules 5 & 7)
**Status:** Not green.

- `pnpm typecheck` currently fails in `apps/web` with TypeScript errors, so the “code compiles without errors” gate is not satisfied.

**Current blocking errors from typecheck:**
1. `app/matches/[id]/page.tsx(127,43): 'match' is possibly 'null'`.
2. `app/matches/page.tsx(1579,3): object literal has duplicate property name`.
3. `app/matches/page.tsx(1610,3): object literal has duplicate property name`.

## Retroactive Compliance Assessment

- **Compliant areas:** Role-aware security rules, authenticated callable-function patterns, monorepo shared-contract architecture.
- **Non-compliant/at-risk areas:**
  1. Secret/config ignore coverage gap for `google-services.json`.
  2. Runtime mismatch with declared Node engine.
  3. Failing compile gate in web typecheck.

## Prioritized Remediation Plan
1. **Immediate:** Update `.gitignore` to include `google-services.json` patterns.
2. **Immediate:** Fix the three `apps/web` TypeScript errors and re-run `pnpm typecheck`.
3. **Near-term:** Standardize Node 22 in local and CI toolchains.
4. **Near-term:** Add/confirm Firebase rules regression tests in emulator CI workflow.

