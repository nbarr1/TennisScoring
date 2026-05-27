## Executive Summary
This monorepo has a strong structural foundation (shared domain package, typed code, CI gates, and Firebase rules checks), but production readiness is blocked by multiple high-risk security and operational gaps. The most urgent issue is a fallback development cookie secret hardcoded in web middleware, which creates a predictable session signing secret whenever `NEXTAUTH_SECRET` is missing outside production. A second critical issue is that the `add-division-member` API proxy forwards whatever `Authorization` header the client supplies directly to a privileged Cloud Function endpoint, with no server-side token verification in the route itself, increasing trust-boundary risk and making abuse scenarios harder to reason about. Dependency and supply-chain visibility is incomplete because the project’s own `pnpm audit` gate currently fails in this environment (HTTP 403), meaning vulnerability data is not reliably available during this audit run. UX and accessibility quality is mixed: base navigation and metadata exist, but keyboard/focus behavior, touch-target sizing, live region announcements, and contrast compliance still require runtime verification across all user flows. SEO for the web app is only partially implemented, with global metadata configured but no evidence of per-route canonical metadata strategy or sitemap/robots artifacts in the app tree. Finally, observability and operations are under-specified: there is no explicit health/readiness endpoint for web or functions, and no clear structured logging/request-correlation standard across runtime services. Immediate remediation should prioritize session-secret hardening, auth boundary tightening for proxy routes, and restoring reliable dependency-vulnerability scanning.

## Severity Legend
CRITICAL  — Exploitable security vulnerability or data loss risk. Fix before next deployment.
HIGH      — Broken functionality or serious UX/a11y failure affecting users now.
MEDIUM    — Degraded experience, technical debt, or a risk that needs a scheduled fix.
LOW       — Best-practice deviation or polish item; fix in a future sprint.
INFO      — Observation or positive callout worth noting.

## Findings by Phase

### [HIGH] Insecure fallback cookie-signing secret in middleware
**Phase:** Phase 3 — Security Audit  
**Location:** `apps/web/middleware.ts` lines 10-11  
**Description:** Middleware silently falls back to a static development secret when `NEXTAUTH_SECRET` is absent. This creates predictable signed cookies in non-production deployments and risks accidental insecure staging deployments.  
**Evidence:**
```ts
const effectiveCookieSecret = cookieSecret ?? 'development-only-cookie-secret-do-not-use-in-prod';
```
**Recommendation:** Remove the fallback and fail closed in all environments except explicit local dev mode with a generated ephemeral secret. Example:
```ts
if (!cookieSecret) throw new Error('NEXTAUTH_SECRET is required');
const effectiveCookieSecret = cookieSecret;
```

### [HIGH] API proxy trusts caller-supplied Authorization header without server-side verification
**Phase:** Phase 3 — Security Audit  
**Location:** `apps/web/app/api/functions/add-division-member/route.ts` lines 37-40, 67-74  
**Description:** The route forwards client-provided authorization headers directly to Cloud Functions. The route does not validate Firebase ID tokens server-side before forwarding, increasing attack surface for header abuse and weakening defense in depth at the web boundary.  
**Evidence:**
```ts
const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
...
...(authHeader ? { authorization: authHeader, Authorization: authHeader } : {}),
```
**Recommendation:** Validate and decode ID tokens in the web route with Admin SDK before proxying; forward a server-issued identity context (or call Admin SDK directly) instead of raw client headers.

### [MEDIUM] CSP remains intentionally permissive with unsafe-inline scripts
**Phase:** Phase 3 — Security Audit  
**Location:** `apps/web/next.config.mjs` lines 5-9, 50-61  
**Description:** CSP includes `'unsafe-inline'` in `script-src` and `style-src`. Even if required for current integrations, this substantially reduces XSS mitigation strength.  
**Evidence:**
```js
const scriptSrc = ["'self'", "'unsafe-inline'", ...(allowUnsafeEval ? ["'unsafe-eval'"] : []), ...]
...
`script-src ${scriptSrc}`,
"style-src 'self' 'unsafe-inline' https://vercel.live",
```
**Recommendation:** Move to nonce-based CSP for inline scripts/styles and progressively eliminate unsafe directives per route.

### [MEDIUM] Dependency vulnerability scanning not verifiable in current environment
**Phase:** Phase 3 — Security Audit / Phase 8 — DevEx  
**Location:** `.github/workflows/ci.yml` line 83; runtime command `pnpm audit --prod --audit-level=moderate`  
**Description:** CI depends on `pnpm audit`, but local audit execution returned HTTP 403 from npm audit endpoint. This blocks trustworthy CVE visibility during this review.  
**Evidence:**
```yaml
- name: Dependency audit
  run: pnpm audit --audit-level=high
```
Runtime output: `ERR_PNPM_AUDIT_BAD_RESPONSE ... responded with 403: Forbidden`.  
**Recommendation:** Add a fallback scanner (e.g., `osv-scanner` or Snyk/Dependabot alerts as required check) and fail CI if both primary and fallback scanners cannot run.

### [MEDIUM] No explicit health/readiness endpoints identified
**Phase:** Phase 8 — DevEx & Operational Audit  
**Location:** `apps/web/app/api/**` (reviewed routes), `firebase/src/index.ts` exports  
**Description:** No dedicated `/api/health` or readiness endpoint was found for web or functions. This weakens deploy verification and automated rollback triggers.  
**Evidence:** Existing API routes include auth/login/logout, messaging SW, and function proxy; function exports target business flows only.  
**Recommendation:** Add lightweight health and dependency-aware readiness endpoints for web and Firebase Functions.

