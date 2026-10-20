---
target: web matches page
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
after_total_score: 33
target_identity: "file:apps/web/app/matches/page.tsx"
target_path: apps/web/app/matches/page.tsx
timestamp: 2026-10-20T11-34-49Z
slug: apps-web-app-matches-page-tsx
baseline: 2026-10-19T12-26-40Z__apps-web-app-matches-page-tsx.md (20/40, P1 x3)
---
⚠️ DEGRADED: single-context (second-pass worker run; the design review was completed and recorded before the detector ran, but both ran in one context). Browser overlay skipped: no Firebase env and /matches is behind sign-in.

## Design health score

Scored on Main at c59e096, before this pass's edits. The "After" column is the re-score after this pass's fixes.

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 4 | Accept, Decline, Withdraw, Propose, and Record now show pending, error, and announced success. But "Needs you" and "Your next match" came from the filtered list, so a filter on another level or a past season said "Nothing needs you right now" while a result was waiting |
| 2 | Match system / real world | 3 | 3 | Product terms are now consistent ("proposal", "division level", "confirm", "dispute", "guest"). "Division schedule" vs "Results to settle" is clear |
| 3 | User control and freedom | 3 | 3 | Decline and Withdraw are confirmed, dialogs trap focus, close on Escape, and ask before discarding a filled form |
| 4 | Consistency and standards | 3 | 3 | Shared Button, Dialog, StatusBadge, InlineAlert, and tokens throughout. Per-set score inputs here vs a free-text score line on the match page |
| 5 | Error prevention | 3 | 4 | Season and level are explicit fields defaulting to the player's own level. The Record form's standings hint said a guest result "counts toward the division standings once confirmed", which it never does until the guest is linked |
| 6 | Recognition rather than recall | 2 | 3 | Cards say "You"; Needs you lists what to do. Opponent availability is still not shown when proposing (needs backend change, see below); a to-do outside the filter was invisible |
| 7 | Flexibility and efficiency | 3 | 3 | Bulk guest results, record on behalf, filters, and collapsed history serve leaders well. "Score live now" exists only in the iOS view |
| 8 | Aesthetic and minimalist design | 3 | 3 | Clear order: Needs you, Your next match, Waiting on others, leader queue, Live, then collapsed schedule and history |
| 9 | Error recovery | 3 | 3 | Inline errors in cards and dialogs; bulk import keeps unrecorded lines after a partial failure |
| 10 | Help and documentation | 3 | 4 | Every action says what happens next. The guest-standings hint contradicted the success toast |
| **Total** | | **29/40** | **33/40** | **Good (was Acceptable at 20/40)** |

## Compared with the first pass

Baseline 20/40 with three P1s. Every first-pass priority issue is fixed on Main:

1. [P1] Filter bar decided where new matches are created: **fixed.** Propose, Record, and Score live now each carry a "Where this match counts" fieldset (`useCompetition` / `CompetitionFields`) that defaults to the current season and the player's own rostered level (active or waitlisted), independent of the list filter. Doubles is offered whenever the chosen level is doubles.
2. [P1] Results awaiting confirmation were buried: **fixed.** The page leads with Needs you (invitations, results to confirm, scores to submit), then Your next match (featured), Waiting on others, Results to settle (leaders), Live in your division, and collapsed Division schedule and History.
3. [P1] Accept, Decline, Cancel unsafe and silent: **fixed.** The card is an `<article>` with a separate link; buttons are 48px; Decline and Withdraw go through ConfirmDialog; Accept shows "Accepting…", an inline error, and an announced toast.
4. [P2] Modals lacked dialog behavior: **fixed** by the shared Dialog (focus trap, Escape, focus return, dirty-form discard confirm).
5. [P2] Off-system styling and small targets: **fixed.** Detector is clean; set inputs, remove-set, add-set, and the tiebreak toggle all meet 44-48px; Live Green is no longer a button fill.

Minor observations from the first pass: "All Matches" sort (now play-date order), unused styles (removed), pageTitle weight 800 (now display 700), filter bar role (now `role="group"`), iOS gutter (now 16px) are all fixed. "+ Live always creates a guest" is now explicit in the dialog title and description.

