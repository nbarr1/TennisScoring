# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

The mobile app is adaptive: it follows Material conventions on Android and Apple's conventions on iOS and watchOS, with Wear OS matching Android. The web app (`apps/web`) is a `web` surface and follows web conventions.

## Users

The primary users are coworkers who play in a company tennis league. They have mixed skill levels and play on their own time. Players propose, accept, and schedule their own matches, score them live or record the result afterward, and confirm or dispute the result their opponent reports.

The secondary users are volunteer division leaders, who are also players. They run rosters and division levels for each season, publish round-robin schedules, enter results on players' behalf, resolve disputed reports, and moderate reported messages. App administrators can do everything a leader can, across divisions.

## Product Purpose

Tennis League runs a workplace tennis league from the first invite to the final standings: divisions and seasons, match scheduling, live point-by-point scoring, result reporting, confirmed standings, and messaging between players.

Success over a season means four things, in no fixed order:

- Players actually schedule and finish their matches, so no one's season stalls.
- Standings are trusted: both sides confirm each result, and disputes are rare and resolved quickly.
- Volunteer leaders spend little time on rosters, scheduling, and chasing results.
- Coworkers meet and play people they wouldn't otherwise.

## Positioning

The app is built around a small, self-run league rather than tournaments or clubs. Players do the scheduling and reporting themselves, and the opposing side confirms every result, so leaders step in only for disputes. Standings are always recomputed from the confirmed results, never edited by hand, which keeps them auditable.

## Operating Context

- **At the court:** live scoring happens one-handed on a phone, or on an Apple Watch or Wear OS watch, often in bright outdoor light and between points. The phone is the authoritative score, and the watch mirrors it and sends points.
- **Away from the court:** scheduling, reporting, messaging, and standings happen on a phone or on the web app at a desk.
- **Leader work:** roster, division-level, scheduling, export, and moderation tools live on the web admin page (Roster, Divisions, and Tools tabs) and the mobile Admin tab. Leaders work one season at a time.
- **Season shape:** seasons are Spring and Fall halves of a year. Each season has division levels (flights) such as Beginner Singles, Beginner Doubles, Intermediate Singles, and Intermediate Doubles.
- **Notifications:** push notifications tell players about proposals, accepted matches, submitted reports, disputes, and new messages.

## Capabilities and Constraints

- **Match lifecycle:** proposed, scheduled, in progress, pending report, completed, disputed, and cancelled. Players can also postpone or delete matches and record historic results.
- **Scoring:** standard tennis scoring with deuce and advantage, seven-point tiebreaks, an optional advantage final set, and an optional 10-point match tiebreak in place of a deciding set. Optional advanced stats track aces, winners, and opponent errors.
- **Doubles:** a doubles match is two fixed partnerships, and standings accumulate per partnership. Guests are singles-only, and round-robin scheduling doesn't support doubles.
- **Guests and placeholders:** players can play guest opponents and link the result to a registered account later. Leaders can add placeholder members who don't have accounts yet.
- **Rankings:** players are ranked by matches won, then sets won, games won, game differential, and head-to-head, separately for each season and division level.
- **Accounts:** email and password sign-in with required email verification, self-service account deletion, and message reporting and blocking. A leader can't move a registered player's account into another division; joining a division is the player's choice.
- **Other:** PDF match reports, CSV export of results and rankings for leaders, a feedback form, and a public privacy policy page.
- **Release state:** the web app is live. The Android app installs as a sideloaded APK while the Google Play listing is being finalized. Native Kotlin and Swift clients are being built to replace the Expo app.
- **Terminology:** "division," "division level" (or "flight"), "season," "report," "confirm," "dispute," "proposal," "leader," "placeholder," and "guest" all have specific meanings in the product. Use them consistently.

## Brand Commitments

- The product name is **Tennis League**, with no company name or company branding. The company league is where the app is used, not part of its identity. Don't use any company's logos, colors, or trademarks.

## Evidence on Hand

- Privacy policy copy: `packages/shared/src/legal/privacyPolicy.ts`, shown on `apps/web/app/privacy/page.tsx` and `apps/mobile/app/privacy-policy.tsx`.
- App icons and splash: `apps/mobile/assets/icon.png`, `apps/mobile/assets/adaptive-icon.png`, and `apps/mobile/assets/splash.png`. Web favicon: `apps/web/public/favicon.svg`.
- Feature and release history: `README.md`, `CHANGELOG.md`, and `VERSION_1_BASELINE.md`.
- There are no testimonials, usage statistics, player counts, or press. Future work must not invent them.

## Product Principles

1. **Players run their own league.** Scheduling, scoring, and reporting work end to end without a leader, and leader tools handle the exceptions.
2. **Every result is agreed.** The opposing side confirms each result, and standings come only from confirmed results.
3. **Respect volunteer time.** Leader tasks should take minutes and handle a whole roster or season in bulk.
4. **Courtside first.** Live scoring has to work with one hand, at a glance, between points, and in sunlight.
5. **Make the next match the easy step.** Lead players toward proposing, accepting, and finishing their next match, and toward meeting new opponents.
