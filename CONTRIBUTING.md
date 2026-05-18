# Contributing to notify-mcp

Thanks for taking the time to contribute. This project aims to stay small, safe,
and cross-platform.

## Quick start

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm smoke   # spawn a real notification on the current host
```

Requires Node.js >= 18.17 (Node 20 / 22 LTS recommended).

## Ways to contribute

- **Bug reports**: open an issue with reproduction steps, host OS / Node
  version, expected vs actual behavior, and any subprocess error from stderr.
- **Feature ideas**: open an issue first so we can scope it. Small surface
  area is a design goal.
- **Pull requests**: see "PR checklist" below.

## PR checklist

Before opening a PR:

- [ ] `pnpm format:check` passes (run `pnpm format` to auto-fix).
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes (all existing + new tests for your change).
- [ ] `pnpm audit --prod` reports no new production vulnerabilities.
- [ ] If you touched the notifier / sound / installer, run `pnpm smoke`
      on at least one host OS and paste the output in the PR.
- [ ] Update `CHANGELOG.md` under `[Unreleased]` with a short note.
- [ ] Keep dependencies minimal — discuss before adding a new runtime dep.

## Code style

- TypeScript strict (`noImplicitAny`, `noUnusedLocals`,
  `noUncheckedIndexedAccess`, etc).
- Prettier (`.prettierrc`): 2-space indent, double quotes, trailing commas, 100 cols.
- No emojis in code unless explicitly required.

## Security-first contributions

This server runs OS subprocesses with user-supplied strings. Any change that
touches `src/notifier.ts`, `src/sound.ts`, or `src/sanitize.ts` MUST:

- Use `execFile` / `spawn` (never `exec` or shell strings).
- Pass untrusted values via env vars on Windows, not script interpolation.
- Escape AppleScript / XML where applicable.
- Validate / sanitize inputs before reaching the OS layer.
- Add a test in the matching `test/*.test.ts`.

If you find a security issue, please **do not** open a public issue. See
[SECURITY.md] if present, otherwise email the maintainer (`Akito Sakuraba`,
via the GitHub profile).

## Releases

Releases are cut from `main`. The maintainer runs:

```sh
pnpm version <patch | minor | major>
git push --follow-tags
npm publish --access public
```

GitHub Actions verifies typecheck + test + build on Ubuntu / macOS / Windows
with Node 20 / 22 on every push.
