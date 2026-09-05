# Changelog

## [Unreleased]

### Added
- Added an implementation plan for doubles match tracking and fixed-partnership team rankings, covering the shared side/team helpers, the `doublesRankings` collection, Firestore rules changes, and the web/mobile surfaces involved.
- Added production release readiness plan documenting concrete release gating, distribution, and post-release patch workflow (dated 2026-05-28).
- Clarified Phase 0 release-candidate freeze instructions so deployment does not assume a local `main` branch exists.
- Added `backfillMissingProfiles`, `health`, and `readiness` Cloud Functions.

### Fixed
- Fixed the `profiles/{userId}` Firestore rule so a signed-in user can self-write their own `displayName`/`avatarUrl`/`tutorialDone`/`id`/`updatedAt`; this was previously admin-only and silently broke every non-admin profile save on web and mobile.
- Resolved the CI dependency-audit gate: 48 of 50 known vulnerabilities in transitive dev/build-tool packages fixed via `pnpm.overrides`; the remaining 2 (`image-size`, no upstream fix) are suppressed with justification in `osv-scanner.toml`.

## [1.0.1] — 2026-05-20

### Added
- Added web division onboarding page to create a division or join by invite code, bringing onboarding parity with mobile.

### Fixed
- Updated web tutorial completion flow to route users into division onboarding before dashboard access.
- Added dashboard CTA for users without a division to open onboarding directly.

### Changed
- Bumped workspace and app versions from 1.0.0 to 1.0.1 for patch release.

