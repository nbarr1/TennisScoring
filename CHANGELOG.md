# Changelog

## [Unreleased]

### Security
- Tightened the Firestore match rules so only the opposing side can settle a result. A new match can no longer carry fields that only exist once it has been played (`undoSnapshot`, `reportSubmission`, `winner`, `completedAt`, `reportUrl`, and the timing fields). An undo must restore and consume the server's snapshot and can only return a match to `scheduled` or `in_progress`. Linking a guest opponent to a completed result reopens it for the linked player to confirm. A guest match must name the `guest` placeholder as its opponent. **Deploy with `firebase deploy --only firestore,storage`; the functions workflow does not deploy rules.**
- Leader-side division callables no longer change a registered account's active division or its contact details. A leader can still add any account to their roster, but its `users/{uid}.divisionId` is set only when it has none or already names that division, and only unregistered placeholders have their email or phone edited.
- `createDivision` no longer demotes an admin or app developer to `division_leader`, and stores the email from the sign-in token rather than the request.
- CSV exports prefix text that a spreadsheet would run as a formula with a single quote.
- Profiles and direct messages are no longer open between two accounts that both have no division.
- The unused `matches/{id}/actions` subcollection is no longer writable.
- Bumped `next` to 16.3.8 (GHSA-vcvr-r3jv-pc5j) and raised the `@grpc/grpc-js` override floor to 1.14.5 (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4), which had turned CI red on `Main`. Removed two `osv-scanner.toml` ignores the scanner reported as unused.

