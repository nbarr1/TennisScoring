# Accessibility Policy & Statement

Accessibility is a core priority for **Tennisscoring**. We want everyone — including players, leaders, spectators, and developers with disabilities or using assistive technology — to be able to navigate match dashboards, log real-time tennis scores, analyze match statistics, and contribute to this repository.

This document details our accessibility commitment, contributor guardrails for court-side score tracking UI, and our issue response workflow.

---

## Accessibility Targets & Priorities

We work toward conforming with **WCAG 2.2 Level AA** standards. Key priority areas for `Tennisscoring` include:

* **Real-Time Score & Live Region Announcements**:
  * Score updates, game points, break points, and set/match completion must be announced dynamically to screen readers via ARIA live regions (`aria-live="polite"` for point additions, `aria-live="assertive"` for game/set completion)[cite: 1].
  * Server identity, tiebreak scoring states, and court side changes must expose explicit programmatic labels and state changes[cite: 1].
* **Keyboard Navigation & Court-Side Hotkeys**:
  * Every scoring action (Point Player 1, Point Player 2, Fault, Ace, Undo, Redo) must be fully reachable and operable via keyboard controls[cite: 1].
  * Focus indicators must maintain high contrast against active scoreboards and court background elements[cite: 1].
* **High Contrast & Outdoor Visibility**:
  * Interactive scoring controls and numerical displays must meet WCAG AA contrast standards (minimum 4.5:1 for text/controls, 3:1 for large score numbers) to ensure readability under direct sunlight[cite: 1].
  * Color alone must never convey server advantage or tiebreak status; numerical or graphical icon indicators must accompany color changes[cite: 1].
* **Responsive Layout & Reflow**:
  * Scoreboard and match analytics views must reflow without loss of functionality up to 200% zoom and adapt across mobile and desktop viewports[cite: 1].

---

## Contributor Expectations

Contributors adding scoring logic, UI controls, or statistics visualization to `Tennisscoring` must follow these guardrails[cite: 1]:

### Testing Protocol
* **Keyboard Audit**: Verify that all match scoring inputs can be completed using `Tab`, `Shift+Tab`, `Space`, `Enter`, and assigned hotkeys without keyboard traps[cite: 1].
* **Screen Reader Audit**: Perform a spot-check using VoiceOver, NVDA, or TalkBack to verify that point progression, game scores, and server side shifts are accurately announced[cite: 1].
* **Visual Audit**: Verify court view visibility at 200% zoom and inspect color contrast ratios using automated developer tools[cite: 1].

### CI/CD & Automated Verification
* Automated accessibility scanning (via `axe-core` or linter plugins) must run on pull requests affecting UI components[cite: 1].
* Pull requests introducing accessibility regressions or broken focus states will require fix commits prior to merge[cite: 1].

---

## Reporting Accessibility Issues

If you encounter an accessibility barrier within `Tennisscoring`, please submit an issue[cite: 1]. We treat accessibility reports as expert contributions[cite: 1].

Submit an issue using our GitHub template with the following details[cite: 1]:
* **Scoring Context**: The specific scoring view or stat panel where the barrier occurred[cite: 1].
* **Environment**: Operating system, browser, device type, and assistive technology used (e.g., VoiceOver on iOS, NVDA on Windows)[cite: 1].
* **Steps to Reproduce**: Detailed steps showing unexpected focus jumps, missing live score announcements, or visual barriers[cite: 1].

---

## Severity & Resolution Targets

After triage, accessibility issues in `Tennisscoring` are assigned a severity level and resolution target[cite: 1]:

| Severity | Impact Description | Target Resolution |
| :--- | :--- | :--- |
| **Critical** | Prevents core match scoring or match logging (e.g., keyboard or screen reader lock-out)[cite: 1] | **30 Days**[cite: 1] |
| **Serious** | Significant difficulty tracking scores or viewing stats, but manual workarounds exist[cite: 1] | **60 Days**[cite: 1] |
| **Moderate** | Inconsistent focus sequence or minor ARIA live region announcement timing[cite: 1] | **90 Days**[cite: 1] |
| **Minor** | Cosmetic low-impact contrast or alignment issue on non-critical screens[cite: 1] | **90 Days**[cite: 1] |

---

## Supported Environments

`Tennisscoring` targets functional accessibility across:
* **Mobile Platforms**: Latest 2 versions of Mobile Safari (iOS) and Chrome (Android)[cite: 1].
* **Desktop Browsers**: Latest 2 versions of Chrome, Edge, Firefox, and Safari[cite: 1].
* **Assistive Technologies**: VoiceOver, NVDA, TalkBack, and JAWS[cite: 1].

---

## Ownership & Maintenance

Accessibility governance for `Tennisscoring` is managed by Nicholas Barr and core project maintainers[cite: 1].
