---
target: mobile home / standings (Rankings tab)
total_score: 27
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:apps/mobile/app/(tabs)/index.tsx"
target_fingerprint: "sha256:de4bb7ec7c8566d4a05cc332416223bebffac5f2be7dc313d1ace634cd2d755e"
target_path: apps/mobile/app/(tabs)/index.tsx
timestamp: 2026-10-20T11-37-50Z
slug: apps-mobile-app-tabs-index-tsx
---
Method: design review only (detector not applicable, native platform). Source review against ios.md and android.md; no simulator or emulator in this environment, so no screenshots. The context loader asked for a structured question probe; this worker has no question tool and is told not to ask, so defaults were chosen and are noted where they matter.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Loading, error, empty, and recalculate states are all present and announced |
| 2 | Match system / real world | 2 | 3 | "Division standings" pools every division level of the season into one table; the league ranks each level separately |
| 3 | User control and freedom | 3 | 3 | Filters are plain chips; nothing destructive here |
| 4 | Consistency and standards | 2 | 3 | Web dashboard has a Division level filter and a "For you" block; mobile has neither. The current-player row uses a 3px colored left border (craft-floor ban) |
| 5 | Error prevention | 3 | 3 | Little to get wrong; the recalculation is idempotent |
| 6 | Recognition rather than recall | 3 | 4 | "You're 3rd of 12" card is good; nothing says a result is waiting on you |
| 7 | Flexibility and efficiency | 2 | 3 | No way to look at one level's table; the only route to "what do I do next" is the Matches tab |
| 8 | Aesthetic and minimalist design | 3 | 3 | Calm, scannable rows; season chips can run to two lines |
| 9 | Error recovery | 3 | 3 | ErrorState with Try again remounts the subscriptions |
| 10 | Help and documentation | 3 | 3 | "How standings work" explains the tiebreak order |
| **Total** | | **27/40** | **31/40** | **Good** |

## Design specificity verdict

LLM assessment: mostly specific. The "You're 3rd of 12 · 5–2 in Fall 2026 singles" card, ordinal ranks, the top-three green rank markers, and the tiebreak explanation are authored for this league. What is generic is the structure: a filter block above a flat list, with nothing that leads a player to their next action, which is product principle 5. The biggest product miss is that the table ignores division levels, so a Beginner player is ranked against Intermediate players in one list that the server never computes that way.

Deterministic scan: not applicable (native platform).

## What's working

- The personal standing card leads the screen and states rank, record, season, and format in one line.
- Every row is one screen-reader stop with rank, record, and differential spoken in order; the visual column header is hidden from assistive tech so it is not read as a row.
- Empty state names the next step ("Go to Matches") and why the table is empty (only confirmed results count).

## Priority issues

1. [P1] Standings mix every division level of the season. `useRankings(divisionId, { seasonId })` with no level recomputes one table across all levels (see CLAUDE.md, useRankings), so a Beginner Singles player sees Intermediate Singles players ranked above them. PRODUCT.md: rankings are "separately for each season and division level." Fix: a Division level filter (levels of the selected season and format), defaulting to the player's own level when they have one, passed through to both ranking hooks; "All levels" stays available. Command: /impeccable clarify, then /impeccable layout.
2. [P2] Nothing on the first tab says something is waiting on the player. The web dashboard leads with "For you" (proposals to answer, results to confirm, a live match). Fix: a compact "Needs you" card above the standing card when there is at least one item, linking to Matches. Command: /impeccable layout.
3. [P2] The current player's row uses a 3px Clubhouse Green left border. Craft floor bans colored side borders above 1px on list items; the tint and "You" label already carry it. Fix: drop the border, keep the tint and label. Command: /impeccable polish.
4. [P3] Fixed column widths (58 and 48) for W–L and Diff can clip at the largest font scale. Fix: allow the numeric cells to shrink with `adjustsFontSizeToFit` or wrap the name instead. Command: /impeccable adapt.

## Persona red flags

Casey (one-handed phone): the format and season chips sit between the personal card and the table, so the table starts below the fold on a small phone; a result waiting for confirmation is invisible here.

Sam (screen reader): good row labels. Chips are buttons with selected state, which is right. The "How standings work" toggle reports expanded state.

Jordan (first-timer): sees a ranking that includes players from another level and may think they are last in the league.

Dana (volunteer leader): "Recalculate rankings" sits on the player screen, which is fine, but a leader comparing levels has to switch to the web.

## Minor observations

- `useAppStore()` destructures the whole store in `StandingsContent`; a selector avoids re-renders.
- Tab title is "Rankings" while headings say "standings"; both terms appear in PRODUCT.md, so this was left.

## After fixes

Fixed: P1 level filter (defaults to the player's own level for the season, falls back to All levels, resets when format or season changes, and is passed to both `useRankings` and `useDoublesRankings`); P2 "Needs you" card (proposals to answer, results to confirm, live matches, from `usePlayerMatches` with `sideOfPlayer` and `canRespondToReport`, the same rules as the web dashboard); P2 left border removed. Left: P3 column widths.

Questions skipped: autonomous worker, no question tool.
