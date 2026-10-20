---
target: web admin page
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
before_total_score: 28
before_p0_count: 0
before_p1_count: 3
scored_after_commit: 4e05217
target_identity: "file:/home/claude/TennisScoring/.claude/worktrees/agent-ad13f595026ae9760/apps/web/app/admin/page.tsx"
target_fingerprint: "sha256:0db4b8eac738aa54f37085b9e61df51d7dc6e70a2014fdceaf82cb8bea4ee941"
target_path: /home/claude/TennisScoring/.claude/worktrees/agent-ad13f595026ae9760/apps/web/app/admin/page.tsx
timestamp: 2026-10-20T11-44-39Z
slug: apps-web-app-admin-page-tsx
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this worker session; Assessment A was finished and recorded before the detector ran). Browser overlay skipped: no Firebase env, and /admin is behind sign-in and the leader role.

Surface: web admin page `/admin` (Roster, Divisions, and Tools tabs, player detail panel, Add player, Import roster, round-robin scheduler, reported-messages queue, ranking repair, CSV export). Files: `apps/web/app/admin/page.tsx`, `AdminParts.tsx`, `adminStyles.ts`, `admin.module.css`. Includes PR #386 (the "Other seasons" chip and season-scoped unassigned counts via `useDivisionRosteredSeasons`), whose behavior is kept.

## Design health score

"Before" is Main at c59e096. "After" is this worker's commit 4e05217.

| # | Heuristic | Before | After | Key issue (before) / what changed |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | Before the season memberships load, every player renders as Unassigned, the roster tab badge and "N players have no division level" banner fire, and a failed memberships query looks identical to "nobody assigned". After: roster, counts, and banner wait for both snapshots; recorded-matches list has loading and error states. Still 3: the membership hooks swallow query errors, so a failure reads as an empty season (needs firebase-client change). |
| 2 | Match system / real world | 3 | 3 | Product terms are right throughout. Leaks: the load error leads with `users/{uid}.role is admin or app_developer` and token claims; "Normalized N historic matches". After: troubleshooting detail sits behind a disclosure, repair copy is plain. "View as user" still says little about what it previews. |
| 3 | User control and freedom | 3 | 3 | Remove is confirmed, links and contact edits can be undone, dirty dialogs ask before discarding, selection clears. No undo for a row move, but a move is reversible from the same select. |
| 4 | Consistency and standards | 3 | 3 | Shared Button/Dialog/InlineAlert everywhere. Before: other-season rows wore the amber Unassigned treatment and a Remove button that could only report "Nothing changed". After: neutral select, season named, no Remove. Placeholders still get two save buttons in one panel. |
| 5 | Error prevention | 2 | 3 | Row select wrote on every change (arrow keys on a closed select in Firefox and Chrome on Windows walk the player through each level and pop the removal confirm on "Unassigned"); registered players' email and phone were editable and silently ignored; Add player and Import silently move an existing player when the name or email matches; duplicate level names allowed. All fixed. |
| 6 | Recognition rather than recall | 3 | 3 | Chip counts, tab badges, and season-labelled headings help. Before: import parsing invisible, other-season players didn't say which season, scheduler preview had no dates. After: parsed import list with "Moves from X", "In Fall 2026" on other-season rows, round dates in the preview. |
| 7 | Flexibility and efficiency | 3 | 3 | Bulk assign, paste import, filters, search, keyboard tabs. No bulk remove, tabs aren't deep-linkable. After: "Show players" on each level card jumps to that roster filter. |
| 8 | Aesthetic and minimalist design | 3 | 3 | Calm and on-token. The Tools tab opens its Reports and Scheduler panels below a five-card grid, away from the button that opened them (focus moves there, so it works, but it reads as a jump). |
| 9 | Error recovery | 3 | 3 | Partial bulk and import failures keep what landed and leave only failures selected or in the box; most errors carry Try again. Before: the recorded-matches load failed silently as "No recorded matches". |
| 10 | Help and documentation | 3 | 3 | Good inline hints (invite code, level, scheduler, replace-schedule). Before: changing Role to Division leader said nothing about what it grants. After: hint added. |
| **Total** | | **28/40** | **30/40** | **Good → Good** |

P0: 0. P1: 3 before, 0 after.

## Design specificity verdict

LLM assessment: specific to this product in the places that matter. The roster is a season-scoped table whose one inline control is the division level, the attention strip speaks in reported messages, disputed results, and unassigned players, the remove confirmation explains what happens to match history and division membership, and partial-write handling names exactly which players landed. What remains generic is the Tools tab, a grid of same-size cards of title, sentence, and button, which could belong to any admin product. Missed opportunity: "Results to resolve" lists "A vs B" with no age or date, so a leader can't tell which result has been stuck longest, which is the one thing they come here to chase.

Deterministic scan: `impeccable detect --json` on page.tsx, AdminParts.tsx, and adminStyles.ts returned `[]` (exit 0), before and after the fixes. admin.module.css is CSS-only and was not passed, per the detector's rules; it uses only DESIGN.md tokens via CSS variables. The detector agreed with the review that the page is on-token; everything found here is behavioral, which the detector does not scan.

Visual overlays: none. Browser injection was not attempted.

## Overall impression

A careful, honest admin page whose one real weakness was time: what it showed before its data arrived, and what it wrote while a keyboard user was still choosing. Those are fixed. The biggest remaining opportunity is helping the leader chase stuck results, not just list them.

