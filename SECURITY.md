# Security policy

TennisScoring is a tennis league app with a Next.js web app, an Expo React Native mobile app, Wear OS and Apple Watch companions, and a Firebase backend (Firestore, Cloud Storage, Cloud Functions, and Firebase Authentication). This policy explains how to report a security problem in any of those parts and what happens after you do.

## Supported versions

Security fixes go into the default branch (`Main`) and ship in the next release. Older releases don't receive backported fixes.

| Version | Supported |
| ------- | --------- |
| 1.2.x   | Yes       |
| < 1.2   | No        |

## Reporting a vulnerability

Don't open a public issue, pull request, or discussion for a security problem, and don't use the in-app feedback form, because feedback is filed as a public GitHub issue.

To report a vulnerability, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Fill in the advisory form.

For more information, see [Privately reporting a security vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).

A useful report includes the following details:

- The affected component, such as a Firestore or Storage rule, a Cloud Function, a web route, the mobile app, or a watch app.
- The file and line, or the URL or screen, where the problem occurs.
- The steps to reproduce it, including the account role involved (player, division leader, or admin).
- What an attacker could do with it, such as read another user's data, change match results or standings, or take over an account.

## What to expect

The maintainers aim to acknowledge a report within five business days and to share an initial assessment within 14 days. These are goals, not guarantees, since the project is maintained by a small team.

After a fix is ready, the maintainers publish a GitHub security advisory that credits the reporter, unless you ask to stay anonymous. Please keep the details private until that advisory is published.

## Scope

The following areas are in scope:

- Firestore and Cloud Storage security rules (`firebase/firestore.rules`, `firebase/storage.rules`).
- Cloud Functions callables and triggers (`firebase/src/`).
- The web app, its API routes, and its session handling (`apps/web/`).
- The mobile app and the Wear OS and Apple Watch protocols (`apps/mobile/`).
- Shared logic that decides standings, report confirmation, or access (`packages/shared/`, `packages/firebase-client/`).
- The GitHub Actions workflows (`.github/workflows/`).

The following areas are out of scope:

- Vulnerabilities in third-party services and dependencies themselves, such as Firebase, Expo, or Vercel. Report those to the vendor. A dependency that this repository uses in an unsafe way is in scope.
- Findings that need a rooted or jailbroken device, or physical access to an unlocked device.
- Denial-of-service and volumetric attacks, and spam or social engineering against league members.
- Missing security headers or best-practice suggestions with no demonstrated impact.

## Testing guidelines

To test a finding, use accounts you own and a Firebase project you control. The local emulators (`cd firebase && pnpm serve`) run the same rules and functions as production. Don't access, change, or delete other users' data, and don't degrade the service for league members.
