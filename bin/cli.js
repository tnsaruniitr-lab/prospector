#!/usr/bin/env node
/**
 * prospect-engine CLI entry — published as the `prospect-engine` bin.
 *
 *   prospect-engine start     local mode: server + agent + open browser
 *   prospect-engine connect   connect agent to a hosted server (set BRIDGE_URL)
 *   prospect-engine serve     server only (for hosting)
 *   prospect-engine migrate   create/update DB tables
 *
 * Runs the compiled dist/*.js with the current node. If dist is missing
 * (fresh git checkout), tells the user to build first.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const cmd = (process.argv[2] || "start").toLowerCase();
const rest = process.argv.slice(3);

const MAP = {
  start: "dist/start-local.js",
  connect: "dist/agent.js",
  serve: "dist/server.js",
  migrate: "dist/migrate.js",
};

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`
prospect-engine <command>

  start     Local mode — starts server + agent, opens localhost:3000/app
  connect   Connect this machine's agent to a hosted server
              (set BRIDGE_URL=wss://your-url/ws and AGENT_TOKEN=...)
  serve     Run the server only (for hosting)
  migrate   Create / update the database tables

Requires: Node 20+, a DATABASE_URL (Railway Postgres) in .env or env,
and — for research — Claude Code (npm i -g @anthropic/claude-code) with
the Claude in Chrome extension connected, plus SEMrush + LinkedIn open.
`);
  process.exit(0);
}

const target = MAP[cmd];
if (!target) {
  console.error(`Unknown command: "${cmd}". Run \`prospect-engine help\`.`);
  process.exit(1);
}

const targetPath = resolve(root, target);
if (!existsSync(targetPath)) {
  console.error(`Build not found: ${target}\nRun \`pnpm build\` in the project first (or reinstall the package).`);
  process.exit(1);
}

const child = spawn(process.execPath, [targetPath, ...rest], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (e) => { console.error(`[cli] failed to start: ${e.message}`); process.exit(1); });
