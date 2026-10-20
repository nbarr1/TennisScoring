---
target: Wear OS watch scoreboard
total_score: 22
max_score: 40
total_score_after: 29
p1_count_after: 0
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:apps/mobile/android/wear/src/main/java/com/tennisleague/watch/MainActivity.kt"
target_fingerprint: "sha256:07077bbddc87f66650e4731c8561372772e7be186faec9d6b9639922ffe927d7"
target_path: apps/mobile/android/wear/src/main/java/com/tennisleague/watch/MainActivity.kt
timestamp: 2026-10-20T11-38-04Z
slug: va-com-tennisleague-watch-mainactivity-kt-cb05d471
---
Method: single-agent source review (critique, then audit.native and adapt.native against android.md). No emulator or device: this environment has no Android SDK, so layout heights below are computed from the code (dp values, sp sizes at font scale 1.0) for a 192dp round screen (Pixel Watch, Galaxy Watch 40mm is about 198dp). The surface also includes the :wear res/ files. No first-pass score exists for this surface; the first pass (98161c5) raised text sizes, added TalkBack labels and the tap haptic, and moved the palette to DESIGN.md's scoreboard colors.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | The tap haptic fires before the watch knows a phone is connected; an undo gives no feedback; "Phone not found" lands below the fold |
| 2 | Match system / real world | 3 | 3 | Tennis terms are right; "Sync requested" is system-speak; "P1"/"P2" placeholders before the first score |
| 3 | User control and freedom | 2 | 3 | Undo exists three ways (button, long press, stem double-press), but a long press on a point button undoes silently, so an accidental one goes unnoticed |
| 4 | Consistency and standards | 2 | 3 | Monospace numerals instead of the condensed scoreboard face; points shown twice (plate and buttons) where the phone's split scoreboard makes each player's row the tap target |
| 5 | Error prevention | 2 | 3 | Point buttons look live with no match; two players with the same first name get identical buttons; round-screen corners clip the plate |
| 6 | Recognition rather than recall | 2 | 3 | On a round watch the score and the point buttons never share a viewport, so the player taps from memory |
| 7 | Flexibility and efficiency | 3 | 3 | Stem buttons score, double-press and long press undo |
| 8 | Aesthetic and minimalist design | 2 | 3 | Three label lines ("Sets", "Games", the points) before anything tappable; the first viewport is spent on labels |
| 9 | Error recovery | 2 | 3 | Missing-phone copy is clear but off screen; a failed send is only logged |
| 10 | Help and documentation | 2 | 2 | The one hint ("Tap the player who won it. Hold to undo.") sits below the fold |
| **Total** | | **22/40** | **29/40** | **Acceptable** → **Good** |

## After fixes (same session, source review)

Total **22/40 → 29/40**. P1 **3 → 0**.

- Layout: each player's tile now carries their short name and their points (13sp over about 30sp) and is the tap target; sets and games share one line on a compact plate with the server line. Status, plate, and both tiles fit in about 176dp, inside a 192dp round viewport; undo and help are one scroll below. The duplicate names row and points line are gone. (P1 1)
- The screen stays on while a live score is showing, renewed by every snapshot, and released when the match ends, when the app pauses, or after 5 minutes without a snapshot. (P1 2)
- The tap haptic plays only once a phone has accepted the message; a send every node rejects shows "NOT SENT"; no phone shows "NO PHONE" in the always-visible status line; every undo path (long press on a tile, the undo control, stem long press, stem double press) says "Undo sent". The phone's moment ("Match Point", "Deuce", tiebreak) also moves into the status line. (P1 3)
- `sans-serif-condensed` replaces monospace for numerals and labels (P2 4); names are "Chris L" or "Ann/Bob" (P2 5); tiles and undo dim until a score arrives (P2 5); round screens get 20dp sides and 36dp of bottom room (P2 6); the resume message no longer overwrites a live match's tip (P3 7); the window background is scoreboard black.
- Left: help copy still sits below the fold (H10 stays 2); the "Tennis Score" launcher label (cross-file, see report); no TalkBack announcement of each new score; no staleness signal when the phone silently stops sending (needs a heartbeat in the protocol).

## Design specificity verdict

