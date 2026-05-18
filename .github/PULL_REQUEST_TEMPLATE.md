## Summary

<!-- 1-3 sentences: what does this change and why -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation only
- [ ] Build / CI / tooling

## Verification

- [ ] `pnpm format:check` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (existing + new)
- [ ] `pnpm audit --prod` no new production vulnerabilities
- [ ] `pnpm smoke` run on at least one host OS (paste below if touched notifier / sound / installer)

```
<smoke output, if relevant>
```

## CHANGELOG

- [ ] Updated `CHANGELOG.md` under `[Unreleased]` with a short note

## Security checklist (if you touched notifier / sound / installer / sanitize)

- [ ] Subprocesses use `execFile` / `spawn` only (no `exec`, no shell strings)
- [ ] Windows: untrusted values passed via env vars, not script interpolation
- [ ] AppleScript / XML escapes applied where needed
- [ ] Inputs validated / length-capped / control-char-stripped before OS layer
- [ ] New test added in matching `test/*.test.ts`

## Related issues

<!-- closes #123, refs #456, … -->
