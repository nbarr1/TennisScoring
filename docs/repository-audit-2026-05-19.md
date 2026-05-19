# Repository Audit — 2026-05-19 (Updated after remediation)

This audit was completed retroactively against the standards in `AGENT_CONTEXT.md`, then rerun after remediation actions.

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
- `pnpm typecheck` (initial baseline run)
- Remediation updates:
  - Added `google-services.json` ignore coverage in `.gitignore`
  - Fixed `apps/web` TypeScript nullability issue in match start handler
  - Removed duplicate style object keys in `apps/web/app/matches/page.tsx`
  - Added `.nvmrc` with Node 22 for local runtime standardization
  - Added `check:firebase-rules` script with CI enforcement step
- `pnpm check:firebase-rules`
- `pnpm --filter @tennis/firebase-functions test:rules` (environment-limited in this runner due registry access)
- `pnpm typecheck` (post-remediation rerun)

## Updated Findings Summary

### 1) Authentication & Permissions (AGENT_CONTEXT Rule 1)
**Status:** Compliant with guardrail enforcement in place.

- Firestore and Storage rules are not globally open and include role- and membership-based checks; no `allow read, write: if true` anti-pattern found.
- Callable Cloud Functions consistently enforce `request.auth` checks before privileged operations.
- Administrative behavior is tied to user role checks (admin/app_developer) rather than broad public access.

**Recommendation:** Keep the new CI rules guard and add emulator-based allow/deny behavior tests as the next hardening increment.

### 2) Dependency & Version Management (AGENT_CONTEXT Rule 2)
**Status:** Compliant with one environment caveat.

- Repository is consistently using pnpm and has a single lockfile (`pnpm-lock.yaml`), which supports deterministic installs.
- Typecheck now passes across all packages.
- CI already uses Node 22 and local standardization is now codified with a repository `.nvmrc` set to `22`.
- This execution environment is still running Node 20.20.2, so engine warnings remain in this run only.

**Action Needed:** Ensure contributors and local automation adopt `.nvmrc` / Node 22 consistently.

### 3) Version Control & Secrets Hygiene (AGENT_CONTEXT Rule 3)
**Status:** Remediated.

- `.gitignore` includes `GoogleService-Info.plist`, `.env` variants, and now includes `google-services.json` ignore coverage.

### 4) Cross-Platform Consistency (AGENT_CONTEXT Rule 4)
**Status:** Structurally aligned.

- Repository includes explicit multi-platform structure (web, mobile, Firebase, wearables) and centralized shared packages (`@tennis/shared`, `@tennis/firebase-client`) that support model/API consistency.
- README documents shared contract expectations for shared domain logic.

### 5) Debugging & Completion Gate (AGENT_CONTEXT Rules 5 & 7)
**Status:** Improved; compile gate restored.

- `pnpm typecheck` now succeeds, including `apps/web`, after resolving:
  1. `'match' is possibly 'null'` in `app/matches/[id]/page.tsx`
  2. Duplicate object literal property names in `app/matches/page.tsx`

## Retroactive Compliance Assessment (Post-remediation)

- **Compliant areas:**
  - Role-aware security rules and authenticated callable-function patterns
  - Monorepo shared-contract architecture
  - Secrets hygiene for Firebase mobile config ignore patterns
  - Compile gate (`pnpm typecheck`)
  - Baseline Firebase rules guard check in CI (`pnpm check:firebase-rules`)
  - Emulator-based Firebase rules smoke-test step wired into CI (`pnpm --filter @tennis/firebase-functions test:rules`)
- **Remaining at-risk area:**
  1. Current smoke tests validate unauthenticated deny paths only; richer role-based allow/deny matrix still needs expansion

## Prioritized Remediation Plan (Updated)
1. **Near-term:** Expand emulator-based rules tests to include authenticated role matrix (player/leader/admin allow+deny paths).
2. **Ongoing:** Preserve compile gate by keeping `pnpm typecheck` green in PR checks.
3. **Ongoing:** Enforce Node 22 usage in local developer environments using `.nvmrc`.

