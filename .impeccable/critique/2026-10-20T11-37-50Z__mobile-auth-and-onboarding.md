---
target: mobile sign-in, verify email, division onboarding, tutorial
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:apps/mobile/app/(auth)/login.tsx + (auth)/verify-email.tsx + (onboarding)/division.tsx + (onboarding)/tutorial.tsx"
target_fingerprint: "sha256:86f5b0176d6abe356093a3e732b52456434fc9fe4117929a9fa24849c7626180"
target_path: apps/mobile/app/(auth)/login.tsx
timestamp: 2026-10-20T11-37-50Z
slug: mobile-auth-and-onboarding
---
Method: design review only (detector not applicable, native platform). Source review against the onboard playbook; no simulator or emulator available.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Pending buttons, resend cooldown, "Not verified yet" |
| 2 | Match system / real world | 3 | 3 | "I have an invite code" vs "Start a new division" |
| 3 | User control and freedom | 3 | 3 | Sign out on every pre-app screen; Skip on the tutorial |
| 4 | Consistency and standards | 2 | 3 | Status-bar style is never set, and the canvas screens have no top safe-area inset, so content scrolls under the clock |
| 5 | Error prevention | 3 | 3 | Invite code is normalized as you type |
| 6 | Recognition rather than recall | 3 | 3 | Verify screen repeats the address and the steps |
| 7 | Flexibility and efficiency | 3 | 3 | Autofill types, Next and Go keys, password reveal |
| 8 | Aesthetic and minimalist design | 3 | 3 | Calm, branded, one decision per screen |
| 9 | Error recovery | 3 | 3 | Auth errors are mapped to plain sentences with the fix |
| 10 | Help and documentation | 2 | 3 | New players never see the tutorial (see P1) |
| **Total** | | **28/40** | **30/40** | **Good** |

## Design specificity verdict

LLM assessment: specific. The tutorial's three steps are the league's actual loop (propose, score or record, confirm and climb), the join screen explains what a division is, and the verify screen is honest about which link works. The brand mark is the one place the clubhouse identity shows before sign-in, and it is used with restraint.

Deterministic scan: not applicable (native platform).

## What's working

- Password reset never reveals which addresses have accounts.
- The tutorial honors Reduce Motion (no animated paging, the title is announced instead) and can be skipped.
- Every pre-app screen offers "Not you? Sign out," so a shared device is never stuck.

## Priority issues

1. [P1] Joining or creating a division skips the tutorial. The success alert's Continue does `router.replace("/(tabs)")`, which overrides the auth gate's move to the tutorial; `tutorialDone` stays false, and nothing routes there again, so first-time players never see it. The create alert also promises the invite code is "on the Admin tab," which was false on mobile (fixed on the Admin tab in this pass). Fix: Continue goes to the tutorial unless it is done. Command: /impeccable onboard.
2. [P2] Canvas screens draw under the status bar, and the status-bar style is unset (dark icons on the green tab headers in light mode, light icons on the Paper Canvas in dark mode). Fix: dark status bar on canvas screens, light under the green headers and on the tutorial; respect the top inset on the scroll content. Command: /impeccable adapt.
3. [P3] Switching between Sign in and Create account changes the heading without an announcement.

## Persona red flags

Jordan (first-timer): joins with a code and lands straight on the standings with no idea how to propose a match.

Sam (screen reader): good field labels, a summary of problems announced on submit; the dots in the tutorial are one "Step 2 of 3" stop.

## After fixes

Fixed: P1 Continue respects `tutorialDone`; P2 status-bar style per surface and top safe-area padding on the canvas screens. Left: P3.

Questions skipped: autonomous worker, no question tool.
