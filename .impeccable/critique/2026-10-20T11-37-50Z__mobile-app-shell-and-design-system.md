---
target: mobile app shell (root and tab layouts) and design system (theme, shared components)
total_score: 27
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:apps/mobile/app/_layout.tsx + (tabs)/_layout.tsx + theme/* + components/{AppIcon,FormField,KeyboardSafeView,PlayerSlotPicker,StatusBadge}.tsx"
target_fingerprint: "sha256:407aea28d066c0438d25adf4d06cfd2be0408340132ad24226bf596148b33ac0"
target_path: apps/mobile/app/_layout.tsx
timestamp: 2026-10-20T11-37-50Z
slug: mobile-app-shell-and-design-system
---
Method: design review only (detector not applicable, native platform). Source review against ios.md and android.md; no simulator or emulator available.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Gate overlay with a 15-second "Still loading" fallback |
| 2 | Match system / real world | 3 | 3 | Tabs are sections, not actions |
| 3 | User control and freedom | 2 | 3 | A render crash shows "Close the app and open it again" with no way to recover in place |
| 4 | Consistency and standards | 2 | 3 | Status-bar style never set: in light mode the clock and battery are dark on the Clubhouse Green header (about 2:1) on every tab screen |
| 5 | Error prevention | 3 | 3 | Destructive confirms and verb labels are built into the primitives |
| 6 | Recognition rather than recall | 3 | 3 | Filled tab icon plus label for the active tab |
| 7 | Flexibility and efficiency | 3 | 3 | Primitives cover pending, error, empty, announce |
| 8 | Aesthetic and minimalist design | 3 | 3 | Tokens follow DESIGN.md |
| 9 | Error recovery | 2 | 3 | Same root-boundary issue |
| 10 | Help and documentation | 3 | 3 | components/README.md is a real guide |
| **Total** | | **27/40** | **30/40** | **Good** |

## Design specificity verdict

LLM assessment: a mature small system. Tokens carry measured contrast notes, `statusTextColors` exists because the brand status colors fail as text, `MIN_TOUCH_TARGET` is 48dp on Android and 44pt on iOS, and every SF Symbol has a Material mapping. The two real gaps are both about the edges of the screen the app did not draw: the status bar and the input outline.

Deterministic scan: not applicable (native platform).

## What's working

- `useAsyncAction`, `confirmDestructive`, `InlineAlert`, and `announce` make the safe path the easy path; most screens use them.
- `AppIcon` hides decorative glyphs from TalkBack, where expo-symbols would otherwise read a ligature aloud.
- The auth gate covers the navigator instead of unmounting it, with diagnostics behind `__DEV__`.

## Priority issues

1. [P1] Status bar contrast. No screen sets a status-bar style, so the OS default (dark content in light mode) draws dark icons on the Clubhouse Green headers of every tab and pushed screen, and light icons on the canvas screens in dark mode (`userInterfaceStyle: "automatic"`). Fix: `expo-status-bar` (already installed) light under green headers, dark on canvas screens. Command: /impeccable adapt.
2. [P1] Input outlines fail non-text contrast. `TextField`, `FormField`, and `PlayerSlotPicker` outline fields with the Hairline `#DADDD8` (about 1.4:1 on white), and DESIGN.md says inputs use Strong Hairline `#8A8F8C` because the hairline "is too faint to show where a field is." Fix: add `colors.borderStrong` and use it for field edges. Command: /impeccable audit.
3. [P2] The root error boundary has no recovery action. Fix: a "Try again" button that clears the error and re-renders the tree. Command: /impeccable harden.
4. [P2] `app.json` sets `userInterfaceStyle: "automatic"` while the palette is light-only; system sheets and the keyboard go dark around light screens. Request for the owner of app.json: set it to `"light"` until a dark palette exists (not changed here; not owned).
5. [P3] `statusTextColors.completed` is an off-token `#555555`.

## Persona red flags

Casey (outdoors, bright light): the status bar is unreadable on the green header; the field outlines vanish in glare.

Sam (low vision): cannot find where a text field starts on the profile and admin forms.

## After fixes

Fixed: P1 status bar (light in the tab layout and on pushed green-header screens, dark on the canvas screens, light on the tutorial); P1 `colors.borderStrong` on every input edge (TextField, FormField, PlayerSlotPicker, the message composer); P2 root boundary "Try again". Left: P2 app.json (not owned), P3.

Questions skipped: autonomous worker, no question tool.
