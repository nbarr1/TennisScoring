# Pre-distribution Security Review (2026-05-12)

## Scope and method

Reviewed the Firebase-backed web/mobile Tennis Scoring application, including Next.js web routes, Expo/React Native mobile screens, Firebase Functions, Firestore/Storage rules, shared client hooks, dependency manifests, and repository configuration. Commands run included `rg --files`, targeted `rg` code searches, manual line-by-line review with `nl -ba`, `pnpm audit --audit-level low`, `npx --yes osv-scanner --version`, and git-history secret regex scans using `git grep` across all revisions.

`pnpm audit` could not complete because the npm audit endpoint returned HTTP 403 in this environment. `npx` installation of `osv-scanner` was also blocked by an npm registry HTTP 403. Treat dependency vulnerability status as **not fully verified** until a working advisory source is available in CI or a developer workstation.

## Executive summary

The codebase has a reasonable Firebase-centric baseline: web sessions are stored in httpOnly cookies, Firestore rules deny obvious unauthenticated access, score-point mutation is handled through a callable function, invite acceptance checks token expiry and invited email, and GitHub feedback secrets are defined as Firebase Function secrets. However, several pre-distribution blockers remain:

1. **High:** Firestore match update rules trust client-supplied `reportSubmission.submittedBy`, enabling a participant to impersonate the opponent as submitter and then confirm their own manipulated report.
2. **High:** Self-registration is enabled in web and mobile; the enterprise-domain gate is optional and defaults open unless `ALLOWED_EMAIL_DOMAIN` is configured.
3. **High:** No application-layer brute-force/rate limiting is implemented for login, signup, invite-token preview/acceptance, or high-impact callables.
4. **High:** Division members can read user documents for the entire division, including phone numbers, email addresses, FCM tokens, preferences, and other profile fields.
5. **Medium:** Dependency advisory checks are currently blocked, and manifests use many loose semver ranges.
6. **Medium:** Storage rules allow authenticated users to upload GIF/WebP avatars by content type only; no image re-encoding, malware scan, or extension constraints are evident.
7. **Medium:** Sensitive operational details and user request data are logged in some failure paths.


## Remediation update (2026-05-12)

The Critical/High queue has been worked through as follows:

- **H-01 fixed:** Firestore match-update rules now require `reportSubmission.submittedBy` to equal `request.auth.uid`, preserve the original submitter/timestamp during confirmation or dispute, and require confirmation/dispute actor fields to match the authenticated user.
- **H-02 fixed:** Firebase Auth before-create now fails closed when `ALLOWED_EMAIL_DOMAIN` is unset, so production self-registration cannot silently remain open by default.
- **H-03 partially fixed:** Invite send, invite preview, and invite acceptance callables now have Firestore-backed rate limits. Login/signup still rely on Firebase Auth platform abuse controls because the current web/mobile clients authenticate directly with Firebase Auth before the app receives a server-side login request.
- **H-04 not fixed in this patch:** Division-wide user-document reads still require a schema/client migration to split public profiles from private PII/FCM-token documents. Do not treat this item as remediated.
- **H-05 fixed:** Direct Firestore match creation is restricted to `scheduled` and `proposed` states, and historic match recording now goes through a Firebase callable. Guest historic matches are auto-confirmed; registered-opponent historic matches are created as `pending_report` and require opponent confirmation before standings update.

## Findings, ranked by severity

### High

#### H-01: Client can spoof match report submitter and self-confirm a match