### Added
- Added `firebase/scripts/rules-auth.test.mjs`, an authenticated Firestore rules suite built on `@firebase/rules-unit-testing`, which `pnpm test:rules` (and so CI) runs after the signed-out smoke test. It covers match creation, undo, report confirmation, guest linking, tips, score edits, and division-less accounts.
- Added the `resolveMessageReport` callable. Leaders and admins resolve reports through it, because the rules cannot let a leader delete a message from a direct conversation they are not part of: removing a reported direct message always failed and left the report pending.
- Added `singlesHeadToHeadId()` to `@tennis/shared`, and `isAdminRole()`, which mirrors the rules' `isAdmin()`.
- Added `signOutReleasingPushToken()`, `releasePushToken()`, `readableUserDoc()`, and `setMatchTipsEnabled()` to `@tennis/firebase-client`.
- Added a Messages tab to the native iOS client. It lists the division chat and direct conversations by most recent activity, and titles direct channels with the other player's name. A conversation shows its newest 50 messages. From it you can send messages (up to the 2,000-character limit the rules enforce), share your phone number or email as your contact preferences allow, and report or block another player from a message's context menu. Blocked players' messages are hidden, and Profile lists blocked players with an unblock button. New direct messages start from a division search and reuse an existing direct channel. The Firestore writes match `packages/firebase-client`'s. The list query drops the `orderBy('createdAt')` that `useChannels` adds, since `firestore.indexes.json` declares no composite index for it, and orders channels on the device instead.
- Added a native iOS client built on a new Swift package, `apps/mobile/ios/TennisKit`. `TennisCore` ports `@tennis/shared` to Swift: the score engine (including tiebreak serve order, change-of-ends tips, and game/set/match point), the ranking engine for singles and doubles, the match-side helpers, doubles team ids, and tips. Its models decode sparse and legacy Firestore documents instead of rejecting them: server timestamps, unknown roles, missing `playerIds`, and malformed live scores. `TennisAppModel` holds view models for the session gate, the Matches tab, the match screen, and standings, plus `DemoBackend`, an in-memory backend that plays demo matches with the real engines. The SwiftUI app signs in, joins a division by invite code, lists matches in the Expo client's sections, and scores through `scoreMatchPoint`. It also handles undo, starting a match, proposal responses, and reports, and shows standings by season and level. A debug build without `GoogleService-Info.plist` runs on demo data. See `apps/mobile/ios/README.md`.
- Added `fixtures/mobile-contract/engine-parity.json`, recorded from the TypeScript engines by `pnpm fixtures:mobile-contract`. It holds six complete matches played point by point, including every-set tiebreaks, an advantage deciding set, best of five, and a pro set, along with ranking, match-side, doubles-id, and tip-priority cases. A Jest suite and the Swift suite both replay it, so the TypeScript and Swift engines cannot drift apart without a failing test.
- Added `pnpm ios:test`, and `native-mobile.yml` jobs that run the `TennisKit` tests in the `swift:6.1-noble` container and on macOS.
- Added an "Open on watch" control to the mobile match screen, on the pre-match setup surface and in the Manage Match sheet while a match is scheduled or under way. It calls the new `launchWatchApp()`, which sends an `ACTION_VIEW` intent through `RemoteActivityHelper` (`androidx.wear:wear-remote-interactions`) to every reachable watch that has the app. The control is gated on the new `isWatchAppInstalled()`, a `CapabilityClient` query, rather than on `isWearOsAvailable()`: the latter is true for any connected watch, including one that has never had Tennis Score, so it would show a button that does nothing. Both resolve false where the native module is absent, so nothing renders on iOS.
- Added the watch-side half of a phone "open on watch" control. `:wear`'s `MainActivity` gains a `VIEW`/`DEFAULT`/`BROWSABLE` intent filter on the `tennisleague` scheme plus `launchMode="singleTask"`, and a new `wear/src/main/res/values/wear.xml` advertises the capability `tennis_league_wear_app`. The phone's `RemoteActivityHelper` can only deliver an `ACTION_VIEW` intent carrying a data URI and `CATEGORY_BROWSABLE`, so an intent filter not matching that shape resolves to nothing on the watch and the launch silently no-ops; `singleTask` keeps a remote launch from stacking a second scoreboard over the live one. `NodeClient` reports only that a watch is connected, never that this app is on it, so without the capability the phone control would offer itself for watches that have never had Tennis Score installed. No phone-side behavior changes yet: `:app` and `:wear` install and update independently, so the watch has to be able to answer before the phone starts asking.
- Added `sessionId` to the Wear OS protocol. Snapshot sequence numbers live in the phone's memory and restart at 1 when the process does, so a watch that kept counting across a phone restart rejected every snapshot from the new process as stale and had its own commands rejected in turn. The watch now resets its ordering state when the session id changes, and the phone rejects commands that name a different session.
- Added an answer to the watch's sync request. `addWearSyncRequestListener` had no consumer, so a watch that came to the foreground showed whatever it last saw until the match document happened to change; the match screen now replies with the current snapshot.
- Added `pnpm ios:typecheck` (`scripts/ios-typecheck.sh`), which typechecks the iOS sources against the iOS SDK and the watch sources against the watchOS SDK.
- Added Kotlin unit tests for the Wear command validator covering session mismatch and the pre-v1 command path.

### Changed
- Singles standings are bucketed per season and division level, like doubles. Ranking documents get opaque ids and carry `seasonId`, `divisionLevelId`, and `matchType: 'singles'`, so the dashboards' season filter finally matches them. Singles head-to-head ids are scoped by division, season, and level. Existing documents are pruned by the next recalculation; run **Repair rankings** (`repairAllDivisionRankings`) once after deploying to rebuild every division.
- `users/{uid}.rankingSummary` comes from the player's row in the active season and gains `seasonId`/`divisionLevelId`. The recalculation writes nothing else to user docs.
- All push notifications go through `sendPushToUsers()`, which batches at FCM's 500-token limit and removes tokens FCM reports as permanently invalid. Token registration drops the oldest tokens at the rules' 20-token cap, and every sign-out releases the device's token.
- The targeted functions deploy now also deploys `addPlayerToDivisionByEmail`, `resolveDisputedReport`, `recalculateDivisionRankings`, `repairAllDivisionRankings`, `onNewMessage`, and `resolveMessageReport`.
- `apps/mobile/eas.json` uses `"appVersionSource": "remote"`. With `local`, production builds bumped a copy of `app.json` that CI never committed, so every build would have reused one version code. The first remote build may need `eas build:version:set` if EAS cannot initialize the counter from `app.json`.
- `andorid-ai-agent.yml` is review-only: it runs on pushes that touch `apps/mobile/android/**`, holds `contents: read`, and writes its review to the job summary. The apply mode, which could never find its plan and would have pushed model-written files, is gone.
- Redesigned the mobile live-scoring screen as a split scoreboard, direction B from the live-scoring design canvas. Each player's full-width row is the button that scores their point. It shows the name, serve state, games per set, and the point score in 172 px numerals. A status band between the rows reads the call ("30–15") or the moment ("DEUCE", "BREAK POINT · OKAFOR", "CHANGE ENDS · TAP TO SWAP"). The screen is black and white for glare, player stripes are blue and orange, and every text pairing is at least 9:1.
  - The match screen now hides the stack header and draws its own top bar, which carries back, the set and format, the match clock, and the options menu.
  - Swap exchanges the two rows so each one sits on its player's side of the net. At a changeover, the band itself is the swap control.
  - With advanced stats on, tapping a row opens a Point / Ace / Winner / Opponent error sheet with Cancel, which replaces the hidden long press and the undismissable system dialog.
  - Hold-to-undo fills as it is held, and rule tips moved into the options sheet.
  - Setup lets you pick who serves first before starting, where tapping a name used to start the match at once. It drops the three format cards, which looked selectable but were fixed labels.
  - After the match, the scoreboard shows sets won with a WINNER flag in place of the separate "Match complete" card, and the report actions follow below it.
