---
target: mobile match detail and live-scoring screen (Expo, Android and iOS)
total_score: 31
total_score_after_fixes: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
p1_count_after_fixes: 1
target_identity: "file:apps/mobile/app/match/[id].tsx"
target_fingerprint: "sha256:9e6f7d65fb782d504980ef4d9837df5f393bf1287e61b7cadea6b1b0bdceb45c"
target_path: apps/mobile/app/match/[id].tsx
timestamp: 2026-10-20T11-36-40Z
slug: apps-mobile-app-match-id-tsx
---
Method: design review only (detector not applicable, native platform). Covers `apps/mobile/app/match/[id].tsx`, `apps/mobile/components/live-scoring/*`, and `apps/mobile/components/MatchTiebreakToggle.tsx`. Reviewed from source; no simulator or emulator was available in this environment, so nothing here comes from a rendered capture.

## Design health score

| # | Heuristic | Before | After fixes | Key issue (before) / what changed |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Every point shows "ADDING POINT…" on its row, flashes when it lands, and is announced; a second tap while a point saves is ignored without a mark on the tapped row (open) |
| 2 | Match system / real world | 4 | 4 | Umpire's calls with the server's score first, deuce and ad court, break, set, and match point flags, "change ends" |
| 3 | User control and freedom | 3 | 3 | Hold-to-undo with a target preview, every one-way step confirmed. The iOS swipe-down dismissal mid-match is now off while scoring; START MATCH still starts with one tap |
| 4 | Consistency and standards | 2 | 3 | The Edit score sheet was laid out at the top of the screen, under the iOS status bar; the iOS sheet closed with a back chevron; the link-opponent sheet nested a FlatList in a ScrollView. All three fixed; the input edges still use the 1.4:1 hairline |
| 5 | Error prevention | 3 | 4 | Retry resends the same point id so it can't count twice; a stray downward drag can no longer pull the scoreboard away mid-match |
| 6 | Recognition rather than recall | 3 | 4 | The undo key says where it goes back to; the setup screen now shows when the match is scheduled |
| 7 | Flexibility and efficiency | 3 | 3 | Watch scoring, advanced stats, swap ends, leader resolution in place |
| 8 | Aesthetic and minimalist design | 3 | 3 | A proposed match led with a scoreboard of zeros; the proposal panel now comes first. The scrim strip under clubhouse sheets remains |
| 9 | Error recovery | 4 | 4 | Point and undo failures are explicit, keep the score honest, and offer the one safe retry |
| 10 | Help and documentation | 3 | 3 | Rule tips, plain next-step panels after the match, hints on undo and swap |
| **Total** | | **31/40** | **34/40** | **Good → Good** |

P0/P1 before fixes: 0 / 3. After fixes: 0 / 1. The open P1 is the screen sleeping during play, which needs a dependency decision (see issue 3).

## Design specificity verdict

LLM assessment: highly specific. The split scoreboard with player rows as tap targets, the moment band in tone colors, server-first calls, the court side under the server's name, hold-to-undo with a "Back to 30–15" preview, and the Barlow Condensed numerals on black could only belong to a tennis scorer used in sunlight. The clubhouse panels under a finished match name the next step from this player's point of view ("Check the score Ann reported"). The weak spots are generic plumbing: sheet layout, the iOS dismissal model, and the setup screen's missing schedule.

Deterministic scan: not applicable (native platform).

Visual overlays: none (native platform).

## Overall impression

The court is the best surface in the app: large, black, one-handed, honest about every point in flight, and careful about retries. The problems sit around it: how the screen is presented and dismissed on iOS, a sheet that renders in the wrong place, and the phone going to sleep between points.

## What's working

- One tap per point on a full-width row, with an in-row "ADDING POINT…" spinner and a brief glow on landing, so a tap is never silent, and the retry path can't double-count.
- Undo is a deliberate one-second hold with a fill and a preview of where it goes back to, while screen readers get a direct action instead of a hold they can't perform.
- Spoken output is written for the ear: "Point, Rivera. 30, 15." and "Game, set, and match" instead of "6 minus 4".

## Priority issues

