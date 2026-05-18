import { describe, it, expect } from "vitest";

import { parseArgs } from "../src/cli.js";

function argv(...args: string[]): string[] {
  return ["node", "notify-mcp", ...args];
}

describe("parseArgs", () => {
  it("defaults to running the server when no args", () => {
    expect(parseArgs(argv())).toEqual({ command: "server" });
  });

  it("recognizes --help / -h / help", () => {
    expect(parseArgs(argv("--help")).command).toBe("help");
    expect(parseArgs(argv("-h")).command).toBe("help");
    expect(parseArgs(argv("help")).command).toBe("help");
  });

  it("recognizes --version / -v / version", () => {
    expect(parseArgs(argv("--version")).command).toBe("version");
    expect(parseArgs(argv("-v")).command).toBe("version");
    expect(parseArgs(argv("version")).command).toBe("version");
  });

  it("recognizes list-clients", () => {
    expect(parseArgs(argv("list-clients")).command).toBe("list-clients");
  });

  it("parses install <client>", () => {
    expect(parseArgs(argv("install", "cursor"))).toMatchObject({
      command: "install",
      client: "cursor",
    });
  });

  it("parses install --all --dry-run", () => {
    expect(parseArgs(argv("install", "--all", "--dry-run"))).toMatchObject({
      command: "install",
      all: true,
      dryRun: true,
    });
  });

  it("parses --name <value> and --name=<value>", () => {
    expect(parseArgs(argv("install", "cursor", "--name", "desk")).name).toBe("desk");
    expect(parseArgs(argv("install", "cursor", "--name=desk")).name).toBe("desk");
  });

  it("parses uninstall <client>", () => {
    expect(parseArgs(argv("uninstall", "codex"))).toMatchObject({
      command: "uninstall",
      client: "codex",
    });
  });

  it("--no-backup flag", () => {
    expect(parseArgs(argv("install", "cursor", "--no-backup")).noBackup).toBe(true);
  });

  it("rejects unknown commands", () => {
    expect(() => parseArgs(argv("frobnicate"))).toThrow(/unknown command/);
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(argv("install", "--frobnicate"))).toThrow(/unknown option/);
  });

  it("rejects --name without a value", () => {
    expect(() => parseArgs(argv("install", "cursor", "--name"))).toThrow(/--name requires/);
  });
});
