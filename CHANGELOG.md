# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-18

### Added
- Initial release as `@akito.sakuraba/notify-mcp` on npm.
- Cross-platform desktop notification MCP server (macOS / Windows / Linux).
- Three MCP tools: `notify`, `list_sounds`, `play_sound`.
- Per-OS notification backends:
  - macOS: `osascript` (`display notification`)
  - Windows: PowerShell + WinRT `ToastNotificationManager`
  - Linux: `notify-send` (libnotify)
- Per-OS sound playback:
  - macOS: `afplay`
  - Windows: `System.Media.SoundPlayer` / `SystemSounds`
  - Linux: `paplay` → `aplay` fallback / `canberra-gtk-play`
- Built-in installer CLI for five MCP clients:
  `notify-mcp install <claude-code | claude-desktop | cursor | codex | antigravity>`,
  with `--all`, `--dry-run`, `--name`, `--no-backup`, plus `uninstall` and
  `list-clients` subcommands.
- TOML support for OpenAI Codex CLI (`~/.codex/config.toml`).
- Bilingual documentation (`README.md` English + `README.ja.md` 日本語).
- 64 unit tests via vitest covering sanitization, sound dispatcher,
  notifier shape, server registration, CLI argv, and installer JSON/TOML merge.
- Smoke runner (`scripts/smoke.mjs`) for end-to-end verification on the
  current host.

### Security
- All subprocesses spawned via `execFile` / `spawn` — no shell interpretation.
- Untrusted title / message / file path values are passed through environment
  variables on Windows (`$env:NOTIFY_TITLE`, `$env:NOTIFY_MESSAGE`,
  `$env:NOTIFY_SOUND_PATH`); PowerShell script bodies are fixed literals.
- AppleScript values are escaped per AppleScript string-literal rules.
- WinRT toast XML payloads are XML-escaped.
- Control characters (except TAB / LF / CR) are stripped from titles and
  messages.
- Length caps: title 256, message 4096, sound spec 1024.
- Sound file: absolute path required, regular file required, ≤ 10 MB.
- Subprocess timeouts: notify 5 s / sound 10 s.
- Installer always backs up existing client configs to
  `<path>.bak-YYYYMMDD-HHmmss` before writing.

[Unreleased]: https://github.com/AkitoSakurabaCreator/notify-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AkitoSakurabaCreator/notify-mcp/releases/tag/v0.1.0
