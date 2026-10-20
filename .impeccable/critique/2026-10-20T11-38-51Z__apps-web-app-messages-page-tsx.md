---
target: web messages page
total_score: 29
max_score: 40
after_score: 30
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:apps/web/app/messages/page.tsx"
target_fingerprint: "sha256:f9b0ec84f418dbf2f9375ed6b00dee870d3483e6cd8673073260b71bb0fe37a0"
target_path: apps/web/app/messages/page.tsx
timestamp: 2026-10-20T11-38-51Z
slug: apps-web-app-messages-page-tsx
---
⚠️ DEGRADED: single-context (this worker has no sub-agent tool; Assessment A was written before the detector output was read). Browser overlay skipped: no Firebase env, and /messages is behind sign-in.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Sending, failed, Retry, and Edit per message are excellent; no unread state in the list |
| 2 | Match system / real world | 3 | 3 | Plain chat language, "Division chat" and direct messages labelled for screen readers |
| 3 | User control and freedom | 3 | 3 | Delete conversation is confirmed; a failed send hands its text back to the composer |
| 4 | Consistency and standards | 3 | 3 | Shared Dialog, Button, DataState |
| 5 | Error prevention | 2 | 3 | Blocking promises "You won't see their messages in any conversation", but the conversation list still previews a blocked player's last message |
| 6 | Recognition rather than recall | 3 | 3 | Conversation names resolve from profiles; "You:" prefix in previews |
| 7 | Flexibility and efficiency | 3 | 3 | Enter sends, Shift+Enter adds a line; one dialog for report and block |
| 8 | Aesthetic and minimalist design | 3 | 3 | At phone width the header crams Back, the name, and a full "Delete conversation" button into one row, truncating the name |
| 9 | Error recovery | 3 | 3 | Every failure has a Try again or Retry |
| 10 | Help and documentation | 3 | 3 | Report and block explain who sees what and how to undo |
| **Total** | | **29/40** | **30/40** | **Good → Good** |

## Design specificity verdict

LLM assessment: somewhat generic by nature (a chat is a chat), but the details are this league's: empty states that suggest proposing a time to play, report copy that names the division leader as the reviewer, and the shared contact card's Call and Email links. The bubbles, two-pane split, and composer are standard and should stay standard.

Deterministic scan: `impeccable detect --json` over apps/web/app/messages returned 0 findings (exit 0).

Visual overlays: none. Browser injection was not attempted.

## Overall impression

The most carefully hardened page in this group. One trust leak: the block promise does not hold in the sidebar.

## What's working

- Optimistic sends with per-message Retry and Edit, and an assertive announcement when a send fails.
- The pane is remounted per conversation, so a draft or failed send can never land in another thread.
- Report and block share one stepped dialog, with focus moved to each step's first control.

## Priority issues

1. [P1] A blocked player's words still reach the blocker. The conversation list renders `lastMessage.content` without checking the block list, so the division chat's preview shows the blocked sender's latest message. Fix: when the last message is from a blocked player, show "Message from a blocked player" instead. Command: /impeccable harden.
2. [P2] The thread header overflows on a phone. Fix: the delete action keeps its accessible name but drops its visible label under 760px. Command: /impeccable adapt.
3. [P2] New-message search says "No players match" while the debounce for newer text is still waiting. Fix: only state no-match for the text the results answer, as PlayerSlotPicker does. Command: /impeccable clarify.
4. [P3] No unread indicator in the conversation list. Needs read-state data that the client does not have (reported as a backend item, not fixed).

## Persona red flags

Casey (one-handed phone): the header's delete button takes half the row and truncates the opponent's name.

Sam (keyboard, screen reader): focus moves to the thread heading on open; the log is labelled; the per-message actions button names the sender. Clean.

Jordan (first-timer): before the profile loads, the empty list briefly says "Join a division to chat" even for a member (flash only).

Dana (volunteer leader who plays): blocks a harasser, then sees their message again in the division chat preview.

## Minor observations

- The list scrolls to the bottom on every new message even while the reader is scrolled up in history.
- The composer counter appears at 100 characters left; the limit (2000) is never stated earlier, which is fine.

## After fixes

Fixed: the P1 and both P2s, plus the scroll observation. Commit 6044e7e.

- A conversation whose last message is from a blocked player previews "Message from a blocked player" (italic) instead of the text.
- Under 760px the delete action is icon-only with the accessible name "Delete conversation", so the other player's name keeps the header row.
- New-message search states "No players in your division match" only for the text the results answer, and the block list passed to it is now a stable empty array for players who block no one, so the search no longer restarts on unrelated re-renders.
- The thread follows new messages only while the reader is at the bottom; sending always scrolls to the new message.

Left alone: unread indicators (P3), which need read-state data the client does not store (backend item).

Heuristics that moved: 5 (2→3). Remaining P0: 0. Remaining P1: 0.
