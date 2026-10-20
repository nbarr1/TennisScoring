---
target: mobile Profile tab
total_score: 27
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:apps/mobile/app/(tabs)/profile.tsx"
target_fingerprint: "sha256:4a1cb859f763c0978d97c4f1ecd870b423d590f2c01c87983c22d913939260a3"
target_path: apps/mobile/app/(tabs)/profile.tsx
timestamp: 2026-10-20T11-37-50Z
slug: apps-mobile-app-tabs-profile-tsx
---
Method: design review only (detector not applicable, native platform). Source review; no simulator or emulator available.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Saved notice, pending Save, unblock progress |
| 2 | Match system / real world | 3 | 3 | Plain labels ("Share my email with players") |
| 3 | User control and freedom | 3 | 3 | Cancel restores the saved values; delete has two steps and a password |
| 4 | Consistency and standards | 2 | 2 | Switches are disabled until "Edit profile", and Save sits below five cards; both platforms apply settings when toggled |
| 5 | Error prevention | 1 | 3 | Email and active division look editable to every player, but the rules refuse either change on a self-update, so editing them fails the whole save; choosing "No division" also sends the player to the join screen without warning |
| 6 | Recognition rather than recall | 3 | 3 | Current values are shown read-only before editing |
| 7 | Flexibility and efficiency | 2 | 2 | One toggle change is Edit, scroll, toggle, scroll, Save |
| 8 | Aesthetic and minimalist design | 3 | 3 | Grouped sections, quiet hierarchy |
| 9 | Error recovery | 2 | 3 | Errors keep the draft, but a refused save says "Check your connection", which is not the cause and so cannot be fixed by retrying |
| 10 | Help and documentation | 3 | 3 | Helpers on availability format and contact sharing |
| **Total** | | **25/40** | **28/40** | **Good** |

## Design specificity verdict

LLM assessment: functional and specific enough. Preferred play times ("Opponents see these when they propose a match") and the "Deleted User" explanation are product-specific. The page shape (stacked white sections with one edit mode) is a generic settings form; that is acceptable for Operate mode.

Deterministic scan: not applicable (native platform).

## What's working

- Account deletion: a native destructive confirm that states the consequences, then a password sheet, with the leader-precondition error in plain words.
- Toggle rows are one accessible switch each, with the whole row as the target.
- Field-level validation moves focus to the first problem and lists all problems above Save.

## Priority issues

1. [P0] Saving can fail for most players. `buildUserProfileUpdates()` returns `phone: undefined` for an empty phone (most players have none), and `WriteBatch.update` throws on an undefined field. Separately, the form sends `email` and `divisionId` for everyone, but `firestore.rules` lets a non-admin's self-update touch only `editableUserFields()` and requires `divisionId` unchanged; the builder also lowercases email, so a mixed-case stored address reads as a change and the write is refused. The player sees "Check your connection", which is not the cause. Fix: drop undefined keys (done centrally in `updateUserProfile()` on the coordinator's branch), and on mobile send email and divisionId only for admins and only when changed; make both read-only for everyone else. Command: /impeccable harden.
2. [P1] "No division" is a one-way door. Saving with it selected clears the active division; the auth gate then sends the player to onboarding, which offers only "join with a code" or "create," so a player who tapped it by accident cannot get back to their division without asking a leader for the code. Fix: confirm before saving that change, naming the consequence. Command: /impeccable harden.
3. [P2] Edit mode for switches. Left: changing it to save-on-toggle changes when writes happen, which this pass avoids.
4. [P3] The name heading overrides the type scale with `fontSize: 22`.

## Persona red flags

Jordan (first-timer): might pick "No division" thinking it hides the division chip, and lands on a join screen.

Sam (screen reader): the edit banner announces itself; day chips are radios with checked state; time fields say "24-hour".

## After fixes

Fixed: P0 save. Email and divisionId are sent only for admins and only when they differ from the stored values. For other players the email field is disabled with "This is your sign-in email. A league admin can change it.", and the active division shows read-only in edit mode with "To play in another division, join it with its invite code." The undefined-phone half is fixed in `packages/firebase-client` by the coordinator; this worktree does not carry that change, so here a player with no phone still fails until it merges. Fixed: P1 confirm before saving "No division" (now admins only, since no one else can change the division). Left: P2 edit mode, P3 heading size.

Questions skipped: autonomous worker, no question tool.
