# Contributing

First off, thank you for considering contributing to this project! It's people like you that make open-source software such a great community. 

## How to Contribute

### Reporting Bugs
If you find a bug, please open a GitHub issue. The repository has no bug report template, so include as much detail as possible:
* Operating system and version
* Steps to reproduce the behavior
* Expected behavior vs. actual behavior
* Screenshots or logs if applicable

### Reporting Accessibility Barriers
If something is hard or impossible to use with a disability or assistive technology, use the Accessibility issue template, or choose **Accessibility** in the app's Feedback form. See [ACCESSIBILITY.md](./ACCESSIBILITY.md) for the project's goals, known limitations, and response targets.

### Suggesting Enhancements
Feature requests are always welcome. Please open a GitHub issue and clearly describe:
* The problem you are trying to solve
* Your proposed solution
* Any alternative solutions you've considered

### Pull Requests
1. Fork the repository and create your branch from `Main`, the default branch.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the checks in the pull request template pass (`pnpm lint`, `pnpm typecheck`, and the tests for the packages you touched).
5. Make sure your code adheres to the existing formatting and linting rules.
6. Never put secrets or credentials in a pull request. To report a security problem, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
7. For user interface changes, complete the accessibility checklist in the pull request template.
8. Issue that pull request!

## Development Setup
1. Clone the repository locally.
2. Install Node.js 22 (the version in `.nvmrc`) and pnpm 9.15.5 or newer, then run `pnpm install` from the repository root. This is a pnpm workspace, so don't use `npm install` or `yarn`.
3. Configure environment variables as described in [SETUP.md](./SETUP.md), using `.env.example` and `apps/mobile/.env.example` as references.
4. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` to confirm a working baseline.
