# Tennis League Scoring — Native Android App Build Brief

Hand this document to a build agent as the complete brief for a **native Android app built from scratch** with full feature parity with this repository's existing Expo/React Native mobile app, reusing the same Firebase backend and data model.

## 1. Product summary

A native Android client (Kotlin + Jetpack Compose) for an existing tennis league scoring platform. It must interoperate live with an existing Firebase project that already backs a Next.js web app and an Expo/React Native mobile app — same Firestore schema, same Cloud Functions, same Firebase Auth users. Build only the Android client; do not modify or fork the backend.

Core capabilities: propose/accept/schedule matches, live point-by-point scoring with full tennis rules (deuce/ad, tiebreaks, best-of-3/5/pro-set), win/loss report submission and confirmation, division rankings, division/player/season management, in-app messaging, push notifications, a feedback form, an admin panel for division leaders, and a Wear OS companion app that mirrors live score to the watch and accepts point input from it.

## 2. Tech stack

- Kotlin, Jetpack Compose (Material 3), single-activity + Navigation-Compose.
- Firebase Android SDK: Auth, Firestore (real-time listeners), Cloud Functions (callable), Cloud Messaging (FCM), Storage (for generated PDF match reports).
- Wear OS module: separate Kotlin app/module using the Wearable Data Layer API (`MessageClient`/`DataClient`) to talk to the phone app.
- MVVM: ViewModel + StateFlow per screen, repository layer wrapping Firestore/Functions calls.
- DI: Hilt (or manual factory injection if the agent prefers to skip a DI framework).

## 3. Firebase project integration (reuse, do not redesign)

Register a new Android app in the existing Firebase project; the building agent will need `google-services.json` supplied by the user (do not fabricate one). Firestore, Auth, Functions, Storage, and FCM all point at the existing project — the Android client must not create parallel collections or alternate schemas.

### 3.1 Firestore collections (exact paths and typed shapes)

```
users/{uid}                                  — private profile (see §3.2 User)
profiles/{uid}                               — public profile (no PII)
divisions/{divisionId}                       — Division
divisions/{divisionId}/levels/{levelId}      — DivisionLevel
divisions/{divisionId}/memberships/{id}      — DivisionMembership (id = `${seasonId}_${levelId}_${userId}`)
divisions/{divisionId}/rankings/{userId}     — PlayerRanking
matches/{matchId}                            — Match (top-level collection, filter by divisionId)
channels/{channelId}                         — Channel
channels/{channelId}/messages/{messageId}    — Message
headToHead/{h2hId}                           — HeadToHead (id = sorted([p1Id,p2Id]).join('_'))
```

Never write Firestore documents directly outside these shapes; never invent new top-level collections. Common queries to replicate:

- Matches in a division: `where(divisionId==X) orderBy(createdAt desc)`
- Live matches: `where(divisionId==X) where(status=='in_progress')`
- Completed matches for ranking fallback: `where(divisionId==X) where(status=='completed')`
- Matches for a player: `where(playerIds array-contains uid) orderBy(createdAt desc)`
- Rankings: `orderBy(rank asc)` under `divisions/{id}/rankings`
- Channels for a user: `where(participantIds array-contains uid) orderBy(createdAt desc)`
- Messages in a channel: `orderBy(createdAt asc) limit(50)`

### 3.2 Core data types (Kotlin data classes must mirror these exactly — field names, optionality, and units)

**User** (`users/{uid}`, private — email/phone/FCM tokens live here only):
`id, displayName, email, phone?, avatarUrl?, contactPreferences{allowEmail,allowSMS,allowInApp}, availability?{slots:[{day, from:"HH:MM", to:"HH:MM"}], note?}, divisionId?, role: player|division_leader|admin|app_developer, fcmTokens:[String], tipsEnabled, tutorialDone?, isRegistered?, inviteStatus?: none|invite_sent|registered, invitedAt?, invitedBy?, rankingSummary?{divisionId,rank,matchesPlayed,matchesWon,matchesLost,setsWon,setsLost,gamesWon,gamesLost,gameDifferential,updatedAt}, createdAt, updatedAt` (all timestamps are **Unix epoch milliseconds**, not Firestore `Timestamp`).

**PublicProfile** (`profiles/{uid}`, safe to read for any division member): `id, displayName, avatarUrl?, divisionId?, role, tutorialDone?, rankingSummary?, updatedAt`.

