import { CLIENT_IDS, install, listClients, uninstall, type ClientId } from "./install.js";

const HELP = `notify-mcp — cross-platform desktop notification MCP server

USAGE
  notify-mcp                          Run the MCP stdio server (default; this is
                                      what your MCP client will spawn).
  notify-mcp install <client>         Install notify-mcp into a client config.
  notify-mcp install --all            Install into every supported client.
  notify-mcp uninstall <client>       Remove notify-mcp from a client config.
  notify-mcp list-clients             List supported clients and their config paths.
  notify-mcp --version | -v
  notify-mcp --help | -h

CLIENTS
  ${CLIENT_IDS.join(", ")}

OPTIONS
  --name <key>     Server key inside mcpServers / mcp_servers (default: "notify").
  --dry-run        Show what would change without writing files.
  --no-backup      Do not create a *.bak-YYYYMMDD-HHmmss file before overwriting.

EXAMPLES
  notify-mcp install claude-code
  notify-mcp install cursor --name desktop-notify
  notify-mcp install --all --dry-run
  notify-mcp uninstall codex
`;

const VERSION = "0.1.0";

interface ParsedArgs {
  command: "server" | "install" | "uninstall" | "list-clients" | "help" | "version";
  client?: string;
  all?: boolean;
  name?: string;
  dryRun?: boolean;
  noBackup?: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  // strip node + script
  const args = argv.slice(2);
  if (args.length === 0) return { command: "server" };

  const first = args[0];
  if (first === "--help" || first === "-h" || first === "help") return { command: "help" };
  if (first === "--version" || first === "-v" || first === "version") return { command: "version" };
  if (first === "list-clients") return { command: "list-clients" };
  if (first === "install" || first === "uninstall") {
    const out: ParsedArgs = {
      command: first === "install" ? "install" : "uninstall",
    };
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === undefined) continue;
      if (a === "--all") out.all = true;
      else if (a === "--dry-run") out.dryRun = true;
      else if (a === "--no-backup") out.noBackup = true;
      else if (a === "--name") {
        const next = args[i + 1];
        if (!next) throw new Error("--name requires a value");
        out.name = next;
        i++;
      } else if (a.startsWith("--name=")) {
        out.name = a.slice("--name=".length);
      } else if (a.startsWith("-")) {
        throw new Error(`unknown option: ${a}`);
      } else if (!out.client) {
        out.client = a;
      } else {
        throw new Error(`unexpected positional argument: ${a}`);
      }
    }
    return out;
  }

  // unknown — fall back to help
  throw new Error(`unknown command: ${first}. Run "notify-mcp --help".`);
}

function assertKnownClient(c: string): asserts c is ClientId {
  if (!(CLIENT_IDS as string[]).includes(c)) {
    throw new Error(`unknown client: "${c}". Supported: ${CLIENT_IDS.join(", ")}`);
  }
}

function formatList(): string {
  const lines: string[] = ["Supported MCP clients:", ""];
  for (const c of listClients()) {
    lines.push(`  ${c.id.padEnd(16)} (${c.format}) ${c.label}`);
    lines.push(`    config : ${c.configPath}`);
    lines.push(`    exists : ${c.exists ? "yes" : "no"}`);
    lines.push(`    docs   : ${c.homepageUrl}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Run the CLI. Returns the next action:
 *  - "run-server": parent should start the stdio MCP server.
 *  - "exit": parent should exit with the returned code (0 on success).
 */
export function runCli(
  argv: string[],
): { action: "run-server" } | { action: "exit"; code: number; output?: string } {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`notify-mcp: ${msg}\n${HELP}`);
    return { action: "exit", code: 2 };
  }

  if (parsed.command === "server") return { action: "run-server" };
  if (parsed.command === "help") {
    process.stdout.write(HELP);
    return { action: "exit", code: 0 };
  }
  if (parsed.command === "version") {
    process.stdout.write(VERSION + "\n");
    return { action: "exit", code: 0 };
  }
  if (parsed.command === "list-clients") {
    process.stdout.write(formatList());
    return { action: "exit", code: 0 };
  }

  // install / uninstall
  if (parsed.command === "install" || parsed.command === "uninstall") {
    const targets: ClientId[] = [];
    if (parsed.all) {
      targets.push(...(CLIENT_IDS as ClientId[]));
    } else {
      if (!parsed.client) {
        process.stderr.write(
          `notify-mcp ${parsed.command}: missing <client>. Run "notify-mcp list-clients".\n`,
        );
        return { action: "exit", code: 2 };
      }
      try {
        assertKnownClient(parsed.client);
      } catch (e) {
        process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
        return { action: "exit", code: 2 };
      }
      targets.push(parsed.client);
    }

    const results: unknown[] = [];
    let hadError = false;
    for (const t of targets) {
      try {
        if (parsed.command === "install") {
          const r = install(t, {
            serverName: parsed.name,
            dryRun: parsed.dryRun,
            noBackup: parsed.noBackup,
          });
          results.push(r);
          const tag = r.dryRun ? `(dry-run) ${r.action}` : r.action;
          const backup = r.backupPath ? ` [backup: ${r.backupPath}]` : "";
          process.stdout.write(`${r.client.padEnd(16)} ${tag}: ${r.configPath}${backup}\n`);
          for (const n of r.notes ?? []) process.stdout.write(`  note: ${n}\n`);
        } else {
          const r = uninstall(t, {
            serverName: parsed.name,
            dryRun: parsed.dryRun,
            noBackup: parsed.noBackup,
          });
          results.push(r);
          const tag = r.dryRun ? `(dry-run) ${r.action}` : r.action;
          const backup = r.backupPath ? ` [backup: ${r.backupPath}]` : "";
          process.stdout.write(`${r.client.padEnd(16)} ${tag}: ${r.configPath}${backup}\n`);
          for (const n of r.notes ?? []) process.stdout.write(`  note: ${n}\n`);
        }
      } catch (e) {
        hadError = true;
        process.stderr.write(
          `${t.padEnd(16)} ERROR: ${e instanceof Error ? e.message : String(e)}\n`,
        );
      }
    }
    return { action: "exit", code: hadError ? 1 : 0 };
  }

  process.stderr.write(HELP);
  return { action: "exit", code: 2 };
}

// exported for tests
export const _internal = { HELP, VERSION };
