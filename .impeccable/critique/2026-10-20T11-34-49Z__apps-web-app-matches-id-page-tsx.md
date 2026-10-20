---
target: web match detail page
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
after_total_score: 32
target_identity: "file:apps/web/app/matches/[id]/page.tsx"
target_path: apps/web/app/matches/[id]/page.tsx
timestamp: 2026-10-20T11-34-49Z
slug: apps-web-app-matches-id-page-tsx
baseline: none (first scored run for this surface)
---
⚠️ DEGRADED: single-context (second-pass worker run; the design review was completed and recorded before the detector ran, but both ran in one context). Browser overlay skipped: no Firebase env and /matches/[id] is behind sign-in.

## Design health score

Scored on Main at c59e096, before this pass's edits. The "After" column is the re-score after this pass's fixes. There is no first-pass score for this surface; the first pass hardened it (commit 2c43353) without a scored report.

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 4 | Every status has a next-step panel, pending labels, and announced outcomes. A participant opening a scheduled match saw only the court view: no date, time, or level. The live court view showed no match moment (deuce, break point, match point) |
| 2 | Match system / real world | 3 | 4 | Tennis-literate (serve side, match tiebreak, tiebreak loser points). A proposal or scheduled match showed "Sets 0 – 0" and a 0-0 score hero, and "Set breakdown: No games played yet" |
| 3 | User control and freedom | 2 | 3 | One tap on either half of the screen ("Ann serves first") started a scheduled match, from the page a player opens to check the time. Nothing undoes a start; the only way out is Cancel match. Postpone offers only +30m/+1h/+2h/+1 day |
| 4 | Consistency and standards | 2 | 3 | The whole clubhouse view sat on Clubhouse Green, against DESIGN.md's "every clubhouse screen on the Paper Canvas". Stats are a div grid, not a table. Score editing is a text line while the list's Record form uses per-set inputs |
| 5 | Error prevention | 2 | 3 | Accidental match start (above). Delete is well guarded (typed DELETE), dispute and settle are confirmed |
| 6 | Recognition rather than recall | 3 | 3 | Step panels name the opponent and the time; court view did not show the time |
| 7 | Flexibility and efficiency | 2 | 3 | Postpone to a specific time required cancelling and proposing again |
| 8 | Aesthetic and minimalist design | 3 | 3 | Calm and ordered; the unplayed 0-0 hero and empty set breakdown were noise |
| 9 | Error recovery | 3 | 3 | Inline errors in every panel; ConfirmDialog stays open with the error; live point failures say "check your connection and tap again" |
| 10 | Help and documentation | 3 | 3 | Copy explains consequences: "It counts in the standings right away", "Saving reopens this confirmed result" |
| **Total** | | **26/40** | **32/40** | **Good** |

## Design specificity verdict

LLM assessment: specific to this product. The court view is the scoreboard from DESIGN.md: black, Player Blue and Player Orange stripes, condensed numerals, "Point to Ann" halves, undo in the hint strip, set and match clocks. The clubhouse view's next-step panels encode the league's rules (opposing side confirms, leaders settle, guests stay out of standings until linked). Missed: the web court view had no moment band, which is the signature piece of the mobile scoreboard.

Deterministic scan: `impeccable detect --json apps/web/app/matches` returned `[]` (0 findings) before and after this pass.

Visual overlays: none. Browser injection was not attempted.

## Overall impression

A strong, honest detail page whose one serious flaw is routing: a participant's scheduled match opened straight into the court view, so checking "when is my match?" put two screen-filling start buttons under the thumb and no date on screen.

## What's working

- Next step by status and seat: accept or decline, waiting for the other side, submit, confirm or dispute, settle (leaders), link a guest. Each names the opponent.
- Destructive and final actions are confirmed with consequence copy; delete needs DELETE typed.
- The court view's live region announces game, sets, and server after each point; point taps are debounced and failures are recoverable.

## Priority issues (before this pass)

1. [P1] Scheduled matches opened in the court view. `isParticipant && (scheduled || in_progress)` rendered the full-screen scoreboard with two "X serves first" halves, so one tap set the match live (`startMatch`) with no undo, days before it is played, and the page never showed the scheduled date and time, the opponent's full name, or the match options entry point except through the icon. Fix: participants of a scheduled match get the clubhouse view with a "Scheduled" step showing the time and a primary "Start live scoring" button that opens the court view; the court view's server choice has a way back to the details. In-progress matches still open straight into the court view. Command: /impeccable harden.
2. [P2] Unplayed matches showed a 0-0 scoreboard. Proposed, scheduled, and never-started cancelled matches rendered "Sets 0 – 0", a 0-0 score, and an empty Set breakdown card. Fix: show the scheduled time in the hero instead, and drop the breakdown until a point is played. Command: /impeccable clarify.
3. [P2] Clubhouse view on full Clubhouse Green. Cards sat on green rather than the Paper Canvas. Fix: keep the green as a hero band (nav and scoreboard), with the panels on the canvas. Command: /impeccable polish.
4. [P2] Postpone only by fixed offsets. Fix: add "Pick a new date and time" with a `datetime-local` field, confirmed like the presets (`postponeMatch` already takes any time). Command: /impeccable harden.
5. [P2] The court view had no moment band, no `main` landmark, and no heading. Fix: show `getMatchMoment()` (already in `@tennis/shared`) as a pill in the hint strip using the DESIGN.md band tones, with the player's name; wrap the view in `main` with a visually hidden `h1`. Command: /impeccable audit.
6. [P3] Stats are a div grid read cell by cell; StepPanel carried both `aria-label` and a visible `h2`. Fix: table roles on the stats grid; label panels by their heading.

## Persona red flags

Casey (one-handed phone): opening a scheduled match to check the time puts two half-screen start buttons under the thumb (fixed). Live scoring itself is excellent one-handed.

Sam (keyboard, screen reader): the court view had no landmark or heading to land on (fixed); stats were not a table (fixed with roles). Announcements after each point are good.

Jordan (first-timer): a proposal showing "Sets 0 – 0" reads like a result (fixed).

Dana (volunteer leader who plays): moving a match to Thursday meant cancel and re-propose (fixed with a chosen time). The settle panel is clear.

## Minor observations

- The "Elapsed time" stats block uses blank second-column cells.
- Spectators of a live match get the clubhouse view without a live region.
- Edit score is a free-text line; the list's Record form uses per-set inputs.

## After fixes (this pass)

- Scheduled participants land on the clubhouse view with a "Scheduled" step: the time, "Start live scoring", and Match options. The court view's server choice has a "Details" button back. In-progress matches still open on court.
- Unplayed matches show "Scheduled for …" (or "Time not set") in the hero instead of a 0-0 score, and no empty Set breakdown.
- Green hero band over a Paper Canvas body.
- Postpone has "Pick a new date and time", validated as a future time, confirmed like the presets.
- Court view: `main` landmark, visually hidden `h1`, and a moment pill (Match point · Ann, Break point · Bob, Deuce, Tiebreak…) in the hint strip, announced with the score.
- Stats grid has table roles; step panels are labelled by their heading.

Questions skipped: worker run with no user to ask; the project manager relays this report.