- Added `expo-font` and `@expo-google-fonts/barlow-condensed` to the mobile app. Only the 600, 700, and 800 weights are loaded, each required directly so the package's other fifteen weights stay out of the bundle, and text falls back to the system font until they load.
- The Apple Watch app scopes every point to a match. Snapshots from the native iPhone app carry the match id, player names, status, and whether the player may score, and the watch echoes the match id in each command. The phone discards commands for any other match, so a watch still showing an earlier match cannot score the current one. Leaving the match screen leaves the watch read-only. A score-only message from the React Native module still displays, but read-only.
- `pnpm ios:typecheck` emits the `TennisKit` modules for the iOS and watchOS simulator SDKs and typechecks the app and watch sources against them, recursing into subdirectories.
- `ci.yml`'s `mobile_native` job now assembles `:wear` as well as `:app`. `:wear` was the one Gradle module no workflow built, so a broken watch manifest or resource surfaced only in an EAS `wear-preview` build. The step runs after the NDK install, which is what accepts the SDK licenses, and before the much longer app assemble so it fails fast.
- Both sides of the Wear protocol now carry the pre-v1 paths (`/tennis/score`, `/tennis/point`, `/tennis/sync-request`) for one rollout. `:app` and `:wear` install as separate artifacts and update independently, so the v1-only switch would have left a mixed pair unable to exchange scores or points until both updates landed. The watch uses the old paths only until it has seen a v1 snapshot, so an updated pair never sends a point twice.
- `sendScoreToWear` no longer rejects. Watch sync is peripheral and the match screen awaits it after the score has already committed, so a transport failure logged a scoring error and skipped the tips and match-completion alert; failures are now logged inside the wrapper, and a Wear node lookup that fails resolves as "no watch reachable" instead of throwing.
- `handlePoint` and `handleUndo` on the match screen are memoized, so the Wear input listener is no longer torn down and re-registered on every render — the match clock re-renders once a second.
- Workflow branch filters name `Main` (the default branch) alongside `main`. Every workflow filtered on `main` alone, which matches nothing here, so CI, CodeQL and the Firebase safety guard had produced no runs on any pull request for a week; a filter that matches nothing yields no runs rather than a failure, so nothing reported it.
- The Firebase safety guard checks out full history and fails closed. It diffed the pull request's base against its head under a shallow checkout, so `git diff` reported "bad object" and the `|| true` turned that into "no rules changes" — the guard passed without reading the diff it exists to read. It also pinned pnpm to `9` while `packageManager` pins `9.15.5`, which `pnpm/action-setup@v6` rejects outright, and set up no JDK, so firebase-tools 15 refused to start the emulators (it requires JDK 21 or newer) — the job now installs Temurin 21, matching `ci.yml`'s `firebase_rules_tests`. All three surfaced the first time the workflow ever ran.
- `.github/workflows/native-mobile.yml` installs Node, pnpm and the workspace before running Gradle, and sets up JDK 17 and the pinned NDK. `android/settings.gradle` resolves its React Native and Expo plugins through Node, so without `node_modules` the build failed while evaluating the settings file. Its iOS job runs the Swift typecheck instead of opening an Xcode project that does not exist in the repository.

