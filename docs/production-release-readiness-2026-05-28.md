# Production Release Readiness Plan (2026-05-28)

This document defines the **next realistic execution step** to move TennisScoring from validated baseline to production distribution across:

- Web (production release + distribution)
- Mobile (Android/iOS via Expo/EAS)
- Wearables (Wear OS and Apple Watch companion delivery)
- Feedback-driven post-release patch loop

It also records the documentation updates required so repository materials stay aligned with the current release state.

---

## Scope and release intent

Target release posture:

1. Latest mobile and watch builds are generated from the current mainline commit and signed with production credentials.
2. Android mobile app is published to Google Play production (or staged through closed/open testing with a go-live date).
3. Web application is production-ready (quality/security gates passed), deployed, and accessible to users.
4. Feedback intake is active and triaged so fast bugfix/patch cadence can follow release.
5. Repository markdown docs clearly reflect the release process, current status, and ownership.

---

## Pre-release gate checklist (must pass)

Run from repository root:

```bash
pnpm install
pnpm --filter @tennis/shared test -- --runInBand
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Operational verification before release:

- Firebase project, rules, indexes, and functions deployment permissions validated.
- Required Secrets/Variables present for CI workflows (web deploy, Firebase deploy, EAS build).
- Feedback Function (`submitFeedback`) verified in production-like environment.
- Web auth/session flow validated end-to-end.
- Mobile sign-in, division onboarding, match score workflow, and feedback submission sanity tested.
- Watch companion install + launch sanity tested on target devices/emulators.

---

## Mobile + watch distribution plan

### Android app (Google Play)

1. Build signed production Android artifact from the latest commit using EAS.
2. Upload artifact to Google Play Console.
3. Complete Play listing requirements (privacy policy, screenshots, content rating, data safety, support/contact details).
4. Roll out via preferred track:
   - Closed testing (recommended first if production confidence needs validation), then
   - Production rollout (staged percentage ramp if desired).
5. Monitor Android vitals/crash reports after rollout and prioritize hotfixes.

### iOS + Apple Watch companion

1. Build signed iOS artifact with companion configuration.
2. Upload and submit through App Store Connect/TestFlight.
3. Validate Watch companion install pairing and key interaction flows.
4. Promote to production when acceptance criteria are met.

---

## Web production release + distribution plan

1. Produce clean production build and pass all quality gates.
2. Deploy Next.js web app to production target.
3. Validate post-deploy smoke checks:
   - Auth sign in/sign out
   - Division onboarding path
   - Match lifecycle + scoring pages
   - Feedback submission flow
4. Confirm monitoring/alerting, error logging, and uptime checks are active.
5. Announce release to users with clear “how to report issues” guidance.

---

## Feedback-driven patch cycle (post-release)

- Use in-app feedback + issue triage queue as primary input for defects and UX friction.
- Classify incoming items by severity:
  - P0: service down/security/data integrity
  - P1: critical workflow blocker
  - P2: high-friction non-blocking bug
  - P3: enhancement / polish
- Patch policy:
  - Hotfix branch for P0/P1 with accelerated validation.
  - Normal patch train for P2/P3.
- Maintain changelog entries for every patch release.

---

## Documentation alignment checklist

Update these files as release state changes:

- `README.md`: current release status + distribution links once live.
- `CHANGELOG.md`: release notes per version.
- `SETUP.md`: any build/deploy variable updates.
- `firebase/DEPLOYMENT.md`: deployment process/IAM changes.
- Point-in-time audit docs in `docs/` when significant release gating decisions are made.

Definition of done for documentation:

- No stale version labels.
- No stale deployment instructions.
- Release state (planned, in-progress, live) is explicit and date-stamped.
- Cross-file references remain consistent.

---

## Execution ownership template

- Release manager: _TBD_
- Mobile release owner: _TBD_
- Web release owner: _TBD_
- Firebase/backend owner: _TBD_
- Post-release triage owner: _TBD_

Track the completion date per stream and keep this document updated until release is complete.
