# AGENT_CONTEXT.md
### Foundational Engineering Standards for Agentic Coding Models

---

## ⚡ HOW TO USE THIS FILE

This file must be read **in full before writing, editing, or executing any code**.

### Method 1 — Committed to the Repository (Recommended for ongoing projects)
Place this file in the **root of every repository** you work in. Rename it based on your agent:
- `CLAUDE.md` → Claude Code, Claude.ai
- `AGENTS.md` → OpenAI Codex, GPT-based agents
- `.cursor/rules` or `cursorrules` → Cursor
- `COPILOT_INSTRUCTIONS.md` inside `.github/` → GitHub Copilot

Most modern agentic tools automatically detect and load these files before any task. Verify your specific tool's documentation to confirm its auto-load filename and location.

### Method 2 — Uploaded Per Session (For chat-based agents)
Upload this file as an **attachment at the start of every new conversation** before issuing any task. In your opening prompt, include:

> "Read AGENT_CONTEXT.md fully before doing anything. Follow every rule it contains as non-negotiable constraints for this session."

### Combined Approach (Both methods — Maximum Reliability)
Commit the file to the repo **and** upload it per session. The per-session upload acts as an explicit reminder even when the agent has already scanned the repo.

---

## 🏗️ PROJECT ARCHITECTURE OVERVIEW

This project is a **cross-platform application** distributed across:
- **Android** (Kotlin / Jetpack Compose)
- **iOS** (Swift / SwiftUI / Xcode)
- **Web** (HTML / CSS / JavaScript / TypeScript / React or equivalent framework)

Backend and infrastructure are managed via:
- **Firebase** (Authentication, Firestore, Realtime Database, Cloud Storage, Cloud Functions, FCM)
- **Google Cloud Console** (IAM, Service Accounts, APIs, Secret Manager, Cloud Run)

**Assume every feature must work across all three platforms unless explicitly told otherwise.**

---

## 🔒 RULE 1 — AUTHENTICATION & PERMISSIONS (READ THIS FIRST)

Authentication and permission errors are the most common source of silent failures. Follow these rules without exception.

### Before Writing Any Auth-Related Code
1. Identify which Firebase service is being accessed (Firestore, Storage, Functions, etc.)
2. Identify the client environment (Android, iOS, Web, server-side)
3. Confirm whether the call is made as an **authenticated user** or a **service account**
4. Check that the corresponding **Firebase Security Rules** permit this operation for this role

### Firebase Security Rules
- Never default to open rules (`allow read, write: if true`) in any environment, including development
- Rules must be checked **before** concluding that a code error is the root cause of a data access failure
- When a `permission-denied` error occurs, the investigation order is:
  1. Confirm the user is signed in and the token has not expired
  2. Confirm the Security Rules allow the operation for this user's role or UID
  3. Confirm the request path matches the rule path exactly (including dynamic segments)
  4. Only then investigate client-side code

### Firebase Auth Token Lifecycle
- ID tokens expire after 1 hour. Never cache auth state without handling token refresh
- Always use the platform SDK's built-in auth state listeners (`onAuthStateChanged`, `authStateChanges()`, etc.) rather than storing user state manually
- For server-side calls, always verify the ID token using the Firebase Admin SDK. Never trust a token passed from a client without verification

### Cloud Functions & Server-Side Auth
- All callable Cloud Functions must validate authentication unless explicitly designed to be public
- Use `context.auth` (v1) or `request.auth` (v2) to check caller identity inside every function
- Service account keys must never be committed to source control. Use environment variables or Secret Manager
- IAM roles assigned to service accounts should follow least-privilege — do not assign `Editor` or `Owner` roles

### Google Cloud Console IAM
- Before reporting a "broken" API call to Google Cloud services, verify:
  1. The required API is enabled in the project
  2. The service account or OAuth credentials have the correct IAM role
  3. The correct project ID is being used (not a dev/staging/prod mix-up)

---

## 📦 RULE 2 — DEPENDENCY & VERSION MANAGEMENT

### Core Principles
- **Never assume a dependency version.** Always read the existing lockfile or manifest before adding or upgrading anything
- **Never install a package that conflicts with existing peer dependencies** without explicitly flagging the conflict and proposing a resolution
- **Never silently upgrade** a transitive dependency. Flag it if it is required