- **Area:** Authorization & access control; server-side authorization for score submission/ranking updates.
- **Location:** `firebase/firestore.rules` `canUpdateMatch`; `packages/firebase-client/src/hooks/useMatch.ts` client update helpers.
- **Evidence:** `isReportSubmit` only requires `existing.status == 'pending_report'`, unchanged status, and changed fields limited to `reportSubmission`. It does not require `incoming.reportSubmission.submittedBy == request.auth.uid`. The subsequent confirm path only checks that `request.auth.uid != existing.reportSubmission.submittedBy`.
- **Impact:** A participant can write `reportSubmission.submittedBy` as the opponent's UID, then call the confirm update as themselves. That can complete a match and trigger ranking/report side effects without the real opponent's confirmation.
- **Recommendation:** Move report submission/confirmation/dispute to Firebase callables or Firestore transactions that derive `submittedBy`/`confirmedBy` from `request.auth.uid`. If keeping client writes, add rule checks for exact reportSubmission shape, `submittedBy == request.auth.uid`, pending status, and valid timestamps; require confirmation/dispute only by the non-submitter and preserve score fields.

#### H-02: Public self-registration unless production parameter is configured

- **Area:** Authentication & session management; secure account creation flow.
- **Location:** Web signup form, mobile signup form, and `onUserCreated` before-create trigger.
- **Evidence:** Web and mobile expose `createUserWithEmailAndPassword`. The Firebase before-create trigger restricts domains only when `ALLOWED_EMAIL_DOMAIN` is non-empty and defaults to blank.
- **Impact:** If `ALLOWED_EMAIL_DOMAIN` is not configured in production, anyone can create an account and then attempt invite-code joining or profile creation. This is a distribution blocker for enterprise-only access.
- **Recommendation:** Make the domain allowlist mandatory in production, fail closed when unset, and remove generic public signup for production if distribution should be invite-only. Add a deployment check that verifies `ALLOWED_EMAIL_DOMAIN` and Firebase Auth authorized domains before release.

#### H-03: No app-owned brute-force/rate-limit controls for authentication and token endpoints

- **Area:** Authentication & session management.
- **Location:** Web login page uses Firebase client auth directly; mobile login uses Firebase client auth directly; invite preview/accept functions are callable by unauthenticated/authenticated callers with no rate limiting.
- **Evidence:** Login/signup calls go straight to Firebase Auth SDK. `/api/auth/login` only exchanges a valid Firebase ID token for a cookie. Invite preview looks up a token document directly and returns differentiated errors.
- **Impact:** The application relies on Firebase's built-in abuse controls and does not enforce enterprise-specific throttling, IP/user/email rate limits, lockout, CAPTCHA, or alerting. Invite tokens can also be probed at scale if callable abuse controls are not configured.
- **Recommendation:** Enable Firebase Auth password policy and abuse protections, App Check, and Identity Platform blocking/rate-limit features where available. Add Cloud Armor/API gateway/rate limiting for web endpoints and callable functions, log failed authentication attempts, and alert on anomalies.

#### H-04: Division-wide user reads overexpose PII and FCM tokens

- **Area:** User data & privacy; over-fetching.
- **Location:** Firestore `users/{userId}` read rule and admin/player queries over users.
- **Evidence:** Any authenticated user can read any user document where `resource.data.divisionId == getUserData().divisionId`. User documents contain email, phone, avatar URL, contact preferences, FCM tokens, role, invite status, and profile metadata.
- **Impact:** Every division member can retrieve sensitive fields for every other member, including FCM tokens that are not required for normal UI display.
- **Recommendation:** Split public profile data from private user data. Store `displayName`, avatar, and division membership in a minimally readable profile document; keep email/phone/FCM tokens/invite metadata in private documents readable only by the owner and admins/functions. Update client queries to consume minimal profile views.

#### H-05: Client-side completed historic match creation can self-confirm records

- **Area:** Authorization & access control; score submission/ranking updates.
- **Location:** `recordHistoricMatch` writes completed matches directly from the client; Firestore create rule accepts client-created match fields.
- **Evidence:** The client builds a `status: 'completed'` match with a confirmed `reportSubmission` when recording historic matches. Firestore create rules allow match creation with the broad `matchFields()` set if the creator is player1 and division membership checks pass.
- **Impact:** A regular player can create completed/self-confirmed historic matches against guests or eligible division users without a server-derived confirmation workflow. This may be intended for manual entry, but it directly affects rankings and bypasses opponent confirmation for non-guest historic entries.
- **Recommendation:** Route all completed/manual match recording through a callable that validates actor authorization, opponent/guest mode, score shape, and whether opponent confirmation is required. Restrict Firestore direct create to proposed/scheduled initial states.

