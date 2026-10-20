---
target: web dashboard (Rankings) page
total_score: 28
max_score: 40
after_score: 32
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:apps/web/app/dashboard/page.tsx"
target_fingerprint: "sha256:3fd539aaa91930a14d866a4b3a466aff85542b47fa0407ac11353736853b219c"
target_path: apps/web/app/dashboard/page.tsx
timestamp: 2026-10-20T11-38-51Z
slug: apps-web-app-dashboard-page-tsx
---
⚠️ DEGRADED: single-context (this worker has no sub-agent tool; Assessment A was written before the detector output was read). Browser overlay skipped: no Firebase env, and /dashboard is behind sign-in.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 4 | Loading, error, and empty are distinct (DataState); nothing shows results you reported that wait on your opponent, or disputes a leader is reviewing |
| 2 | Match system / real world | 3 | 3 | Right league terms ("division level", "confirmed results"); the table header "Sets won / played" is long and pushes the table past phone width |
| 3 | User control and freedom | 3 | 3 | Filters are free to change and reset the level when format or season changes |
| 4 | Consistency and standards | 3 | 3 | Tokens and shared states throughout; nav says "Rankings", page says "Welcome back" |
| 5 | Error prevention | 2 | 3 | The level filter defaults to "All levels", which pools every level of the season into one ranked table, so a Beginner and an Intermediate player are ranked against each other |
| 6 | Recognition rather than recall | 3 | 4 | "For you" and the "You: #3" summary are strong; the player's own level is never preselected, so they have to remember and pick it |
| 7 | Flexibility and efficiency | 2 | 3 | No view of what you are waiting on; the standings table scrolls the rank and name off screen on a phone |
| 8 | Aesthetic and minimalist design | 3 | 3 | Clear two-part page: what needs you, then standings |
| 9 | Error recovery | 3 | 3 | Both queries offer Try again |
| 10 | Help and documentation | 3 | 3 | The ranking order is explained in one line under the heading |
| **Total** | | **28/40** | **32/40** | **Good → Good** |

## Design specificity verdict

LLM assessment: specific. The page is built around this league's loop: a "For you" list of live matches, results to confirm, and proposals to answer, then the player's next match, then standings with the player's own row highlighted and summarised as "#3 · You: 4–1 in matches, +12 games". Barlow Condensed rank numerals and the trophy on first place carry the scoreboard voice into the clubhouse. The weak spot is the default table: "All levels" quietly merges flights into a single ranking the league never publishes.

Deterministic scan: `impeccable detect --json` over apps/web/app/dashboard returned 0 findings (exit 0). The detector checks color and layout tokens; the pooled-standings problem is behavioral and invisible to it.

Visual overlays: none. Browser injection was not attempted.

## Overall impression

A good operate page whose one real flaw is a default: the standings it opens on are not the standings the league keeps.

## What's working

- "For you" turns the player's matches into verbs ("Review report", "Respond to proposal", "Open live match"), which is principle 5 made concrete.
- DataState keeps "No confirmed results yet" from showing while the query is loading or failing.
- The player's own row is highlighted, badged "You", and marked `aria-current`, and the summary line repeats it above the table for anyone who does not scan.

## Priority issues

1. [P1] "All levels" ranks players from different levels against each other. `useRankings` pools every level when no level is set, and the filter starts there, so the first table a player sees mixes flights. Fix: preselect the player's own rostered level (and its format) for the selected season, and say plainly under the filter when "All levels" combines tables. Command: /impeccable harden, then /impeccable clarify.
2. [P2] Nothing shows what the player is waiting on. A result they reported, a disputed result, and a proposal they sent all vanish from the page. Fix: a short "Waiting on others" list under "For you". Command: /impeccable layout.
3. [P2] The table needs 640px, so on a phone the rank and name scroll away from the numbers. Fix: shorter "Sets"/"Games" headers with the full meaning in an abbreviation, and a narrower minimum width. Command: /impeccable adapt.
4. [P3] Nav label "Rankings" opens a page titled "Welcome back, Ann". Left as is: the mobile tab uses the same label, and the standings are the larger part of the page.

## Persona red flags

Casey (one-handed phone): the standings table scrolls sideways and the name column scrolls off with it.

Sam (keyboard, screen reader): the table region is focusable and captioned with format, season, and level; the "For you" actions are real links with verb labels. No red flags beyond the pooled default.

Jordan (first-timer): opens to a table mixing levels and wonders why the Intermediate champion is above them; does not know "All levels" is a combined view.

Dana (volunteer leader who plays): sees their own to-dos but nothing about the results they are chasing.

## Minor observations

- `noDivision` waits on the profile; a failed profile read shows nothing actionable (not reproduced; low risk).
- The proposal to-do sends the player to /matches rather than to the proposal itself, because accept and decline live on the list.

## After fixes

Fixed: the P1 and both P2s. Commits e192bde (dashboard) and c4931cc (shell button states).

- The level filter now opens on the player's rostered level for the selected season (active or waitlisted membership), and switches the format to match, until the player picks a format or level themselves. "All levels" stays available and now carries a line saying it combines tables and that the league keeps each level separately.
- A "Waiting on others" list under "For you" shows results awaiting the opponent's confirmation, disputed results ("A division leader will resolve it"), and proposals the player sent, each linking to the match or to Matches.
- The table headers are "Sets" and "Games" with the full meaning in `<abbr title>`, and the minimum width dropped from 640px to 520px.

Left alone: the "Rankings" nav label (P3), which matches the mobile tab.

Heuristics that moved: 1 (3→4, pending work is now visible), 5 (2→3, the default table is a real table), 6 (3→4, own level preselected), 7 (2→3). Remaining P0: 0. Remaining P1: 0.