### Removed
- Removed the iOS target's `DomainModels.swift`, `ScoreEngine.swift`, `RankingEngine.swift`, and `Repositories.swift`, which `TennisCore` and `TennisAppModel` replace. The old score engine emitted no game, set, or match point tips, did not rotate the server inside a tiebreak, and never signalled a change of ends. Its `User` model also failed to decode any document without `contactPreferences`.
- Removed `.github/workflows/codeql.yml`. Code scanning on this repository runs through GitHub's default setup, and an advanced CodeQL workflow cannot upload results while that is enabled — every run of this workflow failed with `CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled`. Default setup analyzes JavaScript/TypeScript, Python and Actions, so it already covers more than this workflow's JavaScript/TypeScript-only matrix. To move to an advanced configuration, disable default setup in the repository settings first.

### Fixed
- The score engine's service court alternates on every point, in games and tiebreaks. It stayed on "deuce" for a whole game and was inverted through a tiebreak.
- After a tiebreak, the player who received its first point serves first in the next set. The engine gave the serve back to the tiebreak's opening server for totals such as 7-0, 7-1, 7-4, and 7-5, which also credited that set's serve and break-point stats to the wrong player. Ported to the Kotlin and Swift engines, with `engine-parity.json` regenerated.
- Ranking recalculations no longer re-attach players removed from a division, switch a multi-division player's active division, or revive placeholders merged into real accounts. `acceptInvite` now moves a matching placeholder's matches and memberships to the new account.
- Renaming or deleting an account no longer drops that player's matches from the standings. The recalculation skipped any match whose stored name differed from the current display name.
- Standings on the dashboards include zero-match players for every member, not only leaders. The roster listener read private user docs that only leaders may read.
- Season views with several levels and no level filter no longer merge rows ranked in different tables into one list (singles and doubles).
- `onMatchUpdate` recalculates standings even when the same write sends a notification, and a failed notification no longer aborts the recalculation.
- Blocked senders' messages no longer arrive as push notifications.
- `resolveDisputedReport` only resolves disputed matches, validates its input, and admits admins as well as leaders. Admin checks in the callables accept app developers, as the rules do.
- Account deletion detaches the account from every division, archives its memberships, and removes it from division group chats.
- `acceptInvite` checks and marks the invite inside one transaction.
- Admin roster loads tolerate members whose private user doc the leader cannot read, instead of failing the whole roster.
- A score edit clears the old report link, so the PDF is rebuilt for the confirmed score. Report links are only rendered when they use `https`.
- The mobile scoreboard shows "Disputed" and "Cancelled" results instead of "Not started", shows every set of a best-of-five match, reads the game score server first, only offers the swap prompt when swapping is possible, and offers ACE only for the server (the server also ignores an ace credited to the receiver). START MATCH waits for its write and reports failures, the point-type sheet waits while another point is recorded and closes if the match ends, the fallback font weights match the design, and the rule-tips toggle works for players.
- `@babel/core` 8 no longer installs as an auto-resolved peer; `apps/web`, `packages/firebase-client`, and `firebase` pin it to 7.
- Removed the orphan `android-skills` gitlink, which had no `.gitmodules` entry and made every CI checkout log a submodule error.
- Raised the `pnpm.overrides` floors for `brace-expansion` (5.0.12, and 1.1.21 under `minimatch@3`), `joi` (18.2.6), and `js-yaml` (5.4.1) to clear advisories GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7, GHSA-q2hr-2g5m-vwhr, GHSA-6h2x-m376-mqjq, and GHSA-r3ph-w7gj-g6xm, which failed the `pnpm audit` and OSV steps.
- Fixed the live-scoring status pill reading "Break point" at deuce. `getStatusState()` counted any player on 40 as able to win the game on the next point, so 40-40 always flagged the receiver, "Deuce" could never appear, and at 40-Ad the receiver on 40 was flagged instead of the server holding the advantage. The logic now lives in `getMatchMoment()` in `@tennis/shared`, which counts 40 only against an opponent below 40, and is covered by tests.
- Fixed "Side change" staying on the status pill for a whole game after every odd game. It now shows only at the changeover: the first point after an odd game, and every six points of a tiebreak.
- Darkened the live-scoring tap zones to `#0B4FA0` and `#9E1B14` and made their text solid white. White text measured 3.5:1 and 3.1:1 on the old fills, below the WCAG AA minimum of 4.5:1; it now measures 7.9:1 and 8.0:1. The lighter blue and red remain as player accents elsewhere on the screen.
- Removed the ↺ and ⇄ symbols beside hold-to-undo. They looked like buttons but had no handlers.
- Moved rule tips to the top of the match screen and made them transparent to touches. Anchored at the bottom, a tip covered hold-to-undo and blocked taps on it for about five seconds.
- Both players on each doubles side can score points. `scoreMatchPoint` admitted only `player1Id` and `player2Id`, which in a doubles match are each side's first member, so the second partner on each side got `permission-denied` from the controls the web and Expo apps showed them. It now admits anyone on either side through `sideOfPlayer()`. That reads the server-written side rosters, which clients cannot set, and falls back to `player1Id`/`player2Id` for singles, so singles admit exactly the same two players as before. The native iOS client, which hid the controls to match the old rule, now shows them to both partners. The fix takes effect once `scoreMatchPoint` is deployed.
- Messages from the 51st onward now appear on the web and mobile message screens. `channelMessagesQuery` ordered `createdAt` ascending with `limit(50)`, which selects a channel's *oldest* 50 messages, so once a channel passed 50, new messages never showed and the screen stayed on the start of the conversation. The query now reads the newest 50 in descending order, and `useMessages` returns them oldest first through the new `messagesFromSnapshot()`, so both screens render in the same order as before. The descending query uses Firestore's automatic single-field index, so no index deploy is needed.
- `eas-build.yml` selects the `production` profile on a push to `Main`. It compared `github.ref` against `refs/heads/main` alone and the comparison is case-sensitive, so after the default branch was renamed to `Main` that branch of the conditional matched nothing and every merge built `preview` instead — the production profile had never run. Both spellings are now named, as every workflow's branch filter already does. Note the consequence: merging to `Main` now starts a production EAS build, which carries `autoIncrement: true`.
- The Wear native module now releases its Data Layer listener. React Native calls `removeListeners` with the positive count of subscriptions being removed, so the `count <= 0` test never fired and the listener stayed registered after the match screen unmounted, accepting and acknowledging watch commands with no handler to apply them.
- The Wear snapshot counter and acknowledgement ring are guarded by a lock. `sendScore` runs on the native modules thread while inbound commands arrive on the Wearable callback thread, so both mutated the same unsynchronized state.
- Acknowledged event ids are serialized as a JSON array rather than a Java list's `toString()`.
- Reworked the web `/admin` page around the two jobs leaders actually do — adding players and assigning them to a division for a season. The season is now a single page-level selector in the header (with a `N players · N division levels · N unassigned` summary), and the page is split into **Roster**, **Divisions**, and **Tools** tabs so only one panel renders at a time.
- Added a roster toolbar with live name/email search, filter chips (`All`, `Unassigned`, one per division level with counts), and **Import roster** / **Add player** actions.
- Added an unassigned callout above the roster that names how many players have no division for the selected season and jumps to the Unassigned filter.
- Added inline division assignment to every roster row: a `<select>` that saves immediately and flashes a transient "Saved" label. Unassigned rows carry the app's warning tint so they are scannable at a glance.
- Added bulk assignment: selecting rows raises a fixed bar that assigns every selected player to one division level in a single action.
- Added an inline **Add player** panel (name, email, division) and an **Import roster** modal that parses pasted `Name, email` lines with a live detected-player count.
- Added the `removeDivisionMembership` Cloud Function and its `@tennis/firebase-client` wrapper. The roster's remove action and moving a player back to "Unassigned" both archive the season membership with the existing `status: 'removed'` value rather than deleting the document, so historical records that reference it keep resolving.

