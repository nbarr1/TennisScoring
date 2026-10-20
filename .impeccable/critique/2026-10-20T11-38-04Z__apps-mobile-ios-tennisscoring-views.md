---
target: native iOS client views
total_score: 28
max_score: 40
total_score_after: 30
p1_count_after: 0
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "dir:apps/mobile/ios/TennisScoring/Views"
target_fingerprint: "sha256:0e7f84532b03858c5c35baa6d39f4888a0e238c6bc406608606f4e368b712f9d"
target_path: apps/mobile/ios/TennisScoring/Views
timestamp: 2026-10-20T11-38-04Z
slug: apps-mobile-ios-tennisscoring-views
---
Method: single-agent source review (critique, then audit.native against ios.md) of the eight SwiftUI view files. No simulator: this environment has no Xcode or Swift toolchain, so Dark Mode contrast is computed from the colors in code against iOS system backgrounds (#000000 and #1C1C1E). The fingerprint is over the concatenated view files. No first-pass score exists; the first pass (b73b247) added confirmations for decline and withdraw, VoiceOver labels, and 44pt targets. This client is not released yet (README: it ships only after the parity gate), and features it doesn't have yet (admin, proposing, recording, account deletion) are not scored as defects.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Writes disable the actions and show a spinner; sign-in and join errors are announced |
| 2 | Match system / real world | 3 | 4 | "Submit result" and "Confirm" where the product and the Expo app say "Submit report" and "Confirm score" |
| 3 | User control and freedom | 3 | 3 | Decline, withdraw, dispute, and block are confirmed; undo is offered |
| 4 | Consistency and standards | 2 | 3 | Point buttons are Clubhouse Green and system blue, while the watch (worn at the same time) and DESIGN.md use Player Blue and Player Orange |
| 5 | Error prevention | 3 | 3 | Each action is offered only when the server will accept it |
| 6 | Recognition rather than recall | 3 | 3 | Match rows say "vs Sam" and "Won 6-4, 6-3"; standings highlight the player's row |
| 7 | Flexibility and efficiency | 3 | 3 | Deep links, a tab badge, context menus on messages |
| 8 | Aesthetic and minimalist design | 3 | 3 | Native lists, ContentUnavailableView, restrained color |
| 9 | Error recovery | 2 | 2 | List errors are red labels with no retry; the failed-session screen offers only Sign out |
| 10 | Help and documentation | 3 | 3 | Footers explain standings order, reports, and blocking |
| **Total** | | **28/40** | **30/40** | **Good** → **Good** |

## After fixes (same session, source review)

Total **28/40 → 30/40**. P1 **1 → 0**.

- `Color.league` is now dynamic: #1A472A in light, #A8D5A2 in dark (10:1 on #1C1C1E). A new `Color.onLeague` (white in light, black in dark) labels the filled buttons (Start match, Accept, Submit report, Confirm score) and the player's own message bubbles, so filled buttons read 10:1+ in both appearances. (P1 1)
- Point buttons use Player Blue and Player Orange with black labels, matching the watch. (P2 2)
- "Submit report", "Confirm score", "Report submitted…", "Your opponent reported this score…". (P2 3)
- Left: list errors still have no retry (needs a restart hook in the TennisAppModel list models), and no VoiceOver announcement of the new score.

## Design specificity verdict

LLM assessment: native and competent, light on the league's identity, which is right for iOS (HIG first; brand through tint). The one place the brand fights the platform is the tint: a fixed #1A472A doesn't adapt to Dark Mode.

Deterministic scan: `impeccable detect` returned no findings; it does not scan SwiftUI. Contrast checked by hand: #1A472A text is 10.4:1 on white but about 1.9:1 on black and 1.7:1 on #1C1C1E.

## Overall impression

A well-behaved native client. The single biggest issue is Dark Mode: every tinted control, the live points in the scoreboard, the winner check, links, and the Messages icons use a green that nearly disappears on a dark background.

## What's working

- The match screen offers exactly the actions the rules allow, with confirmation dialogs whose messages say who is notified.
- VoiceOver rows: scoreboard rows and standings rows read as sentences.
- Standard navigation, tab bar, sheets, and search; nothing ported from the web.

## Priority issues

1. [P1] The brand tint fails in Dark Mode. `Color.league` is a fixed #1A472A applied with `.tint` at the root, so text buttons (Unblock, Sign out in the toolbar, Cancel, Report, Form buttons), bordered buttons, links, the scoreboard's live points, and the winner check are about 1.7-1.9:1 in Dark Mode. Fix: an adaptive brand color, Clubhouse Green in light and Light Green (#A8D5A2, 10:1 on #1C1C1E) in dark, plus a matching "on brand" label color (white in light, black in dark) for filled buttons and the player's own message bubbles. Command: /impeccable audit, then /impeccable polish.
2. [P2] Point buttons don't match the watch. Player 1 is green and player 2 is system blue on the phone, while the watch on the same wrist shows Player Blue and Player Orange. Fix: Player Blue and Player Orange with black labels (6.3:1 and 10.2:1), as on the watch. Command: /impeccable polish.
3. [P2] Product terms drift: "Submit result" and "Confirm" vs "Submit report" and "Confirm score" in the Expo app and PRODUCT.md. Command: /impeccable clarify.
4. [P2] Errors without recovery: the Matches, Messages, and Standings lists show an error label with no way to retry, and the failed-session screen has only Sign out. A retry needs the models to restart their listeners (TennisAppModel), which is out of scope here. Command: /impeccable harden. Needs model change.
5. [P3] No VoiceOver announcement of the new score after a point; the rows update silently.

## Persona red flags

Casey (one-handed, outdoors): fine in Light Mode; in Dark Mode at night courts, the live points are near-invisible.

Sam (VoiceOver): good labels; the new score after a point isn't announced.

Jordan (first-timer): "Submit result" vs the "report" the rest of the app talks about.

Dana (leader): leader tools aren't built in this client yet (documented).

## Minor observations

- The Scoreboard grid can crowd at accessibility text sizes with three sets; names shrink to 70% and truncate.
- `TipCard` and `DemoBanner` use system yellow and orange tints, which adapt.

## Questions to consider

- When this client ships, should the live match move to the black scoreboard the Expo app uses?