## What's working

- Partial-failure handling in bulk assign and import: what landed is kept, failures stay selected or stay in the text box, and the message counts both. A volunteer never has to work out who got added.
- Destructive actions are explained before they happen: removing from a season says history is kept and when the player also leaves the division; removing a reported message says it's gone for everyone; replacing a published schedule says self-arranged matches are kept.
- PR #386's season scoping reads correctly: players from other seasons are out of the season's counts and behind their own "Other seasons" chip, and now say which season they're in.

## Priority issues

1. [P1, fixed] The roster rendered before the season memberships loaded. Every player showed as Unassigned with the amber select, the tab badge and attention banner counted them all, and choosing a level in that window wrote `status: active` for a waitlisted player (the case CLAUDE.md warns about), because the row had no membership yet. Fix: the roster table, header counts, tab badge, and banner wait for `useDivisionMemberships` and `useDivisionRosteredSeasons` to finish. Command: /impeccable harden.
2. [P1, fixed] The row level select wrote on every change. Arrow keys on a closed select (Firefox, Chrome on Windows) moved the player through each level with a write and announcement each, and passing over "Unassigned" opened the removal confirmation mid-scan. Fix: the select shows the choice at once and writes after 600ms without a further change; Unassigned confirms only if it is where the choice settled; arrowing back to the saved level writes nothing. Command: /impeccable harden.
3. [P1, fixed] A registered player's email and phone were editable in the detail panel. Save player toasted "saved" while the server kept the account's own contact details (and stored the typed email only in the membership snapshot); "Update contact only" failed with a server error. Fix: the fields are read-only for registered players with a hint naming why, and the contact-only save appears only for placeholders. Command: /impeccable clarify.
4. [P2, fixed] Add player and Import roster silently reuse an existing player whose email or name matches (the server's behavior) and move them to the chosen level; the import showed only a count, so a leader couldn't check how lines were parsed; a second level with the same name in one season was allowed. Fix: an inline note in Add player, a parsed preview with "Moves from X" per line plus a warning count in Import, and a field error that blocks a duplicate level name. Command: /impeccable harden.
5. [P2, fixed] Smaller hardening: admin UI rendered before the role check finished; the recorded-matches list had no loading or error state; focus fell to the page after removing a row; database-field troubleshooting led the load error; the Role select didn't say what Division leader grants. Command: /impeccable harden, /impeccable clarify.

Remaining, not fixed here:
- [P2] Membership query failures are invisible: `useDivisionMemberships` and `useDivisionRosteredSeasons` swallow errors and return an empty list, so a failed query reads as an empty season. Needs a firebase-client change (return `error`).
- [P3] "Results to resolve" lists no date or age; the oldest stuck result isn't findable at a glance.
- [P3] No bulk remove from a season; tabs aren't deep-linkable; "View as user" shows a single summary card.

## Persona red flags

Dana (volunteer leader who plays), scored with special care. Before: opens Monday morning and sees "14 players have no division level" for a second before it vanishes, and doesn't trust the banner after that; pastes an emailed list into Import, can't see how it was read, and a returning player whose name matches is quietly moved from Intermediate to Beginner; fixes a registered player's typo'd email in the detail panel, gets "saved", and the email never changes; creates "Beginner Singles" twice and then can't tell the two apart in any select. After: all four are fixed. Still open for Dana: nothing helps her chase the result that has been unconfirmed for three weeks, and taking ten departing players off a season is ten confirmations.

Sam (keyboard, screen reader): before, arrowing through a row's level select on Windows wrote and announced every level and dropped a removal dialog on them halfway; after removing a player, focus fell to the document. After: one write when the choice settles, and focus moves to the roster heading. The roster tab, tablist, chips, and dialogs were already solid: roving tabindex, aria-pressed chips, labelled selects, and destructive confirms that start on Cancel. Remaining: the 600ms settle is silent until the write lands (the row's spinner is visual only, though `aria-busy` is set).

Alex (power user): bulk assign and paste import are fast, and the bulk bar stays reachable. Missing: no bulk remove, no shortcut from a level to its roster until this pass added "Show players", and no way to link someone to the Tools tab.

Jordan (first-time leader): the empty states say what to do next ("Create a division level first, then add or import players"), and the Divisions tab explains levels. The load error used to greet them with uid, token claims, and `users/{uid}.role`; that now sits behind "Troubleshooting details".

## Minor observations

- The "View as user" button changed its label and set aria-pressed, a double signal; aria-pressed is removed and the label carries the state.
- The email cell said "No email" to screen readers for players who have one but don't share it; it now says "Email not shared".
- The scheduler's player chips reset whenever the memberships snapshot updates, so another leader's edit clears a hand-made selection.
- Reported messages show no reporter or time.
- page.tsx is about 3,500 lines; the Tools panels and dialogs could move to their own files under `app/admin/` without changing behavior.

## Questions to consider

- If "Results to resolve" sorted by how long each has waited and offered "Remind both players", would the attention banner need anything else?
- Why is taking a departing group off a season ten dialogs, when assigning them is one bar?
- Does the Tools tab need to be five cards, or two (things waiting on you, and things you run)?

Questions skipped: this is an autonomous worker run with no user to ask; the owner's brief already set scope (fix every P0 and P1 and the cheap, safe P2s).
