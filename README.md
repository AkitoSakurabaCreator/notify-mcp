# notify-mcp

> 🇯🇵 **日本語の README は [README.ja.md](./README.ja.md) にあります。**

Cross-platform desktop notification MCP server. One install, three OSes, five clients.

`notify-mcp` is a small [Model Context Protocol](https://modelcontextprotocol.io) server that exposes three tools — `notify`, `list_sounds`, `play_sound` — so any MCP client (Claude Code, Claude Desktop, Cursor, OpenAI Codex CLI, Google Antigravity, …) can pop a desktop notification on **macOS**, **Windows**, or **Linux** without per-host hook configuration.

- Single npm package, runs over MCP stdio.
- No native dependencies. Pure Node, uses each OS's built-in notifier:
  - **macOS** → `osascript` (`display notification`)
  - **Windows** → PowerShell + WinRT `ToastNotificationManager`
  - **Linux** → `notify-send` (libnotify)
- Sound support: built-in OS system sounds, or any absolute `.wav` / `.aiff` path.
- **Built-in installer** (`notify-mcp install <client>`) writes the right config block into each client — no more hand-editing JSON / TOML on every machine.
- Security-conscious: argv-only subprocess invocation, env-var passthrough for untrusted strings, input sanitization, length caps, file-size cap.

---

## Install

The package is intended to be run via `npx` so users do not have to install it globally.

```sh
# one-shot (recommended)
npx -y notify-mcp

# or install globally
pnpm add -g notify-mcp
npm  i  -g notify-mcp
```

## One-command client setup

Instead of hand-editing each client's config, use the bundled installer:

```sh
# Install into a specific client (creates the config if missing, merges if existing).
npx notify-mcp install claude-code
npx notify-mcp install claude-desktop
npx notify-mcp install cursor
npx notify-mcp install codex
npx notify-mcp install antigravity

# Install into every supported client at once.
npx notify-mcp install --all

# Preview without writing.
npx notify-mcp install --all --dry-run

# Use a different server key inside mcpServers / mcp_servers.
npx notify-mcp install cursor --name desktop-notify

# Show every config path the installer would touch, and whether it exists.
npx notify-mcp list-clients

# Remove the entry later.
npx notify-mcp uninstall claude-code
```

The installer:

1. Reads the existing config (JSON for Claude Code / Claude Desktop / Cursor / Antigravity, TOML for Codex).
2. Backs it up to `<path>.bak-YYYYMMDD-HHmmss` before overwriting.
3. Merges (or creates) the `notify` entry under `mcpServers` (or `mcp_servers` for Codex).
4. Leaves every other field of your config untouched.

If a config file is malformed, the installer still writes a backup, then rewrites a clean file containing your `notify` entry.

### Where each client stores its config

| Client | Path | Format |
|---|---|---|
| Claude Code (CLI) | `~/.claude.json` | JSON |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` | JSON |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` | JSON |
| Claude Desktop (Linux, unofficial) | `~/.config/Claude/claude_desktop_config.json` | JSON |
| Cursor | `~/.cursor/mcp.json` | JSON |
| OpenAI Codex CLI | `~/.codex/config.toml` (table `[mcp_servers.<name>]`) | TOML |
| Google Antigravity | `~/.gemini/antigravity/mcp_config.json` | JSON |

If you prefer to edit by hand, all five clients accept the same shape:

```jsonc
// JSON clients (claude-code, claude-desktop, cursor, antigravity)
{
  "mcpServers": {
    "notify": {
      "command": "npx",
      "args": ["-y", "notify-mcp"]
    }
  }
}
```

```toml
# OpenAI Codex CLI (~/.codex/config.toml)
[mcp_servers.notify]
command = "npx"
args = ["-y", "notify-mcp"]
```

After editing, restart the client. The tools `notify`, `list_sounds`, and `play_sound` will appear.

---

## Tools

### `notify`

Send a desktop notification.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string (1–256) | yes | Notification title shown to the user. |
| `message` | string (1–4096) | yes | Notification body. |
| `urgency` | `"low" \| "normal" \| "critical"` | no | Linux `notify-send` only. Ignored elsewhere. |
| `sound` | string (1–1024) | no | `"system:NAME"` (see `list_sounds`) or an **absolute** file path. |

Returns:

```json
{
  "delivered": true,
  "platform": "darwin",
  "method": "osascript",
  "sound": { "played": true, "method": "afplay" }
}
```

### `list_sounds`

Return the platform's built-in system-sound names. Example output on macOS:

```json
{
  "platform": "darwin",
  "sounds": ["Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero",
             "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink"]
}
```

- Windows: `Beep, Asterisk, Exclamation, Hand, Question`
- Linux: a small libcanberra set (`bell, message, complete, alarm, dialog-warning`)

### `play_sound`

Play a sound **without** sending a notification.

| Field | Type | Required |
|---|---|---|
| `sound` | string (1–1024): `"system:NAME"` or absolute path | yes |

## Custom sound files

Absolute paths only. The file must exist, be a regular file, and be ≤ 10 MB. macOS uses `afplay`, Windows uses `System.Media.SoundPlayer`, Linux tries `paplay` then `aplay`.

---

## Security

- All subprocesses are spawned with `execFile` / `spawn` — **no shell**, so argv values are never interpreted by `/bin/sh` / `cmd.exe`.
- Windows PowerShell scripts are fixed-literal strings. Untrusted values are passed through **environment variables**, not interpolated.
- macOS AppleScript values are escaped per AppleScript string-literal rules (`\` → `\\`, `"` → `\"`).
- Windows WinRT toast XML is escaped per XML rules (`& < > " '`).
- Control characters (except TAB / LF / CR) are stripped from `title` and `message`.
- Length caps: title 256, message 4096, sound spec 1024.
- Sound file: absolute path required, size capped at 10 MB.
- Notification subprocess timeout: 5 s. Sound subprocess timeout: 10 s.
- The installer backs up every existing config before overwriting it.

## Platform-specific notes

### macOS

- First-time `display notification` triggers a one-time permission grant for "Script Editor". After that, banners just work.
- Sound files: `.aiff`, `.wav`, `.mp3`, etc. — anything `afplay` accepts.

### Windows

- Requires PowerShell 5.1+ (ships with Windows 10/11). No third-party PowerShell module needed.
- Toast notifications appear in the Action Center.
- Some Windows policies suppress toast for non-AppUserModelID processes; using `npx -y notify-mcp` is the simplest robust default.

### Linux (Ubuntu / etc.)

- Requires `libnotify-bin` (provides `notify-send`). Install: `sudo apt install libnotify-bin`.
- For built-in system sounds: `libcanberra-gtk-module` / `canberra-gtk-play`.
- For file sounds: `pulseaudio-utils` (`paplay`) or `alsa-utils` (`aplay`).

---

## Development

```sh
pnpm install
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (64 cases)
pnpm build        # tsc → dist/
pnpm smoke        # spawn dist/index.js and run a real notification flow
```

### Repository layout

```
src/
  index.ts       # bin entrypoint (CLI + stdio transport)
  cli.ts         # argv parser, install/uninstall/list-clients/help/version
  install.ts     # client registry, JSON+TOML merge, backups
  server.ts      # MCP server + tool registrations
  notifier.ts    # cross-platform notification dispatcher
  sound.ts       # cross-platform sound player
  sanitize.ts    # input sanitization + per-platform escapes
  platform.ts    # OS detection
  errors.ts      # typed error helpers
test/
  *.test.ts      # vitest specs (sanitize / sound / notifier / server / cli / install)
scripts/
  smoke.mjs      # end-to-end smoke runner
```

## License

MIT — see [LICENSE](./LICENSE).