### Before Adding Any Dependency
1. Check the existing manifest (`package.json`, `build.gradle`, `Podfile`, `pubspec.yaml`, etc.)
2. Confirm the new package is compatible with the current platform SDK version
3. Confirm the new package is compatible with the current runtime version (Node, JVM, Swift toolchain, etc.)
4. Check for an existing package that already provides the required functionality before adding a new one

### Platform-Specific Rules

**Web / Node.js**
- Read `package.json` and `package-lock.json` or `yarn.lock` before any `npm install` or `yarn add`
- Use `--save-exact` when installing if the project already pins versions
- Do not mix `npm` and `yarn` within the same project
- After installing, run the existing lint and build commands to confirm no breakage before reporting completion

**Android (Kotlin / Gradle)**
- Read `build.gradle` (project and app level) and `gradle.properties` before any dependency change
- Check `compileSdk`, `targetSdk`, and `minSdk` before adding any library that requires a minimum API level
- Do not change the Kotlin or AGP (Android Gradle Plugin) version without explicit instruction — these are project-wide and often require coordinated changes
- Sync Gradle and confirm a clean build before reporting completion

**iOS (Swift / Xcode)**
- Read `Podfile` and `Podfile.lock` (CocoaPods) or `Package.swift` (SPM) before adding any dependency
- Do not change the minimum deployment target without explicit instruction
- After any dependency change, confirm `pod install` or SPM resolve succeeds before reporting completion
- Never mix CocoaPods and SPM for the same dependency

**Firebase SDKs (All Platforms)**
- Firebase SDK versions must be kept consistent across platforms where a shared project is used
- When updating one Firebase SDK (e.g., `firebase-auth`), check whether other Firebase packages require a matching update
- Always consult the official Firebase release notes for breaking changes before any SDK upgrade

---

## 🌿 RULE 3 — VERSION CONTROL & BRANCH HYGIENE

### Pull Requests
- Never commit directly to `main` or `master` unless explicitly instructed
- Every change must be on a dedicated branch named descriptively (e.g., `fix/auth-token-refresh`, `feat/storage-upload-android`)
- PR descriptions must include: what changed, why it changed, and how to test it

### Merge Conflicts
- When resolving a merge conflict, do not auto-accept either side without reading both
- If a conflict is in a lockfile (`package-lock.json`, `Podfile.lock`, `yarn.lock`), do not manually edit it — regenerate it using the appropriate package manager after resolving the source manifest conflict
- If a conflict involves Firebase configuration files (`google-services.json`, `GoogleService-Info.plist`), flag it immediately — these may indicate an environment mismatch