### Medium

#### M-01: Dependency vulnerability check is blocked; several semver ranges are loose

- **Area:** Third-party dependencies & supply chain.
- **Location:** Root, web, Firebase Functions, firebase-client, and mobile `package.json` files.
- **Evidence:** `pnpm audit --audit-level low` returned HTTP 403 from the npm audit endpoint; `npx --yes osv-scanner --version` also returned HTTP 403. Manifests use `^` and `>=` ranges for many runtime/dev dependencies such as Firebase SDKs, NextAuth, Zustand, TypeScript, ESLint, React Native peer ranges, and Turbo.
- **Impact:** Known vulnerabilities were not enumerated in this environment, and loose ranges allow future installs to select newer versions than reviewed. The lockfile mitigates reproducible installs only when frozen installs are enforced.
- **Recommendation:** Add a CI job using a reachable advisory source (`pnpm audit --prod`, OSV Scanner, Snyk, or GitHub Dependabot) and fail on critical/high findings. Pin runtime dependencies or enforce frozen lockfile installs in CI/Vercel. Review unmaintained packages quarterly.

#### M-02: Vercel install command permits lockfile drift

- **Area:** Deployment & infrastructure; supply chain.
- **Location:** `apps/web/vercel.json`.
- **Evidence:** The Vercel `installCommand` runs `pnpm install --no-frozen-lockfile --prod=false --force`.
- **Impact:** Preview/production builds may resolve and install dependency versions not captured in the reviewed lockfile, increasing supply-chain risk and reducing reproducibility.
- **Recommendation:** Use `pnpm install --frozen-lockfile` for CI/Vercel builds. Avoid `--force` except for a documented emergency workaround.

#### M-03: Avatar uploads rely on content type only and permit active/complex image formats

- **Area:** Input validation & file uploads.
- **Location:** `firebase/storage.rules` avatar upload rules.
- **Evidence:** Authenticated users may write files under their avatar path if under 5 MB and content type is one of JPEG/PNG/GIF/WebP. There is no evident extension validation, image re-encoding, virus scanning, or dimension limits.
- **Impact:** Malformed images, polyglots, oversized dimensions, or animated content can create client rendering or moderation risk.
- **Recommendation:** Upload avatars through a function or extension that validates magic bytes, decodes and re-encodes to JPEG/PNG/WebP, strips metadata, enforces dimensions, scans files, and writes only sanitized derivative objects.

#### M-04: Logging includes request payloads and upstream response previews

- **Area:** User data & privacy; secrets & logs.
- **Location:** `add-division-member` proxy and `addDivisionMemberPlaceholder` error logging.
- **Evidence:** The Next.js proxy logs upstream body previews and error objects; the Firebase function logs `request.data` and `uid` on failure.
- **Impact:** Names, emails, division IDs, invite flags, upstream error details, and possibly stack traces may be captured in platform logs. In incident response, logs can become a secondary sensitive data store.
- **Recommendation:** Redact or hash emails/tokens, avoid logging raw request bodies, log stable error codes/request IDs instead of full error objects, and configure log retention/access controls.

#### M-05: Password reset flow is absent from the reviewed application

- **Area:** Authentication & session management.
- **Location:** Web/mobile login screens do not expose a reset flow.
- **Evidence:** Login forms implement sign-in and signup only; no `sendPasswordResetEmail` flow or custom reset handling was found.
- **Impact:** Users may need ad hoc administrator intervention or default Firebase flows outside the reviewed UX. If later added hastily, reset flows often introduce username enumeration or token handling mistakes.
- **Recommendation:** Implement Firebase password reset with generic success messages, email normalization, rate limiting, and monitoring. Document Firebase reset-token expiry/single-use behavior and test it before distribution.

