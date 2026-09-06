# Changelog

## [Unreleased]

## [1.1.0] — 2026-09-05

### Added
- Added doubles match tracking end to end: propose, play, score, report, and confirm a four-player match on web and mobile.
- Added fixed-partnership team standings in `divisions/{divisionId}/doublesRankings`, with a Singles/Doubles toggle on both standings screens. A team is identified by the sorted pair of its members' user ids, so the same pairing accumulates one row across a season with no team registration step.
- Added `createDoublesMatch` Cloud Function, plus doubles support in `recordHistoricMatch` and `recordMatchOnBehalf`.
- Added `matchSides` accessors and `doublesTeam` identity helpers to `@tennis/shared`, and `computeDoublesRankings` to the ranking engine.
- Added `useDoublesRankings` to `@tennis/firebase-client`, including a client-side recompute fallback that mirrors the server pass.
- Added a `doublesRankings` CSV export type.
- Added an implementation plan for doubles match tracking and fixed-partnership team rankings, covering the shared side/team helpers, the `doublesRankings` collection, Firestore rules changes, and the web/mobile surfaces involved.

### Changed
- Match reports are now confirmed by the *opposing side* rather than by anyone who did not submit, so a doubles player can no longer confirm their own partner's report. Enforced in Firestore rules and in both apps.
- Firestore `isMatchParticipant` now consults `playerIds`, so a doubles partner can read and update their match; `storage.rules` already worked this way.
- Either opponent can accept a doubles proposal, not only the side's first player.
- Match proposal, acceptance, cancellation, and report notifications now reach every member of the target side instead of a single player.
- PDF match reports and the matches CSV export name each side as a team.
- Round-robin scheduling is explicitly rejected for doubles division levels (server-side and in both admin surfaces) rather than silently creating unplayable 1v1 fixtures.

### Fixed
- Doubles results no longer pool into singles standings: the client-side ranking fallback skips doubles matches, and the two ranking collections are pruned independently.
- Singles/doubles is decided by the match's *shape* (two sides of two players) rather than by the `matchType` label. The label is stamped from the division level onto every match created in it, so ordinary two-player matches inside a doubles level were being dropped from singles standings.
- Clients can no longer write `side1`/`side2`: they are out of the Firestore `matchFields()` allow-list. Because they decide doubles standings credit and report authorization, a member could otherwise create a match naming four uninvolved players and have those partnerships credited, or forge a `side2` to accept their own proposal. `createDoublesMatch` now also requires the creator to be on side 1.
- Recording a doubles match on behalf of players notifies all four, not just each side's first player.
- Doubles standings are bucketed per season (`{seasonId}__{teamId}`) with ranks computed within each season, so a partnership playing across two seasons no longer shows inflated all-time totals under the current one.
- `publishRoundRobinSchedule` reads the stored division level to reject doubles, so an older client that omits `matchType` cannot publish 1v1 fixtures into a doubles level.
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