1. [P1] The Edit score sheet renders at the top of the screen. `EditScoreModal` uses `KeyboardAwareScrollView` with the card as the scroll content; a vertical ScrollView grows to fill the overlay, so the card sits at the top instead of rising from the bottom. On iOS the RN Modal covers the whole screen, so "Edit score" and "Set the correct score" start under the status bar and Dynamic Island. Fix: use the same bottom-sheet container as the other sheets. Command: /impeccable adapt.
2. [P1] On iOS a downward drag dismisses the live scoreboard. `match/[id]` is presented as a modal (a page sheet on iOS), and the court has scrolling turned off, so a thumb dragging down a player row pulls the whole sheet away mid-rally. Nothing is lost, but the scorer has to find the match again between points. Fix: turn the dismiss gesture off while scoring, and close the sheet with a close control rather than a back chevron on iOS. Command: /impeccable harden.
3. [P1] The phone can lock between points. Nothing keeps the screen awake while a match is in progress, so with a 30-second auto-lock the scorer unlocks the phone on most changeovers. `expo-keep-awake` ships inside the Expo SDK but isn't a declared dependency of `@tennis/mobile`, so it can't be used without a dependency change. Needs a dependency decision from the owner. Command: /impeccable harden.
4. [P2] The setup screen doesn't say when the match is scheduled, and START MATCH starts it immediately. A player opening a match booked for Thursday sees "WHO SERVES FIRST?" and nothing about Thursday. Fix: show the scheduled time in the lead. Command: /impeccable clarify.
5. [P2] A proposed match leads with a scoreboard of zeros. The Accept and Decline panel, the only thing to do on that screen, sits under about 260pt of empty scoreboard. Fix: put the proposal panel first for proposed matches. Command: /impeccable layout.
6. [P2] The link-opponent sheet nests a `FlatList` inside the sheet's `ScrollView` (same orientation), which React Native warns about and which disables virtualization anyway. Fix: render the short result list directly. Command: /impeccable polish.

## Persona red flags

Casey, the one-handed courtside scorer (scored with special care): the rows are huge and the undo and swap keys are at the thumb's resting edge, 12pt apart. Three things still get in the way between points: the screen sleeping (P1), the iOS sheet sliding away on a downward drag (P1), and a second quick tap while the first point is still saving being ignored without any mark on the row that was tapped (the first row shows "ADDING POINT…", so it's noticeable). Bright light is well handled: white on pure black, band text at 7:1 or better.

Sam (TalkBack, VoiceOver): rows are buttons named "Point to Ann" with the score as their value, the band is a polite live region for spectators only, undo offers a direct action, and the setup cards form a radio group. On iOS the top-left control is announced as "Back" while it closes a sheet.

Jordan (first-timer): the setup screen explains "tap a player's row to give them the point", and rule tips are a switch away. "WHO SERVES FIRST?" with no date can make a first-timer think the match has to start now.

Dana (volunteer leader who plays): disputed and unanswered reports are resolved in place with two clear options ("Make reported score final", "Set the correct score"), but the score sheet they open is the one that renders at the top of the screen.

## Minor observations

- The sheets that use `KeyboardAwareBottomSheet` leave a strip of scrim between the card and the home indicator, because the safe-area padding is applied outside the card (a component outside this surface).
- The rule-tip card covers the top player's name for about five seconds; it passes touches through, so it never blocks a point.
- Score-entry inputs use the 1.4:1 hairline for their edge.

## Fixed in this pass

- Issue 1 (P1): `EditScoreModal` now uses `KeyboardAwareBottomSheet` like the other sheets, so "Edit score" and "Set the correct score" rise from the bottom and stay clear of the status bar.
- Issue 2 (P1): `gestureEnabled` is off while a participant is scoring (it is iOS-only in react-native-screens, so Android Back is untouched), and the top-left control is a close (xmark, "Close") on iOS where the screen is a sheet, keeping the back arrow on Android where it's a push.
- Issue 4 (P2): the setup screen lists "Scheduled" with the booked date and time above the format.
- Issue 5 (P2): a proposed match shows its Accept and Decline (or Withdraw) panel first, with the empty scoreboard after it.
- Issue 6 (P2): the link-opponent results render directly inside the sheet instead of a nested FlatList.
- Minor: the setup screen's "Open on watch" key shows a pressed state.

Left open: keep-awake during play (P1, needs `expo-keep-awake` declared in `apps/mobile/package.json`; the owner's dependency call), a second tap during a save being ignored (behavior change to the scoring path, left alone), START MATCH without confirmation (P3), the input-edge token and the sheet scrim strip (owned by the theme and components worker).

## Questions to consider

- Should START MATCH ask for confirmation when the match is scheduled more than a few hours away?
- Would a queued second point (rather than an ignored tap) be safe enough to try, given the retry design already guards duplicates?
