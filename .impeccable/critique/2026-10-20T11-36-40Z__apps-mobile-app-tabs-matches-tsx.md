---
target: mobile matches tab (Expo, Android and iOS)
total_score: 28
total_score_after_fixes: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
p1_count_after_fixes: 0
target_identity: "file:apps/mobile/app/(tabs)/matches.tsx"
target_fingerprint: "sha256:0ed8e308857513f2e10350121afc539873b52a0fca67c2e65d664d54a278318e"
target_path: apps/mobile/app/(tabs)/matches.tsx
timestamp: 2026-10-20T11-36-40Z
slug: apps-mobile-app-tabs-matches-tsx
---
Method: design review only (detector not applicable, native platform). Reviewed from source; no simulator or emulator was available in this environment, so nothing here comes from a rendered capture.

## Design health score

| # | Heuristic | Before | After fixes | Key issue (before) / what changed |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 4 | Accept, Decline, and Withdraw on a card only announced to screen readers; sighted players saw the card jump to another section. Now they show the same notice the sheets use |
| 2 | Match system / real world | 3 | 3 | League terms are right throughout; dates typed as `YYYY-MM-DD` and times as 24-hour `HH:MM`. The live card's "advantage side" now reads "ad court"; the typed formats remain as the fallback |
| 3 | User control and freedom | 3 | 3 | Decline and Withdraw are confirmed, half-filled forms ask before discarding, Android Back and the Close button both route through that check |
| 4 | Consistency and standards | 2 | 2 | Date and time are free-text fields on both platforms, where Material and the HIG expect the system pickers (no picker is installed); search and set-score inputs use the 1.4:1 hairline for their edge. Both still open |
| 5 | Error prevention | 3 | 3 | The form owns its season and level (the first pass's P1 is fixed), validation is shared with the server. A typed date is now read back in words ("Proposing Thu, Oct 24, 6:30 PM") |
| 6 | Recognition rather than recall | 2 | 3 | Proposing meant working out what date "next Thursday" is and typing it. Now the coming week is one tap away; opponent availability still isn't shown (profiles don't carry it) |
| 7 | Flexibility and efficiency | 3 | 3 | Search, filters with a needs-you count, record on behalf for leaders, one "New match" entry for three flows |
| 8 | Aesthetic and minimalist design | 3 | 3 | Clear needs-you-first ordering; three rows of controls (season, search, filters) sit above the first card |
| 9 | Error recovery | 3 | 3 | Load failure has a retry, inline errors on cards and forms, error summary on submit |
| 10 | Help and documentation | 3 | 3 | Helper text says what happens next (who confirms, when standings update) |
| **Total** | | **28/40** | **30/40** | **Good → Good** |

P0/P1 before fixes: 0 / 1. After fixes: 0 / 0. The P1 (typed dates) drops to P2: the common case is now a tap, and the system pickers need a dependency decision.

## Design specificity verdict

LLM assessment: specific to this league. The list is bucketed by what this player must do ("Needs you", "Your next match", "Waiting on others", then the division, then history), cards say whose move it is in plain sentences, live cards carry the Live Green edge and the server and court line, and the new-match chooser names the three real flows. What's generic is the form chrome: typed dates and times are what any CRUD app would ship, and on a phone they are the least native thing on the screen.

Deterministic scan: not applicable (native platform).

Visual overlays: none (native platform).

## Overall impression

The first pass moved this screen a long way: it now leads with the player's own work, and every write has a pending state, an error, and a confirmation. The biggest remaining gap is proposing a match, the step PRODUCT.md calls "the easy step", which still asks for a machine-format date and a 24-hour time typed on a phone keyboard.

## What's working

- Bucketing by "who has to act" rather than by status: invitations and results to confirm come first, in play-date order, and the filter chip carries the count.
- Every destructive or one-way card action is confirmed with a named verb ("Decline", "Withdraw", "Keep proposal"), and Accept and Decline disable each other while one is in flight.
- The forms own their season and division level, default to the player's own level, and say "(yours)" on that chip, which closes the web critique's biggest P1 on mobile.

## Priority issues

1. [P1] Proposing a time means typing `2026-10-24` and `18:30`. There is no date or time picker installed, nothing shows which weekday a typed date falls on, and the 24-hour format is a recall task for most players. Fix now: one-tap day chips for the coming week and a plain-language summary of the proposed time under the fields. Full fix: the system date and time pickers (`@react-native-community/datetimepicker`, a dependency decision for the owner). Command: /impeccable harden, then /impeccable clarify.
2. [P2] Accept, Decline, and Withdraw give sighted players no visible outcome. The card vanishes from "Needs you" and reappears elsewhere; only screen readers hear what happened. Fix: show the same notice the sheets use. Command: /impeccable clarify.
3. [P2] Opponent availability isn't shown while proposing. CLAUDE.md describes availability as "shown to opponents when proposing", but `PublicProfile` carries no availability, so the mobile form can't show it. Needs backend change. Command: /impeccable layout once the data exists.
4. [P2] Input edges use the hairline (`colors.border`, about 1.4:1 on white) on the search field and set-score inputs. DESIGN.md says inputs use Strong Hairline; the mobile theme has no such token yet. Request to the theme owner. Command: /impeccable polish.
5. [P3] Three control rows above the first card. On a 667pt phone the season chips, search, and filters take roughly 190pt before "Needs you". Command: /impeccable layout.

## Persona red flags

Casey (one-handed phone): the propose form ends in two text fields that need the number-and-punctuation keyboard and exact formatting; "New match" sits bottom right where the thumb is, which is right.

Sam (TalkBack, VoiceOver): well served. Cards have one summary label, actions have their own labels, outcomes are announced, the history header is a button with expanded state. The section header inside the history button is announced as a header inside a button on Android, which is harmless.

Jordan (first-timer): "YYYY-MM-DD" and "24-hour HH:MM" read as developer language. "advantage side" on a live card isn't how a tennis player says it.

Dana (volunteer leader who plays): record on behalf is one chip away ("Two other players") and says who gets notified. Fine.

## Minor observations

- "Needs action" (filter) and "Needs you" (section) name overlapping but different sets; the filter also shows "Waiting on others" and "Results in review".
- The new-match chooser fades in rather than sliding up like the other sheets.
- The success notice sits at the top of the list; after a long scroll it's off screen (it is announced).

## Fixed in this pass

- Issue 1 (P1, partly): the propose sheet has a "Day" chip row for today through six days out, each announced as the full date ("Play on Thursday, October 24"); picking a day moves focus to the time field when it's empty. Under the fields, the proposed time is read back in words. The typed fields stay for other dates, and what gets written is unchanged.
- Issue 2 (P2): Accept, Decline, and Withdraw on a card now show their outcome in the success notice above the list, as the sheets do.
- Minor: the live card says "serves · ad court" / "deuce court".

Left open: native date and time pickers (needs `@react-native-community/datetimepicker`, an owner dependency decision), opponent availability (needs backend change: `PublicProfile` has no availability), the input-edge token (theme owner), and the control rows above the list (P3).

## Questions to consider

- If the day chips cover the coming week, how often does anyone still need the typed date field?
- Should accepting a proposal land the player on that match, rather than leaving them on the list?
