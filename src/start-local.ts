/**
 * `npx prospect-engine` — starts everything locally in one command.
 *
 * 1. Starts the server (localhost:3000) — web UI + bridge
 * 2. Starts the local agent connecting to that server
 * 3. Opens localhost:3000/app in the browser
 *
 * This is the zero-config local mode: no Railway, no BRIDGE_URL,
 * no AGENT_TOKEN needed. Everything runs on the user's machine.
 * Data still goes to Railway Postgres (DATABASE_URL in .env).
 *
 * To connect to a hosted Railway server instead:
 *   BRIDGE_URL=wss://your-url/ws npx prospect-engine connect
 */

import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(resolve(__dir, "..", "package.json"), "utf-8"));

const LOCAL_PORT = Number(process.env.PORT) || 3000;
const LOCAL_BRIDGE = `ws://localhost:${LOCAL_PORT}/ws`;
const AGENT_TOKEN = process.env.AGENT_TOKEN || "local-" + Math.random().toString(36).slice(2, 8);
const TSX = resolve(__dir, "..", "node_modules", ".bin", "tsx");

console.log(`\n🚀 Prospect Engine v${PKG.version} — local mode`);
console.log(`   Server:  http://localhost:${LOCAL_PORT}/app`);
console.log(`   DB:      ${process.env.DATABASE_URL ? "Railway Postgres ✓" : "⚠ DATABASE_URL not set"}\n`);

// ── Start server ──────────────────────────────────────────────────────────
const server = spawn(TSX, [resolve(__dir, "server.ts")], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(LOCAL_PORT) },
});

server.on("error", (e) => { console.error("[start] server failed:", e.message); process.exit(1); });

// ── Wait for server to be ready, then start agent ─────────────────────────
async function waitForServer(maxMs = 15_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`http://localhost:${LOCAL_PORT}/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

const ready = await waitForServer();
if (!ready) { console.error("[start] server didn't start in 15s"); process.exit(1); }
console.log("[start] ✅ Server ready\n");

// ── Start agent ────────────────────────────────────────────────────────────
const agent = spawn(TSX, [resolve(__dir, "agent.ts")], {
  stdio: "inherit",
  env: { ...process.env, BRIDGE_URL: LOCAL_BRIDGE, AGENT_TOKEN },
});

agent.on("error", (e) => console.error("[start] agent error:", e.message));

// ── Open browser ───────────────────────────────────────────────────────────
await new Promise(r => setTimeout(r, 1500)); // let agent register first
const url = `http://localhost:${LOCAL_PORT}/app`;
const open = process.platform === "darwin" ? "open"
  : process.platform === "win32" ? "start"
  : "xdg-open";
try { execSync(`${open} "${url}"`, { stdio: "ignore" }); } catch { /* ignore */ }
console.log(`\n[start] Browser opened → ${url}`);
console.log("[start] Press Ctrl+C to stop.\n");

// ── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown() {
  console.log("\n[start] Stopping...");
  server.kill();
  agent.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