#### M-06: Security headers are present but CSP remains permissive

- **Area:** Security headers & frontend hardening.
- **Location:** `apps/web/next.config.mjs`.
- **Evidence:** The app sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy, and CSP. The CSP includes `'unsafe-inline'` for scripts and styles and a comment noting that it is intentionally permissive pending nonce-based hardening.
- **Impact:** React's default escaping reduces XSS risk, but a future injection bug would have fewer browser-level constraints because inline scripts/styles are allowed.
- **Recommendation:** Move to nonce/hash-based CSP, remove `'unsafe-inline'`, explicitly enumerate Firebase domains, and add report-only CSP telemetry before enforcing.

#### M-07: Invite sender receives raw invite token

- **Area:** Authentication & session management; password/account reset-like flows.
- **Location:** `sendInvite` callable return value.
- **Evidence:** `sendInvite` creates a token and returns `{ success: true, token }` to the caller while also placing the token in email metadata.
- **Impact:** Division leaders/admins can see and reuse invite links outside email. That may be acceptable for operational support, but it should be a deliberate policy decision and audited.
- **Recommendation:** Return only success in production. If leaders need a copy link workflow, explicitly log and constrain it, display it once, and keep invite token TTL short and single-use.

#### M-08: Division leaders can update division roster and leader IDs broadly

- **Area:** Authorization & access control; privilege escalation.
- **Location:** Firestore `divisions/{divisionId}` update rule.
- **Evidence:** Leaders can update `name`, `leaderIds`, `playerIds`, and `updatedAt` directly. There are no constraints on adding arbitrary leaders/players, preserving at least one leader, or requiring admin approval for leader changes.
- **Impact:** A compromised leader account can grant leadership to another user or rewrite roster state broadly. This may be intended delegation, but it is high-impact and unaudited.
- **Recommendation:** Move roster/leader changes to callables with explicit role checks, audit logs, invariants, and optional admin approval for leader changes. Restrict direct Firestore updates to division name only.

#### M-09: Callable CORS defaults need production verification

- **Area:** Security headers & frontend hardening; CORS.
- **Location:** `divisionFunctions.ts` and `submitFeedback.ts` use `APP_BASE_URL`; other callables do not specify CORS options.
- **Evidence:** Some v2 callables specify CORS based on `APP_BASE_URL`, while `sendInvite` and many match functions do not set an explicit allowlist.
- **Impact:** Firebase callable functions still require Firebase Auth for protected actions, but broad CORS can enable unwanted browser-origin invocation and complicate abuse controls.
- **Recommendation:** Standardize callable options across functions with explicit production origins, enable App Check enforcement where possible, and document local emulator exceptions.

### Low

#### L-01: Firestore feedback rules are duplicated

- **Area:** Authorization & access control; generated/scaffold artifacts.
- **Location:** `firebase/firestore.rules` contains two `match /feedback/{feedbackId}` blocks.
- **Evidence:** One block denies client create/update/delete and allows reads to admins or division leaders; the later block permits authenticated client creates with field validation and admin-only reads.
- **Impact:** Duplicate matches are confusing and may produce unexpected effective authorization or deployment confusion. This looks like an AI/scaffold merge artifact.
- **Recommendation:** Consolidate feedback rules into one block matching the intended architecture. If feedback is submitted via callable/GitHub only, deny client writes; otherwise keep one carefully validated create rule.

#### L-02: Error responses leak internal details in development and proxy failures

- **Area:** Error handling.
- **Location:** `apps/web/app/api/functions/add-division-member/route.ts`.
- **Evidence:** Non-production responses include upstream status and resolved callable URL details. Catch responses expose `error.message` to clients.
- **Impact:** Development/preview deployments can disclose project IDs, regions, function names, and internal errors if publicly accessible.
- **Recommendation:** Keep detailed diagnostics server-side. Return generic messages to clients in all shared environments, including preview.