### Changed
- The admin players table is now a six-column grid (checkbox · Player · Email · Status · Division · remove) with an initials avatar per player. The Role and Phone columns moved off the roster grid into the player detail panel, which opens from the player's name.
- The `⋯` overflow menu is replaced by a single `×` remove button that turns destructive on hover.
- The "Seasons & Division Levels" block moved to the Divisions tab and renders each level as a card (name, format, player count) alongside a dashed "+ New division level" card.
- The round-robin scheduler, reported-message queue, ranking repair, and CSV exports moved off the main page into four equal cards on the Tools tab.
- The round-robin scheduler, level editor, and CSV exports read the page-level season instead of carrying their own season dropdowns.
- `useDivisionMemberships` takes a `statuses` argument (default `['active']`). The admin roster passes `['active', 'waitlisted']` so waitlisted players are no longer rendered as unassigned, counted in the "no division" warning, or silently flipped back to active by their next assignment. The round-robin schedulers keep the active-only default.
- `removeDivisionMembership` archives waitlisted memberships as well as active ones, and detaches a player from `divisions.playerIds` and `users/{uid}.divisionId` once they hold no membership in any season of the division, so a removed player no longer reappears on the roster as unassigned.
- `removeDivisionMembership` records the remover in new `removedBy`/`removedAt` fields instead of overwriting `assignedBy`, which preserves the audit trail the archive exists for.
- Archiving a player's prior memberships for a season moved into `upsertMembershipDocument`, so the placeholder-add and season-level backfill paths get it too and a player can no longer hold two live memberships for one season.
- Roster imports and bulk assignment issue their writes with bounded concurrency instead of one serial round-trip per player, and report partial success with the failed rows left selected rather than aborting on the first error.
- Moved roster-import parsing and the bulk-write concurrency helper into `@tennis/shared` (`roster/rosterImport.ts`) so both are covered by tests.