LLM assessment: partly specific. The black plate, blue and orange player edges, and Scoreboard Yellow status line are the DESIGN.md scoreboard. What reads generic is the structure: a stacked phone form (status, card, names, two buttons, a wide button, help text) in a ScrollView, rather than the split scoreboard the phone uses, where each player's tile is both the score and the tap target.

Deterministic scan: `impeccable detect` returned no findings; it does not scan Kotlin view code. Colors were checked by hand: every text pairing is the DESIGN.md scoreboard palette on black, 9:1 or better (#B3B3B3 on #000 is 10.4:1).

## Overall impression

The pieces are right and the content is honest, but the arrangement fails the courtside glance: at 192dp the first viewport shows the status, the plate, and the names; the two point buttons start at about 205dp, so scoring needs a scroll that pushes the score off the top. The single biggest opportunity is to make each player's tile carry their points and be the button.

## What's working

- The protocol handling is careful and invisible: stale snapshots ignored, session reset handled, legacy mirror ignored once v1 is seen.
- TalkBack gets one sentence for the scoreboard and "Point to Ann Smith, now on 30" for each button, plus a polite live region for messages.
- Finished matches dim and disable the point buttons and say who won and what to do next.

## Priority issues

1. [P1] Score and point buttons don't share a viewport on round watches. Content is about 356dp tall (10 pad + 16 status + about 120 plate + 22 names + 84 buttons + 54 undo + 50 feedback) against a 192-227dp screen. Fix: put each player's points on their tile, keep sets and games in one compact line above, and lead with the tiles so status, score, and both buttons fit in the first 192dp. Command: /impeccable layout, then /impeccable adapt.
2. [P1] The screen sleeps to the watch face between points. Nothing keeps the activity on screen, so a wrist raise after a rally shows the time, not the score. Ambient mode needs `androidx.wear`, which this module doesn't depend on. Fix: keep the screen on while a live score is showing, and release it when the match ends, when the activity pauses, or after several minutes with no snapshot so a stale match can't drain the battery. Command: /impeccable harden.
3. [P1] Feedback that matters is invisible. The tap haptic fires even when no phone is connected (the node check is asynchronous), an undo has no haptic or text, and "Phone not found" appears below the fold. Fix: play the tap haptic only once a phone is found, show phone-missing and undo state in the status line at the top, and report send failures. Command: /impeccable harden, then /impeccable clarify.
4. [P2] Off-system type: `Typeface.MONOSPACE` for the numerals and button labels. The module ships no Barlow, but Android's condensed sans (`sans-serif-condensed`) is the closest system match and fits larger numerals in a half-width tile. Command: /impeccable typeset.
5. [P2] Ambiguous and premature buttons: labels take the first word, so "Chris Lee" and "Chris Park" both read "Chris", and doubles drop the partner; before any score the buttons read "P1"/"P2" and look tappable. Fix: first name plus last initial, first names for teams, and dim the buttons until a score arrives. Command: /impeccable clarify.
6. [P2] Round-screen insets: 12dp side padding on a round display clips the plate's corners at the top and the help text at the bottom. Fix: larger side and bottom padding when `isScreenRound`. Command: /impeccable adapt.
7. [P3] "Sync requested" on every resume, even mid-match, overwrites the tip that was showing. Command: /impeccable clarify.

## Persona red flags

Casey (courtside, one hand, sunlight): has to scroll down to tap and up to read; the watch face replaces the score after a rally; a tap with the phone out of range still buzzes as if it landed.

Sam (TalkBack): the labels are good; nothing announces the new score after a point (only tips and errors, through the live region).

Jordan (first-timer): opens the app with no match and sees two live-looking "P1"/"P2" buttons; the only instruction is below the fold.

Dana (leader who plays): two players named Chris in the same flight get identical buttons.

## Minor observations

- Launcher label is "Tennis Score" while the product is "Tennis League". The phone's copy says "still has Tennis Score installed" (apps/mobile/app/match/[id].tsx and ScoreboardSetup.tsx), so renaming one side alone would split the name. Left as is; see the report's request.
- All copy is hard-coded in Kotlin rather than strings.xml.
- `colors.xml` carries clubhouse colors (#050806 background, #1B5E7A) that the activity doesn't use; only the window background reads it.

## Questions to consider

- If a point button showed "ANN S · 40" in 30sp, would the plate need its own points line at all?
- Should a long press on a point tile undo, or should undo live only on its own control and the stem?
