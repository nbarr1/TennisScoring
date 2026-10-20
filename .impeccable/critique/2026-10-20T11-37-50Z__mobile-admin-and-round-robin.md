---
target: mobile Admin tab and round-robin scheduler
total_score: 23
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
target_identity: "file:apps/mobile/app/(tabs)/admin.tsx + apps/mobile/app/round-robin-scheduler.tsx"
target_fingerprint: "sha256:33a78c2ceb64de8ed6f81114ae081fa311ba2e82772047cea72179eeb544d53c"
target_path: apps/mobile/app/(tabs)/admin.tsx
timestamp: 2026-10-20T11-37-50Z
slug: mobile-admin-and-round-robin
---
Method: design review only (detector not applicable, native platform). Source review; no simulator or emulator available. PR #386's behavior (players rostered only in another season are left out, with the one-line note) was reviewed and kept.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | Every action has pending, success, and error states; the link-matches candidate load is silent |
| 2 | Match system / real world | 3 | 3 | League terms are right: division level, season, placeholder, leader |
| 3 | User control and freedom | 2 | 3 | "Add or update a level" can never update: every save creates another level |
| 4 | Consistency and standards | 2 | 3 | Onboarding says the invite code is "on the Admin tab"; the mobile Admin tab never shows it |
| 5 | Error prevention | 1 | 3 | Saving "Beginner Singles" twice makes two levels; the scheduler accepts 2026-02-30 and silently schedules round 1 on March 2 |
| 6 | Recognition rather than recall | 2 | 3 | Link-matches candidates show only names (no date or score); the schedule preview shows no round dates |
| 7 | Flexibility and efficiency | 2 | 2 | No level assignment on mobile (sends the leader to the web roster) |
| 8 | Aesthetic and minimalist design | 3 | 3 | "Needs your attention" first is the right order |
| 9 | Error recovery | 2 | 3 | A bad start date is reported on a field far above the Publish button and not announced on iOS |
| 10 | Help and documentation | 3 | 3 | Clear hints on every tool |
| **Total** | | **23/40** | **29/40** | **Acceptable → Good** |

## Design specificity verdict

LLM assessment: specific. The page is ordered by what needs a volunteer leader (disputes, reports, unassigned players), the scheduler's confirm dialog spells out level, season, start date, and interval, and the "Replace the previously published schedule" switch explains exactly which matches survive. The gaps are correctness gaps rather than generic UI: the level editor's promise to "update," the start date parser, and the missing invite code.

Deterministic scan: not applicable (native platform).

## What's working

- Every leader action uses `useAsyncAction`: one submit at a time, pending labels, an inline error with Try again, and an announced success.
- Destructive operations ask first with verb labels ("Remove message", "Replace and publish").
- The scheduler blocks doubles levels before the leader builds a preview they could never publish.

## Priority issues

1. [P1] The invite code is nowhere on mobile. After creating a division the alert says "You can find it again on the Admin tab," and a leader on a phone has no other way to invite players. Fix: an "Invite players" card on the Admin tab with the code and a native Share action (React Native `Share`, no new dependency). Command: /impeccable harden.
2. [P1] The level editor duplicates levels. `upsertDivisionLevel` creates a new document when no `levelId` is passed, which the mobile editor never does, so "Add or update a level" only ever adds. Fix: tapping an existing level loads it into the editor and the save passes its id (button reads "Save changes"); typing the name of an existing level in this season updates that level instead of adding a twin. Command: /impeccable harden.
3. [P1] Impossible start dates are accepted. `Date.parse("2026-02-30T18:00:00")` rolls over to March 2, so the "That isn't a real date" branch never runs and a whole season is scheduled from the wrong day. Fix: round-trip the parsed date and reject a mismatch; warn when the date is in the past. Command: /impeccable harden.
4. [P1] Publish with a missing or bad date fails out of sight. The error sits on the date field two cards above the Publish button, and FormField only announces errors on iOS while focused, so a VoiceOver user hears nothing. Fix: announce the error, show it beside the Publish button too, and focus the field. Command: /impeccable harden.
5. [P2] Linking recorded matches by name alone. Two "Ann vs Guest" results are indistinguishable. Fix: show the completed date and score on each candidate; handle a failed candidate load with an inline error and Try again. Command: /impeccable clarify.
6. [P2] The preview lists pairings but not when each round is. Fix: label rounds with their dates once a valid start date is entered. Command: /impeccable clarify.
7. [P2] Level assignment is web-only. Left as a recommendation (it would add a new write path on mobile; the web roster already does it).

## Persona red flags

Dana (volunteer leader on a phone): can create a division but cannot find the code to invite anyone; saving a level twice clutters every level picker in the app; a typo in the start date schedules the season on the wrong week.

Sam (screen reader): checkbox and radio rows are correctly labelled with state; the publish date error is silent.

Casey (one-handed): long single scroll, but every control is at least the platform minimum.

## Minor observations

- The screen reads Firestore directly (`onSnapshot`, `getDocs`) instead of through firebase-client hooks; that is outside a UI pass and was left.
- Player selection in the scheduler resets whenever the memberships snapshot changes.

## After fixes

Fixed: P1 invite code card with Share; P1 level editor edits existing levels (tap to edit, name match updates, keeps sort order); P1 date round-trip validation and past-date warning; P1 publish date error announced, repeated beside Publish, and the field focused; P2 candidate matches show date and score, failed loads show an error with Try again; P2 preview rounds show dates. Left: P2 level assignment on mobile (feature work).

Questions skipped: autonomous worker, no question tool.