### [MEDIUM] Route-level SEO metadata strategy appears incomplete
**Phase:** Phase 7 — SEO & Discoverability Audit  
**Location:** `apps/web/app/layout.tsx` lines 6-13; absence of `sitemap.ts`, `robots.ts`, canonical metadata files in `apps/web/app`  
**Description:** Global metadata exists, but route-specific metadata, canonical URLs, and crawler assets are not evident in the inspected tree. This risks duplicate-indexing and weak snippet quality.  
**Evidence:**
```ts
export const metadata: Metadata = {
  title: 'Tennis League',
  description: 'Work Tennis League Scoring & Rankings',
}
```
**Recommendation:** Implement per-page `generateMetadata`, add `app/sitemap.ts` and `app/robots.ts`, and include canonical URL conventions.

### [MEDIUM] Accessibility conformance requires runtime verification for focus, contrast, and assistive behavior
**Phase:** Phase 2 — Accessibility Audit  
**Location:** Web and mobile UI surfaces (`apps/web/app/**/*.tsx`, `apps/mobile/app/**/*.tsx`)  
**Description:** Static inspection confirms componentized UI, but WCAG 2.2 AA criteria (keyboard traversal order, focus visibility/contrast, aria-live updates, touch-target dimensions) cannot be proven without running interfaces and assistive tooling.  
**Evidence:** No automated a11y tests (axe/pa11y/playwright+aXe) are configured in CI workflow.  
**Recommendation:** Add automated accessibility checks in CI and manual screen-reader/keyboard test scripts per core flow.

### [LOW] Logging is inconsistent and largely unstructured
**Phase:** Phase 8 — DevEx & Operational Audit  
**Location:** `apps/web/middleware.ts` lines 34, 43; other runtime files use ad-hoc `console.error` patterns  
**Description:** Error logging is present but not standardized with request correlation IDs and consistent JSON schema across services.  
**Evidence:**
```ts
console.error('[authMiddleware] error:', error);
console.error('[middleware] uncaught error:', err);
```
**Recommendation:** Adopt structured logger wrappers (JSON payloads, requestId, actorId, route, severity) and enforce in lint rules.

### [INFO] Strong baseline monorepo controls and safety automation
**Phase:** Phase 0 — Orientation / Phase 8 — DevEx  
**Location:** `README.md`, `.github/workflows/ci.yml`, `scripts/check-firebase-rules.mjs`, `firebase/scripts/rules-smoke.mjs`  
**Description:** The repository includes clear workspace structure, shared package strategy, CI type/lint/test gates, and Firebase rules validation flows, which are strong reliability foundations.
**Evidence:** CI runs typecheck/lint/shared tests and Firebase rules smoke tests; README documents baseline verification commands.
**Recommendation:** Preserve these controls and extend them with full-stack integration tests and a11y/security automation.

### [INFO] Phase 0 Orientation Snapshot
**Phase:** Phase 0 — Orientation  
**Location:** Monorepo-wide  
**Description:** 
- Frameworks/languages: Next.js App Router + React (web), Expo React Native (mobile), Firebase Functions (Node/TS), shared TS packages.
- Build tooling: pnpm workspaces, Turborepo, TypeScript, esbuild (functions), Expo/EAS.
- Entry points identified: Next app routes/pages, Next route handlers under `apps/web/app/api/**`, Firebase function exports in `firebase/src/index.ts`, scripts under `scripts/**` and `firebase/scripts/**`.
- Config/IaC identified: `firebase/firebase.json`, Firestore/Storage rules/indexes, `apps/web/vercel.json`, GitHub Actions workflows.
- Test strategy: Jest for `packages/shared`, Firebase rules smoke tests, typecheck/lint in CI; clear gaps in web/mobile e2e, accessibility, and performance regression suites.
**Evidence:** See referenced files above.
**Recommendation:** Add explicit architecture/test matrix documentation mapping each critical path to automated coverage.

## Positive Observations
- CI enforces typecheck and lint across the monorepo and conditionally runs shared tests and Firebase rules smoke tests, which reduces regression risk.
- Firebase security posture includes rule files and a dedicated rules smoke test path in CI.
- Shared domain logic is centralized in `packages/shared`, reducing cross-platform duplication.
- Web middleware config sets secure cookie attributes (`httpOnly`, `secure` in production, `sameSite=lax`) and redirects invalid sessions to login.
- Dependabot configuration exists, indicating at least baseline dependency maintenance intent.

## Prioritized Action Plan
1. Remove static fallback cookie secret and require `NEXTAUTH_SECRET` in all deployable environments.
2. Replace client-header pass-through auth in API proxy routes with verified server-side identity handling.
3. Tighten CSP to nonce-based policies and remove unsafe inline/eval allowances where possible.
4. Implement redundant vulnerability scanning so CVE checks cannot silently fail.
5. Add `/api/health` and readiness endpoints with dependency checks and deploy gate integration.
6. Add automated accessibility scans (axe) plus keyboard/screen-reader regression checks for core flows.
7. Implement route-level metadata, canonical URLs, sitemap, and robots generation in Next app router.
8. Standardize structured logging with correlation IDs across web and Firebase functions.
9. Add end-to-end tests for auth, match lifecycle, messaging, and feedback flows across web/mobile.
10. Create and enforce a documented performance budget (CWV targets, bundle thresholds, image/font policy).

## Metrics Snapshot (fill in what you can determine statically)
- Estimated test coverage: ~20–30% (shared logic tested; web/mobile critical paths largely untested)
- Dependency vulnerabilities: Unknown from this run (audit command returned registry 403)
- Accessibility violations (estimated): 15+ potential items requiring runtime verification
- Pages missing security headers: 0 evident in web config (global headers configured)
- Hardcoded secrets detected: yes (development fallback cookie secret literal)
