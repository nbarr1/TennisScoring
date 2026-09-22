# Native mobile parity inventory

This inventory is the removal gate for the Expo client. The reference implementation remains in place until native acceptance and release builds pass.

## Routes and guards

| Reference route | Native destination | Guard/capability |
|---|---|---|
| `(auth)/login` | Login | signed-out only; email/password and Google authentication |
| `(onboarding)/division` | Division | authenticated user without a division |
| `(onboarding)/tutorial` | Tutorial | authenticated user with incomplete tutorial |
| `(tabs)/index` | Dashboard | authenticated/onboarded |
| `(tabs)/matches`, `match/[id]` | Matches, match detail/live score | participants score/report/dispute; leaders resolve |
| rankings | Rankings | division member; singles/doubles and season/level filters |
| `(tabs)/messages` | Messages/channels | membership and block/moderation checks |
| `(tabs)/profile` | Profile/availability | owner edits contact preferences, slots, photo and account |
| `(tabs)/admin` | Administration | `division_leader`, `admin`, or `app_developer` |
| feedback | Feedback | authenticated submitter |
| privacy-policy | Privacy | public |
| round-robin-scheduler | Round robin | privileged role |

## Backend contract

Firestore collections used by the reference client are `users`, `publicProfiles`, `divisions`, `divisionLevels`, `seasons`, `matches`, `rankings`, `doublesRankings`, `channels`, `messages`, `feedback`, `invites`, and moderation/block records. Operations include authenticated document reads, realtime match/ranking/channel listeners with cleanup, profile and availability updates, atomic FCM-token array updates, match lifecycle writes, report confirmation/dispute resolution, scheduling, roster/invite administration, feedback creation, Storage avatar/PDF access, and callable Functions. Native conversion is centralized and represents every date as Unix milliseconds.

Roles use exact wire values `player`, `division_leader`, `admin`, and `app_developer`. Match states are `proposed`, `scheduled`, `in_progress`, `pending_report`, `completed`, `disputed`, and `cancelled`. Rankings update only after confirmation and sort by matches won, sets won, games won, game differential, head-to-head, then display name. Singles and fixed-partnership doubles use the same ordering.

## Scoring and cross-device behavior

The immutable scoring engine owns standard points, deuce/advantage, per-game service rotation, 6–6 tiebreak entry, one-point then two-point tiebreak service blocks, six-point end changes, optional deciding-set play-out, set/match completion, formatting, snapshots, and undo. The phone is authoritative.

The Wear protocol (v1) is implemented on both sides today. Watch commands carry protocol version, phone session id, match id, a monotonic sequence and a unique event id; the phone rejects commands that fail any of those checks, and each snapshot carries the event ids it has applied. The watch resets its ordering state when the session id changes, which is what keeps a restarted phone from having every snapshot rejected as stale. On resume the watch requests the newest snapshot and the phone answers from the open match screen.

Two parts of that contract are not finished. The watch does not yet queue commands while disconnected, so the acknowledged event ids in each snapshot are carried but not acted on; and both sides still accept the pre-v1 paths so a phone and a watch that update at different times keep working. Remove the pre-v1 branches once a v1 build of `:app` and `:wear` has shipped, and implement replay before claiming offline parity.

Deep links preserve `tennisleague://` and `com.companytennisleague.app://`, routing notification taps to match, message, dispute, schedule, or administrative destinations only after auth/onboarding/role guards. Notification registration requests permission, obtains APNs/FCM tokens, uses atomic token registration/removal, and unregisters listeners on sign-out.

## Android migration entry point

The Android application continues to launch the existing React Native/Expo client while native destinations are under construction. `MainActivity` is a `ReactActivity`, and Metro and the JavaScript runtime are hosted as before. The native Kotlin domain and repository sources (`app/src/main/java/com/companytennisleague/app/domain` and `.../data`) compile alongside that host and are covered by the module's unit tests, but nothing in the shipping app reaches them yet: they add Firebase dependencies and code to release builds that no entry point calls. A native UI must not become the launcher until it reaches feature parity and clears the gate below.

## iOS migration entry point

No Xcode project is committed, so there is no iOS app to build and nothing exercises the Swift sources at runtime. `pnpm ios:typecheck` typechecks `TennisScoring` against the iOS SDK and `TennisScoringWatch` against the watchOS SDK, which is the whole of the current signal. Creating the project, its targets, signing, and XCTest targets is the next step, and it has to happen on macOS.

## Removal and validation gate

Do not remove Expo/React Native sources until Android and iOS execute the language-neutral fixtures identically to TypeScript; emulator tests cover rules and authorization; offline/reconnect and listener disposal pass; callable failures are surfaced; FCM/APNs navigation works; PDF and avatar access obey Storage rules; doubles/disputes work; watch delayed/duplicate/out-of-order tests pass; and signed release archives install. Apple project/signing work must be completed on macOS.