**Division**: `id, name, inviteCode, leaderIds:[String], playerIds:[String], activeSeasonId?, createdAt, updatedAt`.

**Season** (sub-concept, id format `${half}-${year}`, half ∈ spring|fall): `id, divisionId, year, half, name, startsAt?, endsAt?, status: draft|active|completed|archived, createdAt, updatedAt`.

**DivisionLevel** (`divisions/{id}/levels/{levelId}`): `id, divisionId, seasonId, year, seasonHalf, name, skillLevel: beginner|intermediate|advanced|open, matchType: singles|doubles, description?, rankingsEnabled, active, sortOrder, createdAt, updatedAt`.

**DivisionMembership** (`divisions/{id}/memberships/{id}`, `id = seasonId_levelId_userId`): `id, divisionId, seasonId, divisionLevelId, userId, displayNameSnapshot, emailSnapshot?, phoneSnapshot?, role: player|division_leader, status: active|waitlisted|removed, source: registered_user|placeholder|imported|migration, assignedBy, createdAt, updatedAt`.

**Match** (`matches/{id}`): `id, divisionId, seasonId?, divisionLevelId?, matchType?: singles|doubles, side1?{playerIds:[String], displayName?}, side2?{same}, player1Id, player2Id, player1Name?, player2Name?, player2IsGuest?, playerIds:[String], format: {setsToWin, gamesPerSet, tiebreakAt, finalSetTiebreak}, status: proposed|scheduled|in_progress|pending_report|completed|disputed|cancelled, liveScore: LiveScore (§4), stats: MatchStats, advancedStatsEnabled?, currentSetStartedAt?, matchDurationMs?, reportSubmission?{submittedBy, submittedAt, status: pending_confirmation|confirmed|disputed, confirmedBy?, confirmedAt?, disputedBy?, disputedAt?, leaderNotifiedAt?}, winner?: player1|player2, reportUrl?, tipsEnabled, undoSnapshot?, source?: live|manual, isDivisionMatch?, createdBy, scheduledAt?, startedAt?, completedAt?, createdAt`.

**Channel** (`channels/{id}`): `id, type: division|direct, divisionId?, participantIds:[String], name?, lastMessage?{content, senderId, senderName, timestamp}, createdAt`.

**Message** (`channels/{id}/messages/{id}`): `id, channelId, senderId, senderName, content, type: text|system|contact_share, sharedContact?{phone?, email?}, readBy:[String], createdAt`.

**PlayerRanking** (`divisions/{id}/rankings/{userId}`): `userId, displayName, divisionId, season, seasonId?, divisionLevelId?, matchType?, rank, matchesPlayed, matchesWon, matchesLost, setsWon, setsLost, gamesWon, gamesLost, gameDifferential, updatedAt`.

**HeadToHead** (`headToHead/{id}`): `id, divisionId, player1Id, player2Id, player1Wins, player2Wins`.

### 3.3 Cloud Functions to call (already deployed — call them, do not reimplement server logic)

Callable HTTPS functions the Android app must invoke via the Firebase Functions SDK:

- `proposeMatch`, `acceptMatchProposal`, `declineMatchProposal` — scheduling workflow.
- `submitMatchReport`, `confirmMatchReport`, `disputeMatchReport` — report workflow.
- `resolveDisputedReport` — division-leader-only dispute resolution.
- `recalculateDivisionRankings` — manual ranking recompute (leader/admin only).
- `createDivision`, `joinDivisionByCode`, `addPlayerToDivisionByEmail`, `addDivisionMemberPlaceholder`, `mergeDivisionPlayerRecords`, `updateDivisionPlayerEmail`, `upsertDivisionLevel`, `upsertDivisionMembership`, `exportDivisionCsv` — division/admin management.
- `sendInvite`, `getInvitePreview`, `acceptInvite` — invite flow.
- `submitFeedback` — feedback form (the *only* integration point that talks to GitHub; never call GitHub directly from the app).

Background triggers already run server-side on Firestore writes (FCM notifications on proposal/report events, ranking recalculation on confirmed reports, PDF report generation on match completion) — the Android app does not need to replicate this logic, only read the resulting state changes in real time.

### 3.4 Auth flow

