# Security Review

**Current stable baseline:** `1.0.1`  
**Status:** current security operating summary with historical review context  
**Last reviewed:** 2026-06-10

## Current security posture

The repository is stable and releasable when the documented quality gates pass and production credentials are configured outside source control. The application relies on Firebase Authentication, Firestore/Storage security rules, server-side Firebase Admin verification, and Firebase Secret Manager for sensitive deploy/runtime values.

## Authentication and session model

- Web and mobile use Firebase email/password authentication.
- The web app exchanges Firebase ID tokens for an httpOnly `tennis-auth` session cookie through `next-firebase-auth-edge` middleware.
- Server-side API routes and Functions must verify Firebase identity before performing privileged work.
- Administrative and division-leader operations must remain protected by role checks in application code and Firebase rules/Functions.

## Secrets model

- GitHub feedback issue creation uses the `submitFeedback` Cloud Function and a `GITHUB_TOKEN` secret stored in Firebase Secret Manager.
- GitHub tokens, service account keys, Apple credentials, Android signing material, and production admin credentials must not be committed or exposed through `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variables.
- Firebase public client API keys are not server secrets, but they should be restricted in Google Cloud/Firebase settings.

## Data inventory

User and league data includes:

- User profile fields: UID, display name, email, phone, avatar URL, role, division, contact preferences, availability, tips preference, FCM tokens, and metadata.
- Division data: names, invite codes, leaders, players, season/level metadata, memberships, timestamps.
- Match data: participants, guests, status, schedule/completion data, live scores, stats, report metadata, winner, disputes, and ranking-relevant fields.
- Messaging data: channels, participants, message content, sender metadata, read/shared-contact state, timestamps.
- Feedback data: title/body/labels/metadata submitted through Functions.
- Invite and email queue data: token/email/name/division metadata, expiry, acceptance, and outbound email payloads.

Minimize access to email, phone, FCM tokens, invite metadata, and message content. Keep offboarding/deletion requirements aligned with organizational policy.

## Current security gates

```bash
pnpm audit --audit-level=high
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
pnpm --filter @tennis/firebase-functions build:targeted-deploy
```

## Firebase rules expectations

- Do not introduce broad `allow read, write: if true` grants.
- Run `pnpm check:firebase-rules` and emulator smoke tests for rules changes.
- Keep Firestore document schemas and role checks synchronized with shared types and Functions.

## Deployment expectations

- Use the targeted Functions deploy workflow for routine Functions updates.
- Confirm the deployer service account has least-privilege deploy, Cloud Build, Artifact Registry, service-account-user, and scoped Secret Manager permissions.
- Confirm `GITHUB_TOKEN` can reach the configured feedback repository before deploying feedback changes.

## Historical note

The original May 2026 security review has been condensed into this current operating summary. No unresolved release-blocking findings are tracked in this file for the `1.0.1` stable baseline. Future findings should be added here with owner, severity, mitigation, and verification commands.
