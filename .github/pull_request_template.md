## Summary
- What changed?
- Why did it change?

## Validation
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm --filter @tennis/shared test -- --runInBand` (if shared logic changed)
- [ ] `pnpm check:firebase-rules` (if Firebase rules changed)
- [ ] `pnpm --filter @tennis/firebase-functions test:rules` (if Firebase rules/functions changed)
- [ ] `pnpm --filter @tennis/firebase-functions build:targeted-deploy` (if targeted Functions deploy changed)

## Release impact
- [ ] No version, environment, deploy, or operator documentation changes are needed.
- [ ] Documentation was updated for any changed commands, env vars, release gates, data contracts, or deploy paths.

## Risk and rollback
- Risk level: Low / Medium / High
- Rollback plan:
