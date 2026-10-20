---
target: web auth and onboarding (login, verify-email, invite accept, onboarding division and tutorial, root redirect)
total_score: 28
max_score: 40
after_score: 30
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:apps/web/app/login/page.tsx"
target_fingerprint: "sha256:2b62786309ec4e38481c4136b9312bd442eb44039047ae5fc722c9c53d26653c"
target_path: apps/web/app/login/page.tsx
also_covers: apps/web/app/verify-email/page.tsx, apps/web/app/invite/accept/page.tsx, apps/web/app/onboarding/division/page.tsx, apps/web/app/onboarding/tutorial/page.tsx, apps/web/app/page.tsx
timestamp: 2026-10-20T11-38-51Z
slug: apps-web-app-login-page-tsx
---
⚠️ DEGRADED: single-context (this worker has no sub-agent tool; Assessment A was written before the detector output was read). Browser overlay skipped: no Firebase env, so none of these flows can complete locally.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Every submit has a pending label; the invite page proceeds to verification even when the web session failed to start |
| 2 | Match system / real world | 3 | 3 | Plain steps ("Open the email from Tennis League… Select the verification link"); division explained in one sentence |
| 3 | User control and freedom | 2 | 3 | The onboarding division page has no way out (no nav, no sign out); the tutorial's Skip and Back on green lose their label under hover once press states work |
| 4 | Consistency and standards | 3 | 3 | One card pattern for every auth screen |
| 5 | Error prevention | 3 | 3 | Good field validation; a short invite code is sent to the server instead of being caught |
| 6 | Recognition rather than recall | 2 | 3 | "Sign in, then open this invite link again": sign-in ignores where the player came from, so an existing member has to find the invite email again |
| 7 | Flexibility and efficiency | 3 | 3 | Arrow keys in the tutorial, Skip on every step, password reveal |
| 8 | Aesthetic and minimalist design | 3 | 3 | Focused single-card screens |
| 9 | Error recovery | 3 | 3 | Auth errors name the recovery ("Sign in instead", "reset your password"); a signed-out visitor on /verify-email gets buttons that can only fail |
| 10 | Help and documentation | 3 | 3 | Hints say why ("Verifying it keeps your league account secure") |
| **Total** | | **28/40** | **30/40** | **Good → Good** |

## Design specificity verdict

LLM assessment: specific where it matters. The invite page knows the invited name and address, the create-division success shows a large Barlow Condensed invite code with copy, and the tutorial's steps describe this league's loop (score live, record past matches, confirm every result). The sign-in card itself is a standard pattern and should be.

Deterministic scan: `impeccable detect --json` over login, verify-email, invite, onboarding, and the root page returned 0 findings (exit 0).

Visual overlays: none. Browser injection was not attempted.

## Overall impression

Thoughtful, accessible auth screens with one broken hand-off: a player who already has an account loses their invite at sign-in.

## What's working

- Sign-in errors never reveal which addresses have accounts, and "email already in use" offers "Sign in instead" in place.
- Verify-email gives a numbered recovery path, a resend cooldown, and a way out for a wrong address.
- Onboarding moves focus to each step's heading, so keyboard and screen-reader users land on what changed.

## Priority issues

1. [P1] An existing member who opens an invite loses it at sign-in. The invite page says "Sign in, then open this invite link again", and the login page always goes to /dashboard. Fix: the invite page links to `/login?next=<this invite>`, and login returns there after sign-in (same-site paths only), so the member lands back on "Accept invite". Command: /impeccable harden, then /impeccable onboard.
2. [P2] Creating an account from an invite ignores a failed session start and sends the player to /verify-email, which the middleware bounces to /login with no explanation. Fix: check the response and say what happened. Command: /impeccable harden.
3. [P2] /verify-email shows working-looking buttons to a signed-out visitor. Fix: send them to sign in. Command: /impeccable harden.
4. [P2] The onboarding division page is a dead end: no nav and no sign out. Fix: a quiet "Sign out" under the options, and validate the invite code's length before calling the server. Command: /impeccable onboard.

## Persona red flags

Casey (one-handed phone): invite email, sign in, then back to the mail app to find the link again.

Sam (keyboard, screen reader): show-password toggles use aria-pressed with a stable name; field errors are linked and focused. Clean.

Jordan (first-timer): created the account with the wrong address, reaches "Join a division", and has no way to sign out to start over.

Dana (volunteer leader who plays): creates a division and gets the invite code with Copy and a clear "Continue to dashboard". Clean.

## Minor observations

- The root page redirects to /dashboard, which middleware gates; fine.
- The tutorial uses Ball Yellow for its main button on Clubhouse Green, where yellow carries text legibly; kept as an intentional exception documented in the file.

## After fixes

Fixed: the P1 and all three P2s. Commit a8555df (plus c4931cc for the tutorial's button states).

- Sign-in honours a same-site `next` path (the same guard verify-email uses), and carries it through verify-email for an unverified account. The invite page's "Sign in to accept this invite" and "Sign in and accept" links pass the invite back as `next`, so an existing member returns to Accept invite.
- Creating an account from an invite now checks the session response; if it fails, the page says the account exists and offers "Sign in and accept" instead of bouncing through verify-email.
- /verify-email sends a signed-out visitor to sign in (with the same `next`), except while its own Sign out is running.
- The onboarding division page has a footer with a Sign out and a pointer to the invite email, and the join form checks the code is 8 characters before calling the server.
- The tutorial's Skip, Back, and Get started buttons use the new `tl-btn--on-dark` state veil, so hover and press never hide their labels.

Heuristics that moved: 3 (2→3), 6 (2→3). Remaining P0: 0. Remaining P1: 0.

Also worth knowing (not in my files): `middleware.ts` redirects signed-out visitors to `/login` without a `next` parameter, so a deep link still lands on the dashboard after sign-in. Adding `?next=<path>` there would complete the hand-off now that the login page reads it.
