import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

export type ClientId = "claude-code" | "claude-desktop" | "cursor" | "codex" | "antigravity";

export interface ServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ClientSpec {
  id: ClientId;
  label: string;
  format: "json" | "toml";
  configPath: () => string;
  serversKey: string; // "mcpServers" for JSON, "mcp_servers" for TOML/Codex
  homepageUrl: string;
}

const HOME = os.homedir();

function claudeDesktopPath(): string {
  const p = os.platform();
  if (p === "darwin") {
    return path.join(
      HOME,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (p === "win32") {
    const appData = process.env["APPDATA"] ?? path.join(HOME, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  // linux (best-effort; Anthropic does not officially ship a Linux desktop client)
  return path.join(HOME, ".config", "Claude", "claude_desktop_config.json");
}

export const CLIENTS: ClientSpec[] = [
  {
    id: "claude-code",
    label: "Claude Code (CLI)",
    format: "json",
    configPath: () => path.join(HOME, ".claude.json"),
    serversKey: "mcpServers",
    homepageUrl: "https://docs.claude.com/en/docs/claude-code/mcp",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    format: "json",
    configPath: claudeDesktopPath,
    serversKey: "mcpServers",
    homepageUrl: "https://modelcontextprotocol.io/quickstart/user",
  },
  {
    id: "cursor",
    label: "Cursor",
    format: "json",
    configPath: () => path.join(HOME, ".cursor", "mcp.json"),
    serversKey: "mcpServers",
    homepageUrl: "https://cursor.com/docs/mcp",
  },
  {
    id: "codex",
    label: "OpenAI Codex CLI",
    format: "toml",
    configPath: () => path.join(HOME, ".codex", "config.toml"),
    serversKey: "mcp_servers",
    homepageUrl: "https://developers.openai.com/codex/mcp",
  },
  {
    id: "antigravity",
    label: "Google Antigravity",
    format: "json",
    configPath: () => path.join(HOME, ".gemini", "antigravity", "mcp_config.json"),
    serversKey: "mcpServers",
    homepageUrl: "https://antigravity.google/docs/mcp",
  },
];

export const CLIENT_IDS = CLIENTS.map((c) => c.id);

export function findClient(id: string): ClientSpec | undefined {
  return CLIENTS.find((c) => c.id === id);
}

/** Default server entry written into each client config. */
export function defaultServerEntry(): ServerEntry {
  return {
    command: "npx",
    args: ["-y", "notify-mcp"],
  };
}

export interface InstallOptions {
  /** Key used inside mcpServers / mcp_servers (default: "notify"). */
  serverName?: string;
  /** Skip writing files; just print what would happen. */
  dryRun?: boolean;
  /** Override server entry. Mostly for tests / local dev. */
  entry?: ServerEntry;
  /** Skip backup of an existing config. Default: false (backup is created). */
  noBackup?: boolean;
}

export interface InstallResult {
  client: ClientId;
  configPath: string;
  action: "created" | "updated" | "noop";
  dryRun: boolean;
  backupPath?: string;
  serverName: string;
  notes?: string[];
}

/**
 * Read an existing config file safely.
 * Returns an empty plain object when the file is missing or unparseable.
 * Unparseable files are logged to stderr but DO NOT cause install to fail —
 * we always make a `.bak-*` backup before overwriting, so the user can recover.
 */
function readExistingConfig(
  configPath: string,
  format: "json" | "toml",
): { data: Record<string, unknown>; existed: boolean; parseError?: string } {
  if (!existsSync(configPath)) return { data: {}, existed: false };
  try {
    const raw = readFileSync(configPath, "utf8");
    if (raw.trim() === "") return { data: {}, existed: true };
    const parsed = format === "json" ? JSON.parse(raw) : parseToml(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, existed: true };
    }
    return {
      data: {},
      existed: true,
      parseError: `existing config root was not an object (was ${typeof parsed})`,
    };
  } catch (e) {
    return {
      data: {},
      existed: true,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
}

function serializeConfig(data: Record<string, unknown>, format: "json" | "toml"): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2) + "\n";
  }
  return stringifyToml(data) + "\n";
}

function backupTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

export function install(clientId: ClientId, opts: InstallOptions = {}): InstallResult {
  const client = findClient(clientId);
  if (!client) {
    throw new Error(`unknown client "${clientId}". Supported: ${CLIENT_IDS.join(", ")}`);
  }
  const serverName = opts.serverName ?? "notify";
  const entry = opts.entry ?? defaultServerEntry();
  const configPath = client.configPath();
  const notes: string[] = [];

  const { data, existed, parseError } = readExistingConfig(configPath, client.format);
  if (parseError) {
    notes.push(
      `existing config could not be parsed (${parseError}); a backup will be made and the file will be rewritten`,
    );
  }

  // Ensure servers map exists
  const serversKey = client.serversKey;
  const existingServers = (data[serversKey] ?? {}) as Record<string, unknown>;
  const before = JSON.stringify(existingServers[serverName] ?? null);

  // Build merged entry. Keep the shape compatible with all known clients:
  //   { command: string, args: string[], env?: Record<string,string> }
  const newEntry: Record<string, unknown> = {
    command: entry.command,
    args: [...entry.args],
  };
  if (entry.env && Object.keys(entry.env).length > 0) {
    newEntry["env"] = { ...entry.env };
  }
  const merged = { ...existingServers, [serverName]: newEntry };
  const after = JSON.stringify(merged[serverName]);

  const willChange = before !== after;
  const action: InstallResult["action"] = !existed ? "created" : willChange ? "updated" : "noop";

  if (opts.dryRun) {
    return {
      client: clientId,
      configPath,
      action,
      dryRun: true,
      serverName,
      notes,
    };
  }

  if (action === "noop") {
    return { client: clientId, configPath, action, dryRun: false, serverName, notes };
  }

  // Ensure parent dir exists
  mkdirSync(path.dirname(configPath), { recursive: true });

  let backupPath: string | undefined;
  if (existed && !opts.noBackup) {
    backupPath = `${configPath}.bak-${backupTimestamp()}`;
    try {
      copyFileSync(configPath, backupPath);
    } catch (e) {
      notes.push(
        `failed to write backup at ${backupPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
      backupPath = undefined;
    }
  }

  const outData = { ...data, [serversKey]: merged };
  const serialized = serializeConfig(outData, client.format);
  writeFileSync(configPath, serialized, "utf8");

  return {
    client: clientId,
    configPath,
    action,
    dryRun: false,
    backupPath,
    serverName,
    notes,
  };
}

export interface UninstallOptions {
  serverName?: string;
  dryRun?: boolean;
  noBackup?: boolean;
}

export interface UninstallResult {
  client: ClientId;
  configPath: string;
  action: "removed" | "noop" | "missing";
  dryRun: boolean;
  backupPath?: string;
  serverName: string;
  notes?: string[];
}

export function uninstall(clientId: ClientId, opts: UninstallOptions = {}): UninstallResult {
  const client = findClient(clientId);
  if (!client) {
    throw new Error(`unknown client "${clientId}". Supported: ${CLIENT_IDS.join(", ")}`);
  }
  const serverName = opts.serverName ?? "notify";
  const configPath = client.configPath();
  const notes: string[] = [];

  const { data, existed, parseError } = readExistingConfig(configPath, client.format);
  if (!existed) {
    return {
      client: clientId,
      configPath,
      action: "missing",
      dryRun: !!opts.dryRun,
      serverName,
      notes,
    };
  }
  if (parseError) {
    notes.push(`existing config could not be parsed (${parseError})`);
  }

  const servers = (data[client.serversKey] ?? {}) as Record<string, unknown>;
  if (!(serverName in servers)) {
    return {
      client: clientId,
      configPath,
      action: "noop",
      dryRun: !!opts.dryRun,
      serverName,
      notes,
    };
  }

  if (opts.dryRun) {
    return {
      client: clientId,
      configPath,
      action: "removed",
      dryRun: true,
      serverName,
      notes,
    };
  }

  let backupPath: string | undefined;
  if (!opts.noBackup) {
    backupPath = `${configPath}.bak-${backupTimestamp()}`;
    try {
      copyFileSync(configPath, backupPath);
    } catch (e) {
      notes.push(
        `failed to write backup at ${backupPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
      backupPath = undefined;
    }
  }

  const next = { ...servers };
  delete next[serverName];
  const outData = { ...data, [client.serversKey]: next };
  writeFileSync(configPath, serializeConfig(outData, client.format), "utf8");

  return {
    client: clientId,
    configPath,
    action: "removed",
    dryRun: false,
    backupPath,
    serverName,
    notes,
  };
}

export function listClients(): {
  id: ClientId;
  label: string;
  format: string;
  configPath: string;
  exists: boolean;
  homepageUrl: string;
}[] {
  return CLIENTS.map((c) => {
    const p = c.configPath();
    return {
      id: c.id,
      label: c.label,
      format: c.format,
      configPath: p,
      exists: existsSync(p),
      homepageUrl: c.homepageUrl,
    };
  });
}

// Exported for unit tests only.
export const _internal = { readExistingConfig, serializeConfig, claudeDesktopPath };
