---
target: web feedback and privacy pages
total_score: 30
max_score: 40
after_score: 31
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:apps/web/app/feedback/page.tsx"
target_fingerprint: "sha256:ef735deb94a28517e40ec0f66b75a3065d02c49e2b298bd4d004b26f0ea0ffe1"
target_path: apps/web/app/feedback/page.tsx
also_covers: apps/web/app/privacy/page.tsx
timestamp: 2026-10-20T11-38-51Z
slug: apps-web-app-feedback-page-tsx
---
⚠️ DEGRADED: single-context (this worker has no sub-agent tool; Assessment A was written before the detector output was read). Browser overlay skipped: no Firebase env.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Sending state, focused success heading, issue link when one exists |
| 2 | Match system / real world | 3 | 3 | Categories in plain words; "match day" tone |
| 3 | User control and freedom | 3 | 4 | Text kept on a failed send; "Send another note" |
| 4 | Consistency and standards | 3 | 3 | Feedback renders its loading state without the nav or a main landmark, so the page jumps when it loads |
| 5 | Error prevention | 3 | 3 | Minimum length explained before submit |
| 6 | Recognition rather than recall | 3 | 3 | Privacy has a contents list with anchors |
| 7 | Flexibility and efficiency | 3 | 3 | Fine for the task |
| 8 | Aesthetic and minimalist design | 3 | 3 | Privacy reads well: 68ch measure, bold lead terms |
| 9 | Error recovery | 3 | 3 | Errors say what to do |
| 10 | Help and documentation | 3 | 3 | "Sent with your note: your name, email address, and division…" is honest and specific; privacy's only way back is "Back to sign in", even for a signed-in player who opened it from their profile |
| **Total** | | **30/40** | **31/40** | **Good → Good** |

## Design specificity verdict

LLM assessment: appropriately plain. Feedback is a short form with a candid note about what is attached; privacy is a reading page that renders the shared policy text with the same headings as mobile. Neither needs more character than the clubhouse palette and condensed headings give it.

Deterministic scan: `impeccable detect --json` over feedback and privacy returned 0 findings (exit 0).

Visual overlays: none. Browser injection was not attempted.

## Overall impression

Solid. Two navigation details, no blockers.

## What's working

- The feedback form tells players exactly what metadata goes with their note.
- Privacy is set for reading: contents list, anchors with scroll margin, 65–68ch measure.

## Priority issues

1. [P2] Privacy's "Back to sign in" and brand link go to /login, which a signed-in player did not come from. Fix: link both to "/", which takes signed-in players to the app and signed-out visitors to sign-in, and label it "Back to Tennis League". Command: /impeccable clarify.
2. [P3] Feedback's loading state has no nav or main landmark. Fix: render the nav and page title while loading. Command: /impeccable polish.

## Persona red flags

Sam (keyboard, screen reader): during load the feedback page has no landmarks and no heading.

Jordan (first-timer): opens privacy from profile, taps "Back to sign in", and lands on a sign-in form while signed in.

## Minor observations

- Feedback is a top-level nav item; it costs a slot in a six-item nav, but players do need to find it.

## After fixes

Fixed: the P2 and the P3. Commit b7face0.

- Privacy's brand link and back link go to "/" and read "Back to Tennis League": the root redirects a signed-in player to the dashboard, and the middleware sends a signed-out visitor to sign-in.
- Feedback's loading state renders the nav, a main landmark, and the "Feedback" heading around the skeleton, so the page no longer jumps.

Heuristics that moved: 3 (3→4). Remaining P0: 0. Remaining P1: 0.
