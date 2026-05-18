#!/usr/bin/env node
// Smoke test: launches the built MCP server as a child process via stdio,
// runs initialize + tools/list + a notify call (with sound), prints results,
// then exits.
//
// Use:
//   pnpm build && pnpm smoke
//
// This is NOT a doctrine-required test — it's a developer convenience to
// confirm end-to-end behavior on the current host without an MCP client.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, "..", "dist", "index.js");

const proc = spawn(process.execPath, [serverEntry], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
let nextId = 1;
const pending = new Map();

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      console.error("[unparseable]", line.slice(0, 200), e.message);
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    } else {
      console.error("[server notification]", JSON.stringify(msg).slice(0, 200));
    }
  }
});

function send(method, params, ms = 20000) {
  const id = nextId++;
  const req = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify(req) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout for ${method} id=${id}`));
      }
    }, ms);
  });
}

function notif(method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function run() {
  console.log("== initialize ==");
  await send("initialize", {
    protocolVersion: "2025-03-26",
    clientInfo: { name: "notify-mcp-smoke", version: "0.0.0" },
    capabilities: {},
  });
  notif("notifications/initialized", {});

  console.log("== tools/list ==");
  const tools = await send("tools/list", {});
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  console.log("tools:", names.join(", "));

  console.log("== list_sounds ==");
  const sounds = await send("tools/call", { name: "list_sounds", arguments: {} });
  console.log(sounds.result?.content?.[0]?.text);

  console.log("== notify (no sound) ==");
  const r1 = await send("tools/call", {
    name: "notify",
    arguments: { title: "notify-mcp smoke", message: "plain message, no sound" },
  });
  console.log(r1.result?.content?.[0]?.text);

  console.log("== notify (system:Glass) ==");
  const r2 = await send("tools/call", {
    name: "notify",
    arguments: {
      title: "notify-mcp smoke 2",
      message: "with Glass sound",
      sound: "system:Glass",
    },
  });
  console.log(r2.result?.content?.[0]?.text);

  console.log("== play_sound (system:Ping) ==");
  const r3 = await send("tools/call", {
    name: "play_sound",
    arguments: { sound: "system:Ping" },
  });
  console.log(r3.result?.content?.[0]?.text);

  // graceful shutdown: end stdin and wait briefly for the server to flush.
  proc.stdin.end();
  await new Promise((r) => setTimeout(r, 300));
  proc.kill();
}

run().catch((e) => {
  console.error("smoke failed:", e);
  proc.kill();
  process.exit(1);
});
