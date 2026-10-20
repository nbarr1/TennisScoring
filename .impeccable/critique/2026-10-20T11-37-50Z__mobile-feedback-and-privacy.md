---
target: mobile feedback form and privacy policy
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
target_identity: "file:apps/mobile/app/feedback.tsx + apps/mobile/app/privacy-policy.tsx"
target_fingerprint: "sha256:859983a1aaec66fabc1df8917f4048ef9ea5b343dc46d0f555132234f84d93c1"
target_path: apps/mobile/app/feedback.tsx
timestamp: 2026-10-20T11-37-50Z
slug: mobile-feedback-and-privacy
---
Method: design review only (detector not applicable, native platform). Source review; no simulator or emulator available.

## Design health score

| # | Heuristic | Before | After | Key issue (before) |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | A clear "Feedback sent" screen |
| 2 | Match system / real world | 2 | 3 | "Screen: /(tabs)/profile" shows a route path to players |
| 3 | User control and freedom | 3 | 3 | Done and "Send more feedback" |
| 4 | Consistency and standards | 3 | 3 | Stack header and an identical in-page title ("Send Feedback" / "Send feedback") |
| 5 | Error prevention | 3 | 3 | Category required, character count |
| 6 | Recognition rather than recall | 3 | 3 | "Sent with your message" lists exactly what is attached |
| 7 | Flexibility and efficiency | 3 | 3 | Short form |
| 8 | Aesthetic and minimalist design | 3 | 3 | The duplicated title wastes the first viewport line |
| 9 | Error recovery | 3 | 3 | Message kept on failure |
| 10 | Help and documentation | 3 | 3 | Helper says what makes a useful bug report |
| **Total** | | **29/40** | **30/40** | **Good** |

## Design specificity verdict

LLM assessment: honest and specific: the form says what is sent with the message, and the categories map to the labels the pipeline already uses. The privacy policy renders the shared copy in readable sections.

Deterministic scan: not applicable (native platform).

## Priority issues

1. [P2] Route path shown as the "Screen". Fix: show a friendly name (Profile, Matches, Standings) on the card; the submitted `screen` value is unchanged. Command: /impeccable clarify.
2. [P3] Duplicate title under the stack header. Left: removing it would also remove the subtitle's anchor; low impact.

## After fixes

Fixed: P2 friendly screen name in the "Sent with your message" card. Left: P3.

Questions skipped: autonomous worker, no question tool.