#### L-03: Auth middleware logs full error objects

- **Area:** User data & privacy; error handling.
- **Location:** `apps/web/middleware.ts`.
- **Evidence:** Middleware logs `[authMiddleware] error:` and `[middleware] uncaught error:` with full error objects.
- **Impact:** Misconfiguration or token parsing errors may put internals into logs.
- **Recommendation:** Log request ID, path, and sanitized error code/message; avoid full stack traces in production logs unless access and retention are tightly controlled.

#### L-04: Session cookie lifetime is 12 days without documented reauthentication policy

- **Area:** Authentication & session management.
- **Location:** `apps/web/middleware.ts` cookie serialization.
- **Evidence:** `tennis-auth` is httpOnly, SameSite=Lax, secure in production, and has `maxAge` of 12 days.
- **Impact:** This is not inherently insecure, but it should align with enterprise session policy and device risk.
- **Recommendation:** Confirm enterprise requirements. Consider shorter idle/absolute session lifetimes, revocation checks, and step-up authentication for administrative actions.

#### L-05: Notification click handler uses unvalidated match IDs in a path

- **Area:** Input validation.
- **Location:** Firebase messaging service worker route.
- **Evidence:** The service worker constructs `/matches/` + `data.matchId` from notification payload data.
- **Impact:** FCM data payloads are server-controlled today, so exploitability is low. If compromised or extended to user-controlled payloads, navigation paths could be unexpected.
- **Recommendation:** Validate `matchId` against expected Firestore ID characters before navigation and default to `/matches` if invalid.

### Informational

#### I-01: Password storage is delegated to Firebase Auth

- **Area:** Authentication & session management.
- **Location:** Web/mobile use Firebase Auth `createUserWithEmailAndPassword` and `signInWithEmailAndPassword`; the repository does not store password hashes.
- **Observation:** No plaintext or weakly hashed password storage was found in application code. Confirm Firebase Auth password policy settings before distribution.

#### I-02: Web session token storage is httpOnly cookie-based

- **Area:** Authentication & session management.
- **Location:** Next.js middleware.
- **Observation:** The web app exchanges Firebase ID tokens for a signed `tennis-auth` httpOnly cookie, with Secure enabled in production and SameSite=Lax. No JWT `alg: none` implementation was found in first-party code.

#### I-03: React rendering reduces direct XSS exposure

- **Area:** Input validation & XSS.
- **Location:** Web/mobile pages and components.
- **Observation:** Searches did not find `dangerouslySetInnerHTML` or direct DOM `innerHTML` usage in the app code. User-controlled names/messages are generally rendered through React text nodes. Continue server-side validation and length limits.

#### I-04: Database access is through Firestore SDK/Admin SDK rather than string-built SQL

- **Area:** Injection.
- **Location:** Firebase client hooks and functions.
- **Observation:** No SQL or string-concatenated database query language was found. Firestore queries use typed SDK calls. Still validate document IDs and input shapes because authorization and over-broad query risks remain.

#### I-05: Environment secret hygiene is partially documented

- **Area:** Secrets & environment configuration.
- **Location:** `.gitignore`, setup docs, feedback function secret configuration.
- **Observation:** `.env` variants and Apple plist files are ignored. GitHub feedback token is defined as a Firebase Function secret. `google-services.json` files with Firebase API keys are committed; Firebase client API keys are not server secrets but must be restricted in Google Cloud/Firebase settings.

## User data inventory

Observed user/profile data fields include:

