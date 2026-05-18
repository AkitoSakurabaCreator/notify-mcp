#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";
import { runCli } from "./cli.js";

async function main(): Promise<void> {
  const cli = runCli(process.argv);
  if (cli.action === "exit") {
    process.exit(cli.code);
  }
  // action === "run-server"
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr ONLY — stdout is the MCP JSON-RPC channel.
  process.stderr.write("notify-mcp: stdio server ready\n");
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`notify-mcp fatal: ${msg}\n`);
  process.exit(1);
});
