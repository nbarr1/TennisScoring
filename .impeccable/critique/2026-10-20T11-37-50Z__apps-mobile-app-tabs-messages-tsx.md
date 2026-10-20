---
target: mobile Messages tab
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:apps/mobile/app/(tabs)/messages.tsx"
target_fingerprint: "sha256:c12a717be343ed3b5112736502a427d4f3fcdd5840323ff0713f21e0b0a51b2a"
target_path: apps/mobile/app/(tabs)/messages.tsx
timestamp: 2026-10-20T11-37-50Z
slug: apps-mobile-app-tabs-messages-tsx
---
Method: design review only (detector not applicable, native platform). Source review; no simulator or emulator available.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | No time on any message or conversation, so a player can't tell whether "Saturday?" was this week |
| 2 | Match system / real world | 3 | 3 | Division chat vs direct message is clear |
| 3 | User control and freedom | 2 | 3 | A conversation is in-tab state, not a screen: the back control is a text "Back" and iOS edge-swipe does nothing |
| 4 | Consistency and standards | 1 | 3 | Two green headers stacked: the tab's "Messages" header, then a second header padded by the status-bar inset again |
| 5 | Error prevention | 3 | 3 | Contact sharing is explained once; block is confirmed |
| 6 | Recognition rather than recall | 2 | 3 | No timestamps; the share-contact button reuses the division-chat icon |
| 7 | Flexibility and efficiency | 3 | 3 | Long press or the flag button both reach report and block |
| 8 | Aesthetic and minimalist design | 2 | 3 | The doubled header costs about 100pt above the keyboard on an iPhone |
| 9 | Error recovery | 3 | 3 | A failed send keeps the draft with Try again |
| 10 | Help and documentation | 3 | 3 | Empty states say who can read the chat |
| **Total** | | **24/40** | **30/40** | **Acceptable → Good** |

## Design specificity verdict

LLM assessment: a competent generic chat. Product-specific touches are the shared-contact bubble with Call and Email, and "Send a message to set up a match." Otherwise it is any messenger, which is fine for this surface; the problems are platform conformance, not character.

Deterministic scan: not applicable (native platform).

## What's working

- Report and block: a bottom action sheet, a reason radiogroup, an optional note, and a success notice that tells the reporter to block as well if they want the messages gone.
- Blocked senders are filtered from the list and from DM search, and the conversation preview says "Message from a blocked player" instead of the text.
- Android system Back leaves the conversation rather than the tab.

## Priority issues

1. [P1] Doubled header in a conversation. The Tabs navigator already draws a Clubhouse Green header; the conversation draws a second one under it with `paddingTop: insets.top`, so the status-bar height is added twice and the real title is the second bar. The back control is the word "Back," not the platform's back affordance. Fix: put the conversation's title and back button into the tab's own header with `navigation.setOptions` (chevron on iOS, arrow on Android, both through AppIcon), and drop the custom bar. Command: /impeccable adapt.
2. [P2] No timestamps. Fix: a caption time under each bubble (time today, weekday this week, date otherwise) and on each conversation row. Command: /impeccable clarify.
3. [P2] iOS edge-swipe back is unavailable because the conversation is not a stack route. Left: making it a route needs a new file outside this worker's ownership (`app/messages/[id].tsx`).
4. [P3] Share-contact uses the same glyph as the division chat. Fix: use the person icon. Command: /impeccable polish.

## Persona red flags

Casey (one-handed): the doubled header pushes the latest message up under the keyboard; the Back word sits in the top-left corner, the hardest place to reach.

Sam (screen reader): bubbles read "Ann: see you at 6"; no time is spoken, so order is the only cue.

## After fixes

Fixed: P1 header (the tab header now shows the conversation name and a platform back button while a conversation is open, and the custom bar is gone); P2 timestamps on bubbles and conversation rows, included in their accessibility labels; P3 share-contact icon. Left: P2 edge-swipe (needs a new route file).

Questions skipped: autonomous worker, no question tool.