- `users`: UID, display name, email, phone, avatar URL, contact preferences, division ID, role, FCM tokens, tips setting, registration/invite status, invite timestamps/actor, merge metadata, created/updated timestamps.
- `divisions`: name, invite code, leader IDs, player IDs, timestamps.
- `matches`: division ID, player IDs/names, guest flag, format, status, live score, stats, advanced stats flag, report submission metadata, winner, report URL, tips flag, undo snapshot, source, scheduling/completion timestamps.
- `channels/messages`: participant IDs, message sender/name/content/type/shared contact/read state/timestamps.
- `feedback`: title/body/labels/metadata via function, and/or feedback collection fields depending on rules.
- `invites`: token, email, name, division ID, invited/accepted metadata, expiry.
- `mail`: outbound email queue with recipient and invite metadata.

Minimize routine client access to email/phone/FCM tokens/invite metadata. Add deletion/offboarding workflows for user profile, tokens, messages, invites, and ranking/match references as appropriate for employment lifecycle requirements.

## Secrets and git-history scan results

- No private keys, AWS keys, GitHub tokens, OpenAI keys, Slack tokens, or obvious service-account private keys were found by the regex scans performed.
- Firebase API keys were found in committed `apps/mobile/google-services.json` and `apps/mobile/android/app/google-services.json` and throughout git history. These are client identifiers, not equivalent to admin secrets, but they should be restricted to expected Android package names/SHA fingerprints/web referrers/API scopes in Google Cloud.
- Dedicated tools (`gitleaks`, `trufflehog`, `git-secrets`) were not installed. The regex git-history scan is not a complete substitute. Run at least one dedicated secret scanner in CI before distribution.

## Deployment and infrastructure notes

- Vercel `vercel.json` does not declare preview-deployment access controls; enforce this in the Vercel project/team settings.
- The repository cannot verify custom domain TLS/HSTS settings or Vercel environment variable scoping. Verify production/preview/development values in Vercel and Firebase consoles.
- Firestore/Storage are Firebase managed services; TLS in transit is provided by Firebase clients, but encryption-at-rest details and network restrictions must be verified against Firebase/GCP project settings. Firestore generally does not support simple IP allowlisting for mobile/web clients; enforce through rules, App Check, and least-privilege admin credentials.
- Monitoring/alerting for failed logins, invite probing, unusual reads, ranking recalculations, and admin/leader operations was not evident in code. Add platform alerts and audit logs.

## Blockers before internal distribution

1. Fix match report submission/confirmation authorization so clients cannot spoof submitters or self-confirm opponent-required reports.
2. Decide and enforce account creation policy: enterprise domain allowlist and/or invite-only signups, fail closed in production.
3. Implement or enable brute-force/rate-limiting and abuse monitoring for auth, invites, and privileged callables.
4. Reduce user-document PII exposure to division members, especially FCM tokens and private contact data.
5. Run a successful dependency vulnerability scan from an environment with registry/advisory access, and resolve all Critical/High findings.
6. Change Vercel installs to frozen lockfile mode before distributing builds.

## Minimum viable deployment security checklist

Use this checklist for every future deployment:

- [ ] `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm lint`, and `pnpm typecheck` pass in CI.
- [ ] Dependency advisory scan passes with no unresolved Critical/High vulnerabilities.
- [ ] Secret scan over working tree and git history passes (`gitleaks` or `trufflehog`) before release.
- [ ] Firebase/Google API keys are restricted to expected apps/domains/APIs.
- [ ] `ALLOWED_EMAIL_DOMAIN` or invite-only production gating is configured and tested.
- [ ] App Check/rate limiting/abuse monitoring is enabled for Firebase Functions and Auth flows.
- [ ] Firestore and Storage rules are tested in emulator with positive and negative authorization cases.
- [ ] Vercel production and preview environment variables are scoped correctly; preview deployments with real data are protected.
- [ ] Security headers, especially CSP/HSTS, are verified against the deployed URL.
- [ ] Logs are checked for sensitive data leakage; retention and access are configured.
- [ ] Offboarding/deletion process is tested for a departed employee account.
- [ ] Admin/leader actions are audited and monitored.
