# Quality Gates Plan

## Accessibility Automation (Action 6)
- Add `@axe-core/playwright` and Playwright-based accessibility regression checks for login, dashboard, matches, and profile flows.
- Add CI job that runs these checks on every PR.
- Add manual screen-reader checklist (VoiceOver/NVDA) with keyboard-only traversal validation.

## End-to-End Coverage (Action 9)
- Add Playwright end-to-end suite for auth, match lifecycle, messaging, and feedback submission.
- Gate merges on these end-to-end checks for web.
- Add mobile E2E plan using Detox for onboarding, login, and match flows.

## Performance Budget (Action 10)
- Define budget: JS bundle per route, image payload, and font payload ceilings.
- Add Lighthouse CI checks for LCP/INP/CLS thresholds.
- Fail PR builds on budget regressions.

> Status: Requires additional framework setup and credentials that are not present in this repository snapshot.
