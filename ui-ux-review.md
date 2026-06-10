# UI/UX Review

**Current stable baseline:** `1.0.1`  
**Status:** current product UX summary with historical review context  
**Last reviewed:** 2026-06-10

## Current product surfaces

### Web

The Next.js app includes routes for:

- Login.
- Dashboard.
- Match list and match detail/live scoring.
- Messages.
- Feedback.
- Profile.
- Admin.
- Invite acceptance.
- Tutorial onboarding.
- Division onboarding.

### Mobile

The Expo app includes routes for:

- Login.
- Tutorial onboarding.
- Division onboarding.
- Dashboard tab.
- Matches tab.
- Messages tab.
- Profile tab.
- Admin tab.
- Feedback.
- Match detail/live scoring.

### Wearables

Wear OS and Apple Watch companion code exists and should stay aligned with shared live-score data shapes.

## Current UX strengths

- Core tennis workflows are represented on both web and mobile.
- Division onboarding exists on both platforms.
- Feedback is available on web and mobile through the server-side feedback Function.
- Match status metadata is shared through `@tennis/shared`, supporting consistent status labels and accessibility text.
- Web navigation uses shared components for app-level navigation and status display.

## Ongoing UX standards

- Interactive controls need clear accessible names (`aria-label`, `accessibilityLabel`, or visible text).
- Touch targets should remain at least 44px/pt on web/iOS and 48dp on Android.
- Text/background contrast should satisfy WCAG AA.
- Do not communicate status by color alone; pair colors with text, icons, or labels.
- Loading, empty, error, and offline-ish states should be visible and actionable.
- Use platform-appropriate navigation conventions for web, mobile, and wearable surfaces.

## Manual UX smoke tests

Before a release, manually verify:

- Login and logout.
- Tutorial and division onboarding.
- Create/join division.
- Match proposal, response, live scoring, completion, report, dispute, and resolution.
- Messages and notification-entry paths where configured.
- Feedback submission.
- Profile update and availability editing.
- Keyboard behavior on mobile forms.
- Small-screen layout on dense match/admin/profile screens.

## Historical note

The original May 2026 UI/UX review has been condensed into this current operating summary. There are no release-blocking UX findings tracked here for the `1.0.1` stable baseline. Future UX findings should include affected route, severity, reproduction steps, accessibility impact, and validation notes.
