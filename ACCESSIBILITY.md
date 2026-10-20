# Accessibility statement

Tennis League should work for everyone who plays in, runs, or contributes to a league, including people who use a screen reader, switch control, keyboard navigation, large text, or other assistive technology. This document sets out what the project aims for, where it falls short, how to report a barrier, and what contributors check before a change merges.

## Goals

The project works toward [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA on the web app and applies the same success criteria to the mobile and watch apps where they fit. The priorities, in order:

1. **Live scoring with assistive technology.** Scoring a point, undoing one, and choosing a point type work with VoiceOver and TalkBack. Score changes, the server, and moments such as break point or tiebreak are announced in words, never by color alone.
2. **Keyboard access on the web.** Every control is reachable and operable with the keyboard, with a visible focus indicator, a logical tab order, and dialogs that trap focus while open and return it when closed.
3. **Readable in sunlight.** Text meets 4.5:1 contrast, and large score numerals and controls meet 3:1.
4. **Labeled forms and announced errors.** Every field has a label, and errors are tied to their field and announced.
5. **Reduced motion.** Animations and the score-confirmed confetti stop when the system asks for reduced motion.

## Supported platforms

| Platform | Status |
| --- | --- |
| Web app, current Chrome, Edge, Firefox, and Safari | Supported |
| iPhone app (Expo), with VoiceOver | Supported |
| Android app (Expo), with TalkBack | Supported |
| Wear OS watch app, with TalkBack | Partial: scores and undo work; see the known limitations |
| Apple Watch app | Not released |

## Known limitations

These are known gaps. Each has a workaround where one exists.

- **The phone app is portrait only.** It doesn't rotate to landscape, including on a mounted device. Use the web app in a landscape browser window as an alternative.
- **Light theme only.** Both apps use a light theme and don't follow the system dark mode setting.
- **Score numerals stop growing with large text.** On the live scoreboard, the point and game numerals scale only slightly with the system text size, because they already fill the screen. All other text scales fully.
- **Undo on Wear OS is a press-and-hold.** TalkBack offers it as "double-tap and hold." You can also undo from the phone.

## Report a barrier

Report an accessibility problem in either of these ways:

- **In the app:** open **Feedback** and choose the **Accessibility** category.
- **On GitHub:** open an issue with the [accessibility template](https://github.com/nbarr1/TennisScoring/issues/new?template=accessibility.yml).

Include what you were trying to do, what happened, your device and operating system, and any assistive technology you use. A screen recording helps but isn't required.

Accessibility reports are treated as expert input, not as feature requests. The maintainers aim to acknowledge a report within five business days and to offer a workaround when a fix will take time.

## Severity and response targets

| Severity | Meaning | Target |
| --- | --- | --- |
| Critical | Blocks a core task, such as scoring a match, reporting a result, or signing in | 30 days |
| Serious | A core task is possible but hard, and a workaround exists | 60 days |
| Moderate | An inconsistent focus order, a missing or late announcement, or a confusing label | 90 days |
| Minor | A cosmetic contrast or alignment issue on a secondary screen | 90 days |

## Contributor expectations

For any change that touches the user interface:

1. Complete the accessibility items in the pull request template.
2. Follow the conventions in [`apps/web/app/shared/README.md`](./apps/web/app/shared/README.md) and [`apps/mobile/components/README.md`](./apps/mobile/components/README.md): the shared buttons, dialogs, fields, and `announce` helpers already handle focus, labels, and live regions.
3. Check web changes with the keyboard alone and with an automated checker such as [axe DevTools](https://www.deque.com/axe/devtools/).
4. Check mobile changes with VoiceOver or TalkBack at least once, and at the largest system text size.
5. Give every icon-only control an accessible name, and never use color as the only way to show state.

There's no automated accessibility check in CI yet. Adding accessibility linting for the web app is the next step, and this section will say so when it runs on pull requests.

## Ownership

Nicholas Barr and the project maintainers own accessibility for this project and review this statement at each minor release.