What remained on Main at this pass is listed below.

## Design specificity verdict

LLM assessment: now product-specific. The page reads like a league to-do list: "Ann proposed this match. Accept to schedule it", "Ann reported this score. Confirm it, or dispute it", "Results to settle" for leaders, a featured next match, the live card's server and court line, and the match-tiebreak set entry. A generic "meetings" app could not reuse this without rewriting the copy and grouping. The remaining generic part is the card itself: the same card shape serves every status, with only the context line and link label changing.

Deterministic scan: `impeccable detect --json apps/web/app/matches` returned `[]` (0 findings), before and after this pass. The 8 off-token gray findings from the first pass are gone.

Visual overlays: none. Browser injection was not attempted (no Firebase env; page is behind sign-in).

## Overall impression

The first pass's direction landed: the page leads with what this player must do. The one real gap left was that "what you must do" was still computed from the filtered list, so the filter could hide a to-do and then say nothing needed you.

## What's working

- Needs you, with three precise contexts (accept or decline, confirm or dispute, submit the score), each with the one action as the primary control.
- "Where this match counts" makes season and level visible and editable at creation, with a hint that names the player's own level.
- Bulk guest import validates every line before writing any and, after a partial failure, removes the lines that landed so a retry cannot double-record.

## Priority issues (before this pass)

1. [P2] Personal sections followed the list filter. Needs you, Your next match, and Waiting on others were derived from the season- and level-filtered division query. Picking another level, or a past season, emptied them and showed "Nothing needs you right now"; if the filtered list was empty the whole page became an empty state, hiding a result waiting for confirmation. The default filter (current season, all levels) was correct, so this is P2, not P1. Fix: derive the personal sections from the player's own matches in this division (`usePlayerMatches`), every season and level, and say so under the filter. Command: /impeccable harden.
2. [P2] Guest standings hint contradicted the outcome. "Count this result in the standings / Counts toward the division standings once confirmed" was shown for a guest opponent and for bulk guest import, while the success toast says guest results stay out until linked. Fix: guest-aware hint. Command: /impeccable clarify.
3. [P2] Opponent availability is not shown when proposing. `PublicProfile` carries no availability (it lives on the private `users` doc), so the form cannot show it without a data change. Needs backend change (not done). Command: /impeccable shape.
4. [P3] The collapsed Division schedule and History groups had no heading, so heading navigation skipped them. Fix: make each summary title an `h2`. Command: /impeccable audit.
5. [P3] "Score live now" (guest live match) is offered only in the iOS view. Left as is: on desktop a player is not on court, and the action stays one tap away on the phone layout.

## Persona red flags

Casey (one-handed phone): no remaining blockers. 48px buttons, separate link, featured next match near the top. The title row's two buttons and the two filter selects sit above Needs you at 375px; acceptable because Needs you follows immediately.

Sam (keyboard, screen reader): dialogs, confirms, and announcements are solid. Collapsed groups were not headings (fixed). Card links are "View details" with the match described by `aria-describedby`.

Jordan (first-timer): copy is plain. The guest hint promising standings credit was the one misleading sentence (fixed).

Dana (volunteer leader who plays): filtering to the level they lead hid their own to-dos (fixed). Results to settle is a real queue now.

## Minor observations

- Record (per-set inputs) and the match page's Edit score (one text line) enter the same thing two ways.
- `isLeader` and `canRecordOnBehalf` are two spellings of the same role check.
- Recording a doubles result is not offered on web; Propose handles doubles. Unchanged.

## After fixes (this pass)

- Personal sections (Needs you, Your next match, Waiting on others) now come from `usePlayerMatches` filtered to this division, every season and level, falling back to the filtered list if that query fails. The filter bar says the filters change only the division sections, and the page's empty state only shows when both are empty.
- The standings checkbox hint is guest-aware for a guest opponent and for bulk import.
- Collapsed group titles are `h2` headings inside their summaries.

Questions skipped: worker run with no user to ask; the project manager relays this report.