### Fixed
- Pasting a bare column of email addresses into **Import roster** now creates placeholder players with the address in the email field, instead of naming the player after the address and leaving the email empty (which produced un-inviteable duplicates of real accounts). Repeated rows for one person are de-duplicated before import.
- A failed bulk assignment no longer leaves the roster showing a division that was never saved; the optimistic value is rolled back for exactly the rows that failed.
- Setting a just-added player to **Unassigned** no longer snaps their row back to the division they were added to.
- The roster's remove action reports when there was nothing to remove, instead of appearing to do nothing.
- Removing a player no longer strands a stale optimistic override that could mask later changes made from another device.
- The roster renders one row per player rather than one per membership document, so legacy duplicate memberships can no longer produce duplicate React keys or leave the select-all checkbox stuck indeterminate.
- `removeDivisionMembership` is exported from the targeted-deploy bundle and listed in the targeted Functions deploy workflow, so the roster's remove and unassign actions no longer fail with `functions/not-found` on a targeted release. `backfillMissingProfiles` was missing from the same workflow list and has been added.
- The targeted Functions deploy workflow triggered on pushes to `main`, a branch that does not exist in this repository, so the push trigger could never fire. It now names the default branch, keeping `main` alongside it in case the default is renamed.
- Removed the `deploy_production` job from the targeted Functions deploy workflow. Its only step echoed a message, so a run that appeared to promote to production deployed nothing. The workflow is now explicitly staging-only.

### Removed
- Removed Firebase Crashlytics and the mobile crash-reporting bridge so the app does not collect crash analytics, consistent with the privacy policy.

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
- Doubles standings are bucketed independently per season and division level, so results and head-to-head tiebreaks cannot leak across competition buckets. Ranking, team, and head-to-head document IDs use collision-safe opaque encoding rather than delimiter-based concatenation.
- Doubles match callables validate requested seasons and levels and require all four players to have active membership in the selected level before standings-affecting data is written.
- Web and mobile doubles player pickers now ignore stale asynchronous search responses.
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
