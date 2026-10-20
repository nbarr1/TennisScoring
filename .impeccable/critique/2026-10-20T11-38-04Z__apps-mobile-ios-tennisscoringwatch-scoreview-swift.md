---
target: watchOS scoreboard
total_score: 23
max_score: 40
total_score_after: 28
p1_count_after: 1
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:apps/mobile/ios/TennisScoringWatch/ScoreView.swift"
target_fingerprint: "sha256:08140c790fad38e85af17ae9a43396f7e8006d4708a24bec77651bb3c0a25a78"
target_path: apps/mobile/ios/TennisScoringWatch/ScoreView.swift
timestamp: 2026-10-20T11-38-04Z
slug: apps-mobile-ios-tennisscoringwatch-scoreview-swift
---
Method: single-agent source review (critique, then audit.native and adapt.native against ios.md) of `TennisScoringWatch/ContentView.swift`, `ScoreView.swift`, and `WatchSessionManager.swift`. No simulator: this environment has no Xcode or Swift toolchain, so sizes are reasoned from watchOS text styles on a 41mm watch. No first-pass score exists; the first pass (5218af9) added the player colors, black button labels, VoiceOver row labels, and the tap haptic.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | A failed `sendMessage` has no error handler, so a point that never reached the phone looks and feels (click haptic) like one that did |
| 2 | Match system / real world | 3 | 3 | Tennis terms and statuses read naturally; "Deuce"/"Ad In" come from the shared engine |
| 3 | User control and freedom | 1 | 2 | There's no undo from the watch (the command format has only `point`), and nothing tells the player that undo is on the iPhone |
| 4 | Consistency and standards | 3 | 3 | Native controls, SF Symbols, text styles; points in system green are off the scoreboard palette (white numerals, yellow for tiebreak) |
| 5 | Error prevention | 3 | 3 | Buttons disable when the phone can't score, and commands are scoped to the match |
| 6 | Recognition rather than recall | 2 | 3 | Rows show sets won but not the current set's games; the games appear only in a caption2 line; buttons show initials |
| 7 | Flexibility and efficiency | 2 | 2 | Taps only; no hint and no faster path |
| 8 | Aesthetic and minimalist design | 3 | 3 | Calm and native, but the most important number (the points) is Headline size beside Footnote names |
| 9 | Error recovery | 2 | 3 | "iPhone not reachable. Keep it nearby to score." is good; a failed send has no recovery prompt |
| 10 | Help and documentation | 2 | 3 | Nothing says "tap who won the point"; no word on where undo lives; nothing after the match on who won |
| **Total** | | **23/40** | **28/40** | **Acceptable** → **Good** |

## After fixes (same session, source review)

Total **23/40 → 28/40**. P1 **3 → 1** (the undo gap, which needs a protocol change).

- Rows lead with the points at Title 2, semibold, white (yellow in a tiebreak), with the current set's games beside them; the set history and the game in words share one caption line ("6-4, 3-2 · 30-all"). (P1 1, P3 6)
- `WatchSessionManager.sendPoint` now passes a `@Sendable` error handler that records the failure on the main actor; the message format and the guard conditions are unchanged. The screen plays the failure haptic and shows "Point not sent. Check the score on your iPhone." until the next send or snapshot. (P1 2)
- A standing hint under the buttons: "Tap who won the point. Undo on your iPhone." (P1 3, partly; H3 1 → 2)
- Finished matches say "Ann Smith wins" (from sets); a scheduled match says "Start the match on your iPhone to score it here." Buttons show first names ("Ann/Bob"), scaled to fit. (P2 4, 5)
- Still open: undo from the watch needs a `WatchCommand` undo case plus phone handling in `MatchDetailModel.handle` (TennisCore and TennisAppModel, out of scope). Keeping the app frontmost needs an extended runtime or workout session in the Xcode project.

## Design specificity verdict

LLM assessment: mostly specific. Blue and orange player stripes, a yellow serve ball, and black labels on the player colors are the scoreboard world on a watch. Generic spots: the system-green points, and a results screen that says "Pending report" without saying who won.

Deterministic scan: `impeccable detect` returned no findings; it does not scan SwiftUI. Contrast checked by hand: black on #3D8BFF is 6.3:1, black on #FF9F1C 10.2:1, secondary text on black passes.

## Overall impression

A tidy, native watch face for a match, but tuned for reading, not for a glance between points: the point score is 17pt beside the name, the current set's games aren't on the rows, and the watch can lose a point silently. The single biggest opportunity is to make the points the largest thing on screen and to say when a tap didn't land.

## What's working

- Match scoping is real: a snapshot without a match id shows read-only, and the buttons disable with a reason ("iPhone not reachable", "Open this match on your iPhone").
- VoiceOver gets one sentence per player ("Ann Smith, 1 set, 30 in this game, serving").
- System text styles throughout, so Dynamic Type works.

## Priority issues

1. [P1] The points aren't the glance target. `.headline` points sit in a row with `.footnote` names; on a 41mm watch that's about 16pt. Fix: points at Title 2 in white (yellow during a tiebreak), current-set games beside them, sets in the caption line. Command: /impeccable layout, then /impeccable typeset.
2. [P1] A failed send is silent. `sendPoint` passes `errorHandler: nil` and the click plays first. Fix: keep the send itself unchanged, add an error handler that records the failure for the UI, play the failure haptic, and show "Point not sent. Check the score on your iPhone." until the next snapshot arrives. Command: /impeccable harden.
3. [P1] No undo, and no pointer to it. A mis-tap from the watch can be undone only on the iPhone. The watch can't send undo (that needs a `WatchCommand` case and phone handling, which this pass must not change), so the fix in scope is a standing hint under the buttons: "Tap who won the point. Undo on your iPhone." Command: /impeccable clarify. Needs protocol change for the real fix.
4. [P2] The finished screen doesn't say who won. Fix: "Ann Smith wins" from the sets, then the report hint. Also a scheduled match says only "Scheduled": add "Start the match on your iPhone." Command: /impeccable clarify.
5. [P2] Initials on the buttons ("AS", "AS/BJ") are hard to map at a glance and collide easily. Fix: first names, scaled to fit. Command: /impeccable clarify.
6. [P3] Off-palette `Color.green` for points. Fixed with issue 1.

## Persona red flags

Casey (courtside): reads 16pt numerals at arm's length; a tap while the phone is briefly out of range clicks and is lost; to fix a mis-tap they must find the phone.

Sam (VoiceOver): the rows read well; a failed point isn't announced.

Jordan (first-timer): nothing on screen says what tapping a colored button does.

Dana (leader who plays): no notable issues beyond Casey's.

## Minor observations

- The app keeps no extended runtime session, so watchOS returns to the clock between points after the system timeout. Keeping it frontmost needs a `WKExtendedRuntimeSession` or workout session and the matching capability in the Xcode project, which doesn't exist yet (README "Creating the Xcode project").
- `WatchSessionManager` publishes `isReachable` only on change; that's correct.

## Questions to consider

- Should the watch send `undo` once the phone accepts it, the way Wear OS does?
