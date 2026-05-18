# notify-mcp

> 🇬🇧 **English README is at [README.md](./README.md).**

クロスプラットフォーム対応のデスクトップ通知 MCP サーバ。1 つのパッケージで 3 OS × 5 クライアントをカバー。

`notify-mcp` は [Model Context Protocol](https://modelcontextprotocol.io) に準拠した小さなサーバで、3 つの tool（`notify` / `list_sounds` / `play_sound`）を公開します。これにより Claude Code / Claude Desktop / Cursor / OpenAI Codex CLI / Google Antigravity などの MCP クライアントから、**macOS / Windows / Linux** のいずれでも統一 API でデスクトップ通知を発火できます。PC ごとに hooks を設定し直す必要はもうありません。

- 単一の npm パッケージ。MCP stdio 経由で起動。
- ネイティブ依存ゼロ。Pure Node + 各 OS 標準コマンドのみ:
  - **macOS** → `osascript`（`display notification`）
  - **Windows** → PowerShell + WinRT `ToastNotificationManager`
  - **Linux** → `notify-send`（libnotify）
- 通知音: 各 OS の組み込みシステム音 / 任意の `.wav` / `.aiff` 等（絶対パス）に対応。
- **インストーラ内蔵**: `notify-mcp install <client>` で各クライアントの config に正しく書き込みます。手作業で JSON / TOML を編集する必要はありません。
- セキュリティ重視: shell を経由しない subprocess 起動、信頼できない値は環境変数経由、長さ制限・制御文字除去・ファイルサイズ上限・タイムアウトを全て実装。

---

## インストール

`npx` 経由での実行を推奨します（グローバルインストール不要）。

```sh
# その都度実行（推奨）
npx -y notify-mcp

# グローバルにインストールしたい場合
pnpm add -g notify-mcp
npm  i  -g notify-mcp
```

## ワンコマンドでクライアントに追加

各クライアントの config を手で書く代わりに、内蔵インストーラを使えます。

```sh
# 特定クライアントに追加（config が無ければ新規作成、あればマージ）
npx notify-mcp install claude-code
npx notify-mcp install claude-desktop
npx notify-mcp install cursor
npx notify-mcp install codex
npx notify-mcp install antigravity

# サポートしている全クライアントに一括追加
npx notify-mcp install --all

# 実際に書き込まずプレビューだけ確認
npx notify-mcp install --all --dry-run

# mcpServers / mcp_servers 配下の key 名を変えたい場合
npx notify-mcp install cursor --name desktop-notify

# 各クライアントの config パスと存在状況を一覧
npx notify-mcp list-clients

# 後から外したいとき
npx notify-mcp uninstall claude-code
```

インストーラの動作:

1. 既存 config を読み込む（Claude Code / Claude Desktop / Cursor / Antigravity は JSON、Codex は TOML）
2. 上書き前に `<path>.bak-YYYYMMDD-HHmmss` にバックアップ
3. `mcpServers`（Codex は `mcp_servers`）配下に `notify` エントリをマージ／新規作成
4. それ以外のフィールドには一切手を加えません

config ファイルが破損していて parse できない場合も、バックアップを取った上で `notify` エントリを含む正しいファイルを書き直します。

### 各クライアントの config 配置先

| クライアント | パス | 形式 |
|---|---|---|
| Claude Code (CLI) | `~/.claude.json` | JSON |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` | JSON |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` | JSON |
| Claude Desktop (Linux, 非公式) | `~/.config/Claude/claude_desktop_config.json` | JSON |
| Cursor | `~/.cursor/mcp.json` | JSON |
| OpenAI Codex CLI | `~/.codex/config.toml`（テーブル `[mcp_servers.<name>]`） | TOML |
| Google Antigravity | `~/.gemini/antigravity/mcp_config.json` | JSON |

手動で書く場合、JSON 系クライアント（claude-code / claude-desktop / cursor / antigravity）は同じ形です。

```jsonc
// JSON 系クライアント
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
# OpenAI Codex CLI （~/.codex/config.toml）
[mcp_servers.notify]
command = "npx"
args = ["-y", "notify-mcp"]
```

編集後にクライアントを再起動すると、`notify` / `list_sounds` / `play_sound` の 3 ツールが利用可能になります。

---

## ツール仕様

### `notify`

デスクトップ通知を 1 件発火します。

| フィールド | 型 | 必須 | 備考 |
|---|---|---|---|
| `title` | string (1–256) | はい | 通知タイトル |
| `message` | string (1–4096) | はい | 通知本文 |
| `urgency` | `"low" \| "normal" \| "critical"` | いいえ | Linux の `notify-send` でのみ有効。Mac/Win では無視。 |
| `sound` | string (1–1024) | いいえ | `"system:NAME"`（`list_sounds` 参照）または絶対パス |

返却例:

```json
{
  "delivered": true,
  "platform": "darwin",
  "method": "osascript",
  "sound": { "played": true, "method": "afplay" }
}
```

### `list_sounds`

実行 OS の組み込みシステム音名を返します。macOS の例:

```json
{
  "platform": "darwin",
  "sounds": ["Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero",
             "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink"]
}
```

- Windows: `Beep, Asterisk, Exclamation, Hand, Question`
- Linux: 主要な libcanberra event（`bell, message, complete, alarm, dialog-warning`）

### `play_sound`

通知を発火せず、音だけ鳴らします。

| フィールド | 型 | 必須 |
|---|---|---|
| `sound` | string (1–1024): `"system:NAME"` または絶対パス | はい |

## 任意の音ファイル

絶対パスのみ受け付けます。実在する通常ファイルで、サイズが 10 MB 以下である必要があります。macOS は `afplay`、Windows は `System.Media.SoundPlayer`、Linux は `paplay` → 失敗時 `aplay` の順で再生します。

---

## セキュリティ

- 全 subprocess は `execFile` / `spawn` で起動し、**shell を経由しません**。argv の値は `/bin/sh` や `cmd.exe` で再解釈されません。
- Windows PowerShell スクリプトは固定リテラル。信頼できない値（タイトル / メッセージ / ファイルパス）は **環境変数経由**（`$env:NOTIFY_*`）でのみ渡し、スクリプト本体には埋め込みません。
- macOS の AppleScript 文字列値は規約通り escape（`\` → `\\`, `"` → `\"`）。
- Windows の WinRT トースト XML は XML escape（`& < > " '`）。
- `title` / `message` の制御文字（TAB / LF / CR を除く）は事前に削除。
- 長さ上限: title 256 / message 4096 / sound spec 1024。
- 音ファイル: 絶対パス必須、サイズ ≤ 10 MB。
- subprocess タイムアウト: 通知 5 秒 / 音 10 秒。
- インストーラは既存 config を必ずバックアップしてから上書き。

## プラットフォーム別の注意

### macOS

- 初回の `display notification` 実行時に「Script Editor」の通知許可が一度だけ求められます。許可後は問題なく通知が出ます。
- 音ファイルは `.aiff`, `.wav`, `.mp3` など `afplay` が受け付けるものを使えます。

### Windows

- PowerShell 5.1 以上が必要（Windows 10 / 11 標準搭載）。サードパーティの PS モジュールは不要です。
- 通知はアクションセンターに表示されます。
- AppUserModelID を持たないプロセスからの toast を抑制する設定の Windows もあります。その場合も `npx -y notify-mcp` 経由が最も安定します。

### Linux (Ubuntu 等)

- `libnotify-bin`（`notify-send` 同梱）が必要: `sudo apt install libnotify-bin`
- 組み込みシステム音用に `libcanberra-gtk-module` / `canberra-gtk-play`
- 任意の音ファイル再生用に `pulseaudio-utils`（`paplay`）または `alsa-utils`（`aplay`）

---

## 開発

```sh
pnpm install
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run（64 ケース）
pnpm build        # tsc → dist/
pnpm smoke        # dist/index.js を起動して実際に通知を発火するスモークテスト
```

### リポジトリ構成

```
src/
  index.ts       # bin エントリポイント（CLI + stdio transport）
  cli.ts         # argv パーサ、install / uninstall / list-clients / help / version
  install.ts     # クライアントレジストリ、JSON + TOML マージ、バックアップ
  server.ts      # MCP サーバ + tool 登録
  notifier.ts    # OS 別通知ディスパッチャ
  sound.ts       # OS 別音再生
  sanitize.ts    # 入力サニタイズ + OS 別 escape
  platform.ts    # OS 判定
  errors.ts      # 型付きエラー
test/
  *.test.ts      # vitest スペック（sanitize / sound / notifier / server / cli / install）
scripts/
  smoke.mjs      # エンドツーエンドのスモークランナー
```

## ライセンス

MIT — [LICENSE](./LICENSE) を参照してください。
