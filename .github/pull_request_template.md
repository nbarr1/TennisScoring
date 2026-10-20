## Summary
- What changed?
- Why did it change?

## Validation
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @tennis/shared test` (if shared touched)
- [ ] `pnpm --filter @tennis/firebase-functions test:rules` (if Firebase rules/functions touched)

## Risk and Rollback
- Risk level: Low / Medium / High
- Rollback plan:

## Accessibility (UI changes only)
- [ ] Not a UI change
- [ ] Web: every new control works with the keyboard alone and shows a visible focus ring
- [ ] New fields have labels, and errors are announced
- [ ] State isn't shown by color alone
- [ ] Animations respect reduced motion
- [ ] Checked once with VoiceOver, TalkBack, or a desktop screen reader
- [ ] Checked with an automated checker such as axe DevTools (web)

See [ACCESSIBILITY.md](https://github.com/nbarr1/TennisScoring/blob/Main/ACCESSIBILITY.md) for the project's goals.
