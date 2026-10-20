---
target: web profile page
total_score: 25
max_score: 40
after_score: 30
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:apps/web/app/profile/page.tsx"
target_fingerprint: "sha256:2f13dd94847ea4fde67f3162dff8f7e3e5d8ff5a7c2b4776186a2b66476a6d56"
target_path: apps/web/app/profile/page.tsx
timestamp: 2026-10-20T11-38-51Z
slug: apps-web-app-profile-page-tsx
---
⚠️ DEGRADED: single-context (this worker has no sub-agent tool; Assessment A was written before the detector output was read). Browser overlay skipped: no Firebase env, and /profile is behind sign-in.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | "You have unsaved changes" and "Saved at 2:14 PM" are good; the save failure below explains nothing |
| 2 | Match system / real world | 3 | 3 | Plain labels and hints ("Shown to other players on matches, standings, and messages") |
| 3 | User control and freedom | 2 | 3 | Unsaved edits are overwritten whenever the user document changes (a ranking recalculation writes to it); leaving the page with unsaved edits gives no warning |
| 4 | Consistency and standards | 3 | 3 | Shared Field, InlineAlert, Dialog, tokens |
| 5 | Error prevention | 1 | 3 | Save throws for every player with no phone number (and no contact email or division), and the form offers contact-email and active-division edits that the security rules refuse for players |
| 6 | Recognition rather than recall | 3 | 3 | The sign-in email is shown next to the contact email |
| 7 | Flexibility and efficiency | 3 | 3 | One save for the whole form, sticky save bar |
| 8 | Aesthetic and minimalist design | 3 | 3 | Calm sectioned cards; the danger zone is clearly set apart |
| 9 | Error recovery | 1 | 3 | The failure shows the SDK's own text ("Function WriteBatch.update() called with invalid data. Unsupported field value: undefined…") or "You don't have permission to do that.", with no way forward |
| 10 | Help and documentation | 3 | 3 | Hints answer the real questions (what the contact email changes, what the play times are for) |
| **Total** | | **25/40** | **30/40** | **Acceptable → Good** |

## Design specificity verdict

LLM assessment: mostly specific. Preferred play times ("Opponents see these when they propose a match"), contact preferences tied to the chat contact card, and a deletion dialog that spells out that past results stay so other players' standings stay accurate are all this league's rules, not a generic settings page. The structure (stacked cards, one save) is generic, which suits an operate page.

Deterministic scan: `impeccable detect --json` over apps/web/app/profile returned 0 findings (exit 0). The detector does not see data writes; the blocking save failure was found by reading the write path and confirmed by running the Firestore SDK's `WriteBatch.update` with an `undefined` field, which throws.

Visual overlays: none. Browser injection was not attempted.

## Overall impression

Well written and well built on the surface, and for most players it cannot save. The single biggest fix is the write itself.

## What's working

- The delete-account dialog: consequences listed, password re-entry, failed-precondition mapped to "transfer leadership first", and focus starts in the password field.
- Play-time slots focus the new slot's day select when added and announce removals.
- The unsaved/saved status line is a live region next to the button.

## Priority issues

1. [P0] Save fails for anyone without a phone number. `buildUserProfileUpdates` turns an empty phone, contact email, or division into `undefined`, and `WriteBatch.update` rejects any `undefined` field, so the whole save (play times included) throws. Phone is optional, so most players hit this. Fix: before writing, drop undefined fields, and send a field delete when the player cleared a phone number they had. Command: /impeccable harden. Also needs a shared-package fix so mobile gets it (reported).
2. [P1] The form offers edits the rules refuse. Players may not change `email` or `divisionId` on their own user document (`editableUserFields()` and the `divisionId ==` check in firestore.rules), so changing the contact email or the active division fails the whole save with "You don't have permission to do that." Fix: for players, show both as read-only with an honest hint, keep them editable for admins (whom the rules allow), and never send an unchanged email that differs only in case. Needs a backend change if players should edit them (reported). Command: /impeccable harden, then /impeccable clarify.
3. [P1] Edits are wiped by background writes. The form re-seeds from every `users/{uid}` snapshot, and Cloud Functions write `rankingSummary` there on every confirmed result in the division, so a player halfway through adding play times can lose them. Fix: re-seed only while the form has no unsaved edits, and warn before leaving the page with unsaved edits. Command: /impeccable harden.
4. [P2] Save errors are not actionable. Fix: map the permission and invalid-data failures to sentences that say what to change. Command: /impeccable clarify.

## Persona red flags

Casey (one-handed phone): adds two play times, taps Save, gets a red box quoting the SDK.

Sam (keyboard, screen reader): fields, hints, and errors are linked; the save error is announced but says nothing useful.

Jordan (first-timer): arrives from an accepted invite ("Your profile opens next"), fills in play times, and cannot save; tries "No division" in the division select and gets a permission error.

Dana (volunteer leader who plays): switches the active division to the one they lead and is refused with no explanation.

## Minor observations

- Choosing "No division" when a division is set cannot save (the rules refuse a change to `divisionId`).
- The blocked-players list loads profiles one by one; fine at the 500-entry cap.

## After fixes

Fixed: the P0, both P1s, and the P2. Commit 02a9cfd.

- `writableProfileUpdates()` sits between `buildUserProfileUpdates()` and `updateUserProfile()`: undefined fields are dropped, a phone number the player cleared becomes `deleteField()`, and `email`/`divisionId` are sent only for app administrators (whom the rules allow) and only when changed. Nothing new is written: every field sent was already in the payload; what changed is that the write no longer throws or gets refused.
- For players, Contact email and Active division are read-only, with hints that say who can change them (an app administrator). Admins keep the editable fields, and "No division" is offered only while none is set, since saving cannot clear a division.
- The form re-seeds from a user snapshot only while it has no unsaved edits (or once the snapshot matches what was typed), and a `beforeunload` prompt guards unsaved edits.
- Save errors now only come from real failures, which `describeError` already words with a recovery.

Still open (needs backend change, reported): players cannot make another of their divisions the active one, on web or mobile, because `firestore.rules` pins `divisionId` on self-updates; and contact email is not self-editable. The mobile profile sends the same undefined fields through the same builder, so the P0 almost certainly exists there too; the right fix is in `buildUserProfileUpdates()` (packages/shared), which this worker may not edit.

Heuristics that moved: 3 (2→3), 5 (1→3), 9 (1→3). Remaining P0: 0. Remaining P1: 0 in the UI; the division-switch gap is now an explained limitation (P2, backend).
