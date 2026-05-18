import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CLIENTS,
  CLIENT_IDS,
  defaultServerEntry,
  install,
  uninstall,
  listClients,
  _internal,
  type ClientId,
} from "../src/install.js";
import { parse as parseToml } from "smol-toml";

/**
 * Override every client's configPath to a sandbox file so tests don't touch
 * the real ~/.claude.json etc. We mutate the array in-place inside the
 * sandbox lifecycle and restore in afterEach.
 */
const originalPaths = CLIENTS.map((c) => c.configPath);
let sandboxRoot = "";

function pathFor(id: ClientId, ext: "json" | "toml"): string {
  return path.join(sandboxRoot, `${id}.${ext}`);
}

beforeEach(() => {
  sandboxRoot = mkdtempSync(path.join(tmpdir(), "notify-mcp-install-"));
  for (let i = 0; i < CLIENTS.length; i++) {
    const c = CLIENTS[i]!;
    const ext = c.format;
    c.configPath = () => pathFor(c.id, ext);
  }
});

afterEach(() => {
  for (let i = 0; i < CLIENTS.length; i++) {
    CLIENTS[i]!.configPath = originalPaths[i]!;
  }
  rmSync(sandboxRoot, { recursive: true, force: true });
});

describe("CLIENT_IDS", () => {
  it("contains all 5 supported clients", () => {
    expect(CLIENT_IDS).toEqual(["claude-code", "claude-desktop", "cursor", "codex", "antigravity"]);
  });
});

describe("listClients", () => {
  it("reports exists=false for sandbox paths", () => {
    const list = listClients();
    expect(list).toHaveLength(5);
    for (const c of list) {
      expect(c.exists).toBe(false);
      expect(c.configPath).toContain(sandboxRoot);
    }
  });
});

describe("defaultServerEntry", () => {
  it("uses npx -y notify-mcp", () => {
    expect(defaultServerEntry()).toEqual({ command: "npx", args: ["-y", "notify-mcp"] });
  });
});

describe("install — JSON clients (claude-code / cursor / claude-desktop / antigravity)", () => {
  for (const id of ["claude-code", "cursor", "claude-desktop", "antigravity"] as const) {
    it(`creates a fresh config for ${id}`, () => {
      const r = install(id);
      expect(r.action).toBe("created");
      expect(r.backupPath).toBeUndefined();
      expect(existsSync(r.configPath)).toBe(true);
      const raw = readFileSync(r.configPath, "utf8");
      const data = JSON.parse(raw);
      expect(data.mcpServers.notify).toEqual({
        command: "npx",
        args: ["-y", "notify-mcp"],
      });
    });

    it(`merges into an existing config for ${id} without losing siblings`, () => {
      const target = pathFor(id, "json");
      const existing = {
        somethingElse: { ok: true },
        mcpServers: {
          other: { command: "node", args: ["./other.js"] },
        },
      };
      writeFileSync(target, JSON.stringify(existing, null, 2), "utf8");

      const r = install(id);
      expect(r.action).toBe("updated");
      expect(r.backupPath).toBeDefined();
      expect(r.backupPath && existsSync(r.backupPath)).toBe(true);

      const merged = JSON.parse(readFileSync(target, "utf8"));
      expect(merged.somethingElse).toEqual({ ok: true });
      expect(merged.mcpServers.other).toEqual({ command: "node", args: ["./other.js"] });
      expect(merged.mcpServers.notify).toEqual({
        command: "npx",
        args: ["-y", "notify-mcp"],
      });
    });

    it(`is idempotent for ${id} (second install -> noop)`, () => {
      install(id);
      const r2 = install(id);
      expect(r2.action).toBe("noop");
    });
  }
});

describe("install — TOML client (codex)", () => {
  it("creates a fresh config.toml", () => {
    const r = install("codex");
    expect(r.action).toBe("created");
    const raw = readFileSync(r.configPath, "utf8");
    const data = parseToml(raw);
    expect(data).toMatchObject({
      mcp_servers: {
        notify: { command: "npx", args: ["-y", "notify-mcp"] },
      },
    });
  });

  it("merges into an existing config.toml without losing other tables", () => {
    const target = pathFor("codex", "toml");
    writeFileSync(
      target,
      `model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "node"\nargs = ["./x.js"]\n`,
      "utf8",
    );

    const r = install("codex");
    expect(r.action).toBe("updated");
    expect(r.backupPath).toBeDefined();
    const data = parseToml(readFileSync(target, "utf8")) as Record<string, unknown>;
    expect(data["model"]).toBe("gpt-5");
    const servers = data["mcp_servers"] as Record<string, unknown>;
    expect(servers["other"]).toEqual({ command: "node", args: ["./x.js"] });
    expect(servers["notify"]).toEqual({ command: "npx", args: ["-y", "notify-mcp"] });
  });
});

describe("install — --dry-run", () => {
  it("does not create the file", () => {
    const r = install("cursor", { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.action).toBe("created");
    expect(existsSync(r.configPath)).toBe(false);
  });
});

describe("install — custom name", () => {
  it("writes under the custom server key", () => {
    install("cursor", { serverName: "my-notify" });
    const data = JSON.parse(readFileSync(pathFor("cursor", "json"), "utf8"));
    expect(Object.keys(data.mcpServers)).toContain("my-notify");
  });
});

describe("install — bad existing file", () => {
  it("backs up an unparseable config and rewrites", () => {
    const target = pathFor("cursor", "json");
    writeFileSync(target, "{not valid json", "utf8");
    const r = install("cursor");
    expect(r.backupPath).toBeDefined();
    expect(r.notes?.some((n) => n.includes("could not be parsed"))).toBe(true);
    const data = JSON.parse(readFileSync(target, "utf8"));
    expect(data.mcpServers.notify).toBeDefined();
  });
});

describe("uninstall", () => {
  it("reports missing when no config exists", () => {
    const r = uninstall("cursor");
    expect(r.action).toBe("missing");
  });

  it("removes the entry and keeps siblings", () => {
    const target = pathFor("cursor", "json");
    writeFileSync(
      target,
      JSON.stringify({
        mcpServers: {
          notify: { command: "npx", args: ["-y", "notify-mcp"] },
          keep: { command: "node", args: ["./k.js"] },
        },
      }),
      "utf8",
    );
    const r = uninstall("cursor");
    expect(r.action).toBe("removed");
    const data = JSON.parse(readFileSync(target, "utf8"));
    expect(data.mcpServers.notify).toBeUndefined();
    expect(data.mcpServers.keep).toEqual({ command: "node", args: ["./k.js"] });
  });

  it("noop when entry not present", () => {
    writeFileSync(pathFor("cursor", "json"), JSON.stringify({ mcpServers: {} }), "utf8");
    const r = uninstall("cursor");
    expect(r.action).toBe("noop");
  });
});

describe("install — unknown client", () => {
  it("throws with a helpful message", () => {
    expect(() => install("bogus" as ClientId)).toThrow(/unknown client/);
  });
});

describe("claudeDesktopPath", () => {
  it("returns an absolute path", () => {
    expect(path.isAbsolute(_internal.claudeDesktopPath())).toBe(true);
  });
});
