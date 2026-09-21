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

The immutable scoring engine owns standard points, deuce/advantage, per-game service rotation, 6–6 tiebreak entry, one-point then two-point tiebreak service blocks, six-point end changes, optional deciding-set play-out, set/match completion, formatting, snapshots, and undo. The phone is authoritative. Watch commands carry protocol version, match id, monotonic sequence and unique event id; the phone rejects duplicates/out-of-order commands and returns an acknowledged snapshot. Reconnect requests the newest snapshot before queued commands are replayed.

Deep links preserve `tennisleague://` and `com.companytennisleague.app://`, routing notification taps to match, message, dispute, schedule, or administrative destinations only after auth/onboarding/role guards. Notification registration requests permission, obtains APNs/FCM tokens, uses atomic token registration/removal, and unregisters listeners on sign-out.

## Android migration entry point

The Android application continues to launch the existing React Native/Expo client while native destinations are under construction. The native Android domain and repository sources compile alongside that host, but a native UI must not become the launcher until it reaches feature parity.

## Removal and validation gate

Do not remove Expo/React Native sources until Android and iOS execute the language-neutral fixtures identically to TypeScript; emulator tests cover rules and authorization; offline/reconnect and listener disposal pass; callable failures are surfaced; FCM/APNs navigation works; PDF and avatar access obey Storage rules; doubles/disputes work; watch delayed/duplicate/out-of-order tests pass; and signed release archives install. Apple project/signing work must be completed on macOS.