Firebase email/password auth (no OIDC/PingID — ignore any legacy references). On successful sign-in/sign-up, the client has a Firebase ID token and a `users/{uid}` doc (auto-created server-side by an `identity.beforeUserCreated` trigger). App-level guard sequence, mirroring the Expo app's `AuthGuard`: **not authenticated → login/signup screen; authenticated but no `divisionId` → division join/create screen; `divisionId` set but `tutorialDone` false → tutorial screen; else → main app**.

## 4. Live scoring engine (must be a faithful, pure Kotlin port)

Port `packages/shared/src/scoring/scoreEngine.ts` line-for-line in behavior. This is the most correctness-critical piece — write it as a pure, side-effect-free Kotlin object operating on immutable data classes, and unit test it (see §9).

**Data shapes:**

- `TennisPoint`: `0 | 15 | 30 | 40 | Ad` (enum).
- `MatchFormatConfig { setsToWin, gamesPerSet, tiebreakAt, finalSetTiebreak }`. Default: `{setsToWin=2, gamesPerSet=6, tiebreakAt=6, finalSetTiebreak=true}`.
- `SetScore { setNumber, player1Games, player2Games, tiebreak?{player1Points,player2Points}, winner?, startedAt?, completedAt?, durationMs? }`.
- `GameScore { player1: TennisPoint, player2: TennisPoint }`.
- `LiveScore { sets: List<SetScore>, currentSet: Int (0-based), currentGame: GameScore, isTiebreak: Boolean, tiebreakScore?, server: Player, serviceSide: deuce|advantage, player1SetsWon, player2SetsWon }`.
- `ScoreResult { nextScore: LiveScore, tips: List<TipTrigger>, matchWinner?, setCompleted?{setIndex,winner}, gameCompleted?{winner} }`.
- `TipTrigger`: `service_change | tiebreak_start | deuce | advantage | game_point | set_point | match_point | new_set | match_complete`.

**Core function** `applyPoint(score: LiveScore, scorer: Player, format: MatchFormatConfig): ScoreResult` — pure, returns a new `LiveScore`, never mutates the input. Exact rules to replicate:

1. **In a game (not tiebreak):** standard 0→15→30→40 progression. At 40-40 it's deuce; the next point winner gets `Ad`; if the player with `Ad` wins the next point they win the game, if they lose it goes back to 40-40 (`deuce` tip). Emit `advantage` tip when a player reaches Ad, `deuce` tip when returning to 40-40.
2. **Opportunity tips** (`game_point` / `set_point` / `match_point`, at most one, mutually exclusive): compute *before* returning, based on who is one point from winning the current game, and whether winning that game would also win the set (games ≥ `gamesPerSet` and margin ≥ 2) and/or the match (sets won would reach `setsToWin`). A set/match point is a *superset* of a game point — the game-point gate must apply first.
3. **Game won:** reset `currentGame` to 0-0, `serviceSide` resets to `deuce`, increment the winner's game count in the current set.
4. **Tiebreak trigger:** when both players reach `tiebreakAt` games (6-6 by default) in the current set — **except** skip the trigger in the deciding set when `finalSetTiebreak` is `false` (advantage-set: play on until someone leads by 2). When triggered: flip server, reset `serviceSide` to deuce, set `isTiebreak=true`, initialize `tiebreakScore={0,0}`, emit `service_change` then `tiebreak_start`.
5. **Normal game end (no tiebreak):** rotate server, emit `service_change`; check set completion (`resolveSetWinner`: games ≥ `gamesPerSet` and margin ≥ 2).
6. **Tiebreak scoring:** first to 7 points win-by-2 (`p ≥ 7 && p - other ≥ 2`). Service rotates: one opening point on original server, then alternating blocks of 2. Ends flip every 6 total points (`service_change` tip, no server change on that specific rule — service alternation is independent of end-switching). On tiebreak win, the winner's set-games count becomes `loserGames + 1` (i.e., 7-6), record `tiebreak` result on the `SetScore`, mark `winner`, then run set completion.
7. **Set completion:** mark `SetScore.winner`; increment `player1SetsWon`/`player2SetsWon`; if a player reaches `setsToWin`, emit `match_complete` and set `matchWinner`. Otherwise start a new set: increment `currentSet`, push a fresh empty `SetScore`, reset `currentGame` to 0-0, `serviceSide=deuce`, emit `new_set`.

