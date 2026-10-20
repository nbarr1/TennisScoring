---
target: web app shell and design system (AppNav, layout, template, globals.css, shared components, tokens)
total_score: 27
max_score: 40
after_score: 30
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "dir:apps/web/app/shared"
target_fingerprint: "sha256:60fb647ad8db3c70820d0d7c7d7e27d2efefa6d36447cb99d08ff65fc2ce89d2 (AppNav.tsx)"
target_path: apps/web/app/shared
also_covers: apps/web/app/layout.tsx, apps/web/app/template.tsx, apps/web/app/globals.css
timestamp: 2026-10-20T11-38-51Z
slug: apps-web-app-shared
---
⚠️ DEGRADED: single-context (this worker has no sub-agent tool; Assessment A was written before the detector output was read). Browser overlay skipped: no Firebase env, and every page with the nav is behind sign-in.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Button pending, Announcer live regions and toasts, sign-out pending |
| 2 | Match system / real world | 2 | 3 | The nav's "View: Auto / iOS View / Standard" select is developer language, and it only changes the matches pages |
| 3 | User control and freedom | 3 | 3 | Dialog: Escape, focus return, dirty-form discard question, nested stack |
| 4 | Consistency and standards | 2 | 3 | DESIGN.md's hover and press fills (Soft Green on secondary and quiet, pressed green and red on primary and danger) never render: the variant background is an inline style, which beats the class rules in globals.css |
| 5 | Error prevention | 2 | 3 | Every player sees "Admin" in the nav, and the page it opens is built for leaders and fills with permission errors |
| 6 | Recognition rather than recall | 3 | 3 | aria-current with a Ball Yellow underline; Menu disclosure at 1080px |
| 7 | Flexibility and efficiency | 3 | 3 | Skip link, Escape everywhere, useConfirm and useAsyncAction for page authors |
| 8 | Aesthetic and minimalist design | 3 | 3 | Quiet green bar, one accent |
| 9 | Error recovery | 3 | 3 | describeError maps Firebase codes to sentences with a recovery |
| 10 | Help and documentation | 3 | 3 | shared/README.md documents every primitive for page authors |
| **Total** | | **27/40** | **30/40** | **Acceptable → Good** |

## Design specificity verdict

LLM assessment: specific and coherent. Tokens mirror DESIGN.md one to one, the focus ring is Ball Yellow with a Clubhouse Green inner edge (so it holds on white and on the green bar), headings use the condensed scoreboard face, and status is never color-only. The weakness is mechanical: the interactive states the system documents are mostly not reaching the screen.

Deterministic scan: `impeccable detect --json` over apps/web/app/shared, layout.tsx, and template.tsx returned 0 findings (exit 0). The first pass's PlayerSlotPicker slate/blue findings are gone. The dead hover/press states are a cascade problem the detector cannot see.

Visual overlays: none. Browser injection was not attempted.

## Overall impression

A real design system, honestly documented. Fix the cascade so its states render, and stop offering players a page that is not for them.

## What's working

- Dialog is complete: focus trap, Escape only for the top dialog, focus return, scroll lock, bottom sheet under 600px, and an in-dialog discard question for dirty forms.
- describeError and useAsyncAction give every page the same recovery sentences and double-submit protection.
- The nav collapses to a Menu disclosure at 1080px instead of wrapping to three rows.

## Priority issues

1. [P1] "Admin" is in every player's nav. The mobile app hides the Admin tab unless the role is privileged; the web nav shows it to everyone, and the admin page's roster queries are denied for a player. Fix: show Admin only for privileged roles, as mobile does (and keep it visible on /admin itself). Command: /impeccable harden.
2. [P2] Hover and press fills never render. Inline `background` beats `.tl-btn--secondary:hover { background-color }`. Fix: draw the state fills with an inset box-shadow (inline styles set none), with an on-dark variant for buttons on Clubhouse Green. Command: /impeccable polish.
3. [P2] "View: Auto / iOS View / Standard". Fix: label it "Layout" with "Auto", "Compact (iPhone)", and "Standard". Values and behavior unchanged. Command: /impeccable clarify.
4. [P3] Toasts are hidden from assistive technology (by design, since the live region speaks first) and their dismiss button is mouse-only. Left as is.

## Persona red flags

Casey (one-handed phone): no press feedback on secondary buttons; taps "Admin" from the menu and gets errors.

Sam (keyboard, screen reader): skip link, focus ring, and dialog behavior are all correct. Clean.

Jordan (first-timer): sees "View: iOS View" in the menu and wonders what it does; opens Admin and sees errors.

Dana (volunteer leader who plays): Admin is right there. Clean.

## Minor observations

- `appNavStyles.nav`, `navLinks`, and friends are legacy exports kept for callers; only `page` is still used.
- Legacy CSS variable names (`--green-dark`, `--gold`) are still declared for older styles.

## After fixes

Fixed: the P1 and both P2s. Commit c4931cc.

- AppNav lists Admin only when the public profile's role is privileged (`isPrivilegedRole`, the same check the mobile tab bar uses), and always on /admin itself so the current page never vanishes from the nav. The admin page is unchanged and still reachable by URL; a leader whose role is still `player` (possible only if an administrator edited `leaderIds` by hand) no longer sees the link, which matches mobile.
- Button state fills are drawn as `inset 0 0 0 100vmax` box-shadows (Soft Green on secondary and quiet hover and press, the pressed shades on primary and danger, Destructive Soft on quiet-danger), which inline backgrounds cannot override. `tl-btn--on-dark` gives buttons on Clubhouse Green, or with their own fill, a neutral veil. README documents both.
- The nav's select is labelled "Layout" with "Auto", "Compact (iPhone)", and "Standard"; stored values are unchanged.

Left alone: the toast dismiss (P3), legacy exports and CSS variables.

Heuristics that moved: 2 (2→3), 4 (2→3), 5 (2→3). Remaining P0: 0. Remaining P1: 0.
