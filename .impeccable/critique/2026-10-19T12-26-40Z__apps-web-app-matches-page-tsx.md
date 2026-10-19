---
target: web matches page
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/TennisScoring/apps/web/app/matches/page.tsx"
target_fingerprint: "sha256:a6dce28dd06a6ee880a57ff84ec3aabb8664102e32d19de178e63ef1d2b7d2f0"
target_path: /home/user/TennisScoring/apps/web/app/matches/page.tsx
timestamp: 2026-10-19T12-26-40Z
slug: apps-web-app-matches-page-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent). Browser overlay skipped: no Firebase env, no installed dependencies, and /matches is behind sign-in.

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Accept, Decline, Cancel, Propose, and Record give no pending or success feedback; a failed query shows as "No matches yet" |
| 2 | Match system / real world | 2 | Tennis terms are right; product terms drift ("Division" filter picks a level, "Pending Invitations" vs "Proposed", "Quick start for iOS") |
| 3 | User control and freedom | 1 | Decline and Cancel fire instantly with no confirm or undo; an overlay click discards a half-filled form; no Escape |
| 4 | Consistency and standards | 2 | Local StatusBadge duplicates the shared one; buttons nested in a link; mixed radii and off-token grays |
| 5 | Error prevention | 1 | The view filter silently sets the season and level new matches are created in |
| 6 | Recognition rather than recall | 2 | Opponent availability lives on another screen; cards never say "you" |
| 7 | Flexibility and efficiency | 3 | Bulk add, record on behalf, and filters serve leaders well |
| 8 | Aesthetic and minimalist design | 2 | Five equally weighted sections; unrelated View select in the nav |
| 9 | Error recovery | 2 | Modal errors are clear; Accept and Decline failures are silent |
| 10 | Help and documentation | 2 | Good inline hints; nothing says what happens after Propose or Record |
| **Total** | | **20/40** | **Acceptable** |

## Design specificity verdict

LLM assessment: mostly generic. Title, buttons, filter bar, and sections of identical cards; swap "Matches" for "Meetings" and little breaks. Product character lives in details: the live card's "{name} serves · ad side" line, Barlow Condensed set scores, the pulsing Live Green dot and edge, and the match-tiebreak set entry. One MatchCard serves invitations, other people's live matches, and history alike. Missed: no "your next match," no "needs your confirmation," no availability shown when proposing (styles exist but are unused).

Deterministic scan: 8 advisory design-system-color findings in matches/page.tsx (off-token grays #556, #999, #333, #555, #bbb at lines 1501, 1591, 1626, 1641, 1661, 1706, 1824, 1826) and 7 in shared/PlayerSlotPicker.tsx (a whole Tailwind slate/blue scale). All 15 likely true positives. The design review independently flagged the same grays and added contrast measurements (#bbb about 1.9:1, #999 about 2.8:1, #888 about 3.5:1 on white). The detector missed the structural and interaction issues; it scans colors, not behavior.

Visual overlays: none. Browser injection was not attempted.

## Overall impression

A careful, tennis-literate form and live card sitting inside a page that doesn't know who's looking at it. The single biggest opportunity: lead with what this player has to do now.

## What's working

- The live match card: Live Green edge, pulse that respects reduced motion, and the server/court-side line tell a spectator the state at a glance.
- Status is never color-only: glyph, label, and color, plus an explicit "{name} wins" pill.
- Score entry encodes real league rules: numeric inputs, "your games first," per-set labels, a match-tiebreak option only on an eligible deciding set, and validation shared with the server.

## Priority issues

1. [P1] The filter bar decides where new matches are created. Season, level, and match type from the view filter go straight into Propose, Record, and Start Live (page.tsx 433-469). The level filter defaults to "All divisions," so by default proposals and records get no division level and doubles is never offered; a past season in the filter creates matches in that past season. Fix: explicit season and level fields in each form, defaulting to the current season and the player's level, shown as a chip. Command: /impeccable harden, then /impeccable clarify.
2. [P1] Results awaiting your confirmation are buried, and your matches are mixed with everyone's. No "needs you" group; Upcoming and All Matches are division-wide; pending-report cards look like history. Fix: Needs you (invitations, results to confirm) → Your next match → Waiting on others → Live in your division → History, collapsed. Command: /impeccable layout.
3. [P1] Accept, Decline, and Cancel are unsafe and silent. One-tap irreversible Decline 8px from Accept; no pending, error, or success state; 34px buttons nested inside the card's link (invalid HTML, and a missed tap navigates away). Fix: card container with a separate link, 48px buttons, confirm Decline, pending state, inline error, aria-live outcome. Command: /impeccable harden.
4. [P2] Modals lack dialog behavior: no focus trap, Escape, or focus return; Start Live has no dialog role; overlay click discards entered scores. Fix: one shared dialog component; confirm before discarding a filled form. Command: /impeccable harden.
5. [P2] Off-system styling: off-token grays with failing contrast, Ball Yellow as decoration on the historic badge, Live Green as a button fill (white on #27ae60 about 2.9:1), and many targets under 44px (changeBtn about 20px, removeSet 16px, addSet about 26px, inputs about 41px). Fix: move inline styles onto DESIGN.md tokens and component sizes. Command: /impeccable polish, then /impeccable audit.

## Persona red flags

Casey (one-handed phone): nav wraps to 3-4 rows at 375px so the first actionable card is below the fold; 34px Accept/Decline 8px apart; missed taps open the card; overlay tap wipes a half-entered score.

Sam (keyboard, screen reader): buttons inside links; no modal focus management or Escape; accept/decline moves a card between sections with no announcement; "Change" buttons have no context; low-contrast grays; the date field's aria-label overrides its visible "When?" label.

Jordan (first-timer): the empty state says to use the mobile app; "Division" means level; "Pending Invitations" vs "Proposed"; "Historic," "+ Live," "Quick start for iOS"; forms close with no "Ann will be asked to confirm."

Dana (volunteer leader who plays): recording on behalf is behind "Any Two Players"; Bulk Add is guest-only and resets the mode; "All divisions" records get no level; their own matches get lost in the division list; nothing helps chase unconfirmed results.

## Minor observations

- "All Matches" sorts by creation date, not play date.
- Unused styles: resultEmail, selectedEmail, availability*.
- "+ Live" always creates a guest opponent.
- pageTitle asks for weight 800, which isn't loaded on web.
- The filter bar's aria-label sits on a plain div with no role.
- The iOS view's 12px side padding breaks the 16px gutter.

## Questions to consider

- If the page opened with "You have 1 result to confirm, and your next match is Thursday against Ann," how many of the five sections would still need to exist?
- Why does recording a result start from a blank form instead of from the scheduled match it belongs to?
- What if Decline were a counter-offer using both players' availability?