### Configuration & Secrets
- `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) must never be committed to a public repository
- Add them to `.gitignore` if not already present
- Use CI/CD secrets injection or a secure file store for these files in automated pipelines
- `.env` files must never be committed. Verify `.gitignore` includes `.env*` before any commit

---

## 🧩 RULE 4 — CROSS-PLATFORM CONSISTENCY

### Data Layer
- Firestore document structures and field names must be identical across all platforms
- If a data model changes, the change must be reflected in all platform clients and in any Cloud Functions that read or write that model
- Use consistent timestamp handling: always store timestamps as Firestore `Timestamp` objects, never as plain strings or Unix integers

### API & Function Contracts
- Cloud Functions callable from multiple platforms must have a documented input/output schema
- If a function's input schema changes, all platform callers must be updated in the same task
- Never change a Cloud Function's exported name without updating all callers

### Feature Flags & Environment Targeting
- Clearly separate `development`, `staging`, and `production` Firebase projects
- Never point a development build at the production Firestore or Storage bucket
- Use named build flavors (Android), schemes (iOS), and environment files (Web) to manage this separation

---

## 🐛 RULE 5 — DEBUGGING PROTOCOL

When something is broken, follow this investigation order before changing any code:

### Step 1 — Identify the Layer
Determine whether the error originates from:
- **Client code** (logic, UI, state management)
- **Network / API call** (malformed request, wrong endpoint, timeout)
- **Authentication** (expired token, wrong user, missing sign-in)
- **Permissions** (Security Rules, IAM role, missing API enablement)
- **Dependency** (version mismatch, missing package, broken import)
- **Build / environment** (wrong SDK, misconfigured gradle/xcode, bad env var)

### Step 2 — Read the Full Error
- Do not guess the cause from the first line of an error. Read the complete stack trace
- For Firebase errors, look up the error code in the official Firebase documentation before proposing a fix
- For Gradle or Xcode build errors, read the full build log, not just the summary

### Step 3 — Verify the Environment Before Changing Code
Before modifying any logic for a suspected auth or permission error:
1. Confirm the user is authenticated and the token is valid
2. Confirm Security Rules permit the operation
3. Confirm the correct Firebase project is targeted
4. Confirm the API is enabled in Google Cloud Console
5. Only after all of the above are confirmed, investigate application code

### Step 4 — Minimal Change Principle
- Fix only what is broken. Do not refactor surrounding code unless it is directly causing the issue
- Document every change made during debugging with an inline comment explaining why

---

## 🎨 RULE 6 — UI/UX STANDARDS

### Accessibility
- All interactive elements must have accessible labels (`contentDescription` on Android, `accessibilityLabel` on iOS, `aria-label` on Web)
- Minimum touch target size: 48×48dp (Android), 44×44pt (iOS), 44×44px (Web)
- Color contrast must meet WCAG AA minimum (4.5:1 for normal text, 3:1 for large text)
- Never convey information through color alone — always pair with an icon, label, or pattern

### Cognitive Load
- Limit the number of primary actions on any screen to one
- Group related controls visually and spatially
- Error messages must be human-readable, explain what went wrong, and tell the user what to do next
- Loading states must always be indicated — never leave the UI frozen without feedback

### Platform Conventions
- Follow platform-native navigation patterns: bottom navigation (Android/iOS), tab bars (iOS), side nav (Web)
- Use platform-native components where possible before reaching for custom ones
- Do not port iOS interaction patterns to Android or vice versa — respect each platform's HIG and Material guidelines

---

## ✅ RULE 7 — BEFORE REPORTING TASK COMPLETE

Do not report a task as complete until all of the following are true:

- [ ] The code compiles without errors on the target platform(s)
- [ ] Existing tests pass (or failures are explicitly documented with explanation)
- [ ] No new lint warnings have been introduced without justification
- [ ] No secrets, API keys, or credentials appear anywhere in the diff
- [ ] Configuration files for all targeted platforms are updated if a shared model or API changed
- [ ] The change has been tested against the correct Firebase project (not prod unless specified)
- [ ] Any new dependency has been validated for version compatibility with the existing stack
- [ ] Any auth or permission requirements for new features are documented

If any item cannot be confirmed, **state explicitly which item is unverified and why** before handing off.

---

## 📋 QUICK REFERENCE — COMMON ERROR CAUSES

| Symptom | Most Likely Root Cause | First Check |
|---|---|---|
| `permission-denied` from Firestore | Security Rules block the operation | Firebase Console → Firestore → Rules |
| `unauthenticated` from a Cloud Function | Caller is not signed in or token expired | Auth state listener, token refresh |
| API call returns 403 | IAM role missing or API not enabled | Google Cloud Console → APIs & IAM |
| Build fails after dependency update | Version conflict in peer dependencies | Lockfile diff, peer dep warnings |
| Gradle sync fails | AGP/Kotlin version mismatch or repository missing | `build.gradle` project level, repositories block |
| `pod install` fails | Podfile conflict or outdated spec repo | `pod repo update` then retry |
| App crashes on launch after clean install | Missing `google-services.json` or `GoogleService-Info.plist` | Confirm file exists in correct location |
| Data missing on one platform | Field name case mismatch or Timestamp type mismatch | Compare Firestore reads across platforms |
| Push notification not received | FCM token not registered or topic mismatch | Check token registration flow and server send logic |
| Environment variable undefined at runtime | `.env` not loaded or CI secret not injected | Build config, CI pipeline secrets |

---

*This file contains no hardcoded versions, model names, or SDK references. It is intentionally version-agnostic and should remain valid across dependency, runtime, and toolchain updates. Update the Quick Reference table as new recurring error patterns are identified.*