**Helper functions to port:**

- `createInitialScore(format)` → blank `LiveScore` (`sets=[{setNumber=0,0,0}], currentSet=0, currentGame=0-0, isTiebreak=false, server=player1, serviceSide=deuce, player1SetsWon=0, player2SetsWon=0`).
- `formatScoreDisplay(score)` → e.g. `"6-4, 3-6, 7-5"`, tiebreak sets rendered as `"7-6(4)"` (loser's tiebreak points in parens).
- `formatGameScore(score)` → tiebreak shows raw point count `"4-2"`; otherwise `"Deuce"` at 40-40, `"Ad In"/"Ad Out"` relative to current server, `"Love-all"` at 0-0, `"X-all"` when tied, else `"<P1 pts> – <P2 pts>"` with `0` rendered as `"Love"`.

**Undo:** a match doc carries an `undoSnapshot` (previous `liveScore`, `status`, `winner?`, `completedAt?`, `stats`, `currentSetStartedAt?`, `matchDurationMs?`) written before applying a point, so a single-level "undo last point" action can restore it. Only one level of undo is supported (no undo stack).

**Match stats (optional per match, gated by `advancedStatsEnabled`):** per-player counters — aces, doubleFaults, firstServeIn/firstServeTotal, winners, unforcedErrors, servicePointsWon/servicePointsTotal, receivingPointsWon/receivingPointsTotal, breakPointsWon/breakPointsFaced. Provide UI to increment these during a live match when advanced stats are enabled for that match.

## 5. Rankings engine (pure Kotlin port)

Port `packages/shared/src/scoring/rankingEngine.ts`:

- `computeRankings(inputs: List<RankingInput>, headToHeads: List<HeadToHead>): List<PlayerRanking>` — sort by, in order: **(1) matches won desc, (2) sets won desc, (3) games won desc, (4) game differential desc, (5) head-to-head wins-vs-opponent desc, (6) display name alphabetical** as a final stable tiebreaker. Assign `rank = index + 1` after sorting.
- `updateRankingWithMatchResult(existing, won, setsWon, setsLost, gamesWon, gamesLost)` — pure incremental accumulator helper (used for client-side optimistic/fallback computation only — the server is the source of truth and rankings should primarily come from the `divisions/{id}/rankings` subcollection via real-time listener).
- `extractMatchTotals(sets)` — derive `{p1Sets, p2Sets, p1Games, p2Games}` from a completed match's `SetScore[]`, inferring a set winner from game counts when `winner` is unset (standard win: loser games ≤ winner games − 2 and winner ≥ 6; or a 7-5/7-6 result).
- **Client behavior:** subscribe to `divisions/{id}/rankings` ordered by `rank asc` for the rankings screen. If that subcollection is empty/stale, fall back to querying `completedDivisionMatchesQuery` for the division and recomputing via `computeRankings` locally, exactly mirroring the web/Expo `useRankings` hook fallback behavior — never write client-recomputed rankings back to Firestore (only the Cloud Function does that).

## 6. Screens and navigation (mirror the Expo app's structure)

Auth-gated navigation graph:

```
(auth): Login, Sign up
(onboarding): Division join/create, Tutorial (first-run walkthrough)
(main tabs): Home/Dashboard, Matches, Messages, Profile, Admin (leader/admin only)
match/{id}: Match detail — pending scheduling actions, live scoring UI, report submission/confirmation, completed match summary + PDF report link
feedback: standalone feedback form (reachable from a menu, not a tab)
```

- **Home/Dashboard**: at-a-glance current division, rank, upcoming/pending matches, unread message indicator.
- **Matches tab**: sectioned list — *Pending* (proposals awaiting my response), *Awaiting* (proposals I sent, awaiting opponent), *Upcoming* (scheduled), *Live*, *Pending Report*, *Completed/History*. Each match row shows opponent, status badge (label/color per `MATCH_STATUS_METADATA`, §7), and format. Includes a "propose match" flow (pick opponent from division roster, optional proposed time referencing the opponent's `Availability`).
- **Match detail**: renders differently per `status` — proposed (accept/decline for opponent, withdraw for proposer), scheduled (start match → creates live score, sets status `in_progress`), in_progress (full scoring UI, §4), pending_report (submit report if I'm the winner; confirm/dispute if I'm the opponent), completed (final score, stats if enabled, link to generated PDF report from Storage via `reportUrl`), disputed (status + note that a division leader must resolve it).
- **Rankings** (likely a sub-view under Matches or Home, per division/level): table sorted by rank with matches/sets/games won-lost, game differential; season/division-level filter.
- **Messages tab**: channel list (division channel + direct message channels), per-channel thread view supporting text, system messages, and contact-share messages; real-time via Firestore listener; unread badges from `readBy`.
- **Profile tab**: display name, avatar, contact preferences, tips toggle, and a weekly **availability editor** (per-day time-range slots + free-text note) surfaced to opponents when they propose a match.
- **Admin tab** (visible only to `division_leader`/`admin`/`app_developer` roles): division roster management (add player by email, add placeholder member, merge duplicate player records, update a player's email, manage seasons/division levels, resolve disputed match reports, trigger manual ranking recalculation, export division CSV).
- **Feedback screen**: simple form (category + free text) that calls the `submitFeedback` callable — never talks to GitHub directly from the client.
- **Push notifications**: register FCM token into `users/{uid}.fcmTokens` on login; handle notification taps by deep-linking to the relevant match/channel.

## 7. Match status model (must match exactly — labels, icons, semantics)

| status | label | meaning |
|---|---|---|
| `proposed` | Proposed | new match created, opponent hasn't responded |
| `scheduled` | Scheduled | opponent accepted, not yet started |
| `in_progress` | Live | actively being scored |
| `pending_report` | Pending Report | match finished, awaiting a submitted report |
| `completed` | Final | report confirmed by both players — **rankings update only from this state** |
| `disputed` | Disputed | non-submitting player rejected the report; awaits division leader |
| `cancelled` | Cancelled | proposal declined/withdrawn |

Match lifecycle: `proposed → scheduled → in_progress → pending_report → completed` (or `→ disputed`, resolved by a leader back to `completed` or reopened); proposals can go straight to `cancelled`.

## 8. Wear OS module

Separate Wear OS Kotlin app/module paired to the phone app via the Wearable Data Layer API:

- Phone → watch: `sendScoreToWatch(score: LiveScore)` pushes the current `LiveScore` (or a minimized watch-face-friendly projection of it: current game score, set scores, server) so the watch face shows the live score.
- Watch → phone: point-input taps on the watch send point events back to the phone, which runs them through the same `applyPoint` engine (single source of truth stays on the phone) and re-broadcasts the resulting score.
- Expose `isWearOsAvailable(): Boolean` / connection-state observation, mirroring the Expo module's `isWearOsAvailable()`/`addWearScoreInputListener` contract.
- **Any change to the `LiveScore` shape must be reflected identically on both the phone module and the watch module** — keep one shared Kotlin model file/module referenced by both.

## 9. Testing expectations

- Unit tests (JVM, no Android dependencies) for the ported `scoreEngine` covering: full game progression, deuce/advantage cycling, tiebreak entry/scoring/service rotation, advantage-set (`finalSetTiebreak=false`) deciding-set behavior, set/match completion, and every `TipTrigger` firing at the correct point (especially the game-point vs set-point vs match-point mutual exclusivity rule).
- Unit tests for the ported `rankingEngine` covering the full sort-key cascade including the head-to-head and alphabetical tiebreakers.
- Instrumented/Compose UI tests for the live-scoring screen driving a full match to completion.
- Manual verification against the existing web/Expo app: score a live match from the Android client and confirm the same match document updates render correctly in the web app in real time, and vice versa.

## 10. Non-goals

- Do not build a new backend, new Firestore schema, or new Cloud Functions — only call what already exists.
- Do not implement the GitHub feedback integration client-side — always go through the `submitFeedback` callable.
- Do not use `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` env var names (irrelevant on Android) — Firebase config comes from `google-services.json` supplied by the user.
- Offline support beyond Firestore's default local cache/listener behavior is not required for v1 parity.

## Handoff prerequisites

Before starting the build, the receiving agent should be given:

1. Access to a checkout of this repo (`nbarr1/tennisscoring`) for reference on exact type shapes/Cloud Function names if anything above is ambiguous.
2. A `google-services.json` for the target Firebase project, supplied by the user.
