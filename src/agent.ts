/**
 * Local research agent — run with `npx prospect-engine connect`.
 *
 * Connects to the hosted bridge server, waits for research tasks,
 * invokes Claude Code to run them using the user's local browser
 * (SEMrush + LinkedIn sessions), and streams results back.
 *
 * The user only needs to run this once to connect. After that, research
 * is triggered from the web UI and runs silently here.
 */

import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(resolve(__dir, "..", "package.json"), "utf-8"));

const BRIDGE_URL = process.env.BRIDGE_URL || "wss://prospect-engine.up.railway.app/ws";
const AGENT_TOKEN = process.env.AGENT_TOKEN || process.env.npm_config_token || "";
const SKILL_PATH = resolve(__dir, "..", ".claude", "skills", "research-prospect", "SKILL.md");

if (!AGENT_TOKEN) {
  console.error(`
[agent] AGENT_TOKEN is required. Get yours from the web app:
  1. Go to your account settings
  2. Copy your Agent Token
  3. Run: AGENT_TOKEN=your_token npx prospect-engine connect
`);
  process.exit(1);
}

console.log(`[agent] Prospect Engine v${PKG.version}`);
console.log(`[agent] Connecting to ${BRIDGE_URL}...`);

function buildResearchPrompt(category: string, city: string, limit = 1, sellerProfile: Record<string, unknown> = {}): string {
  const icp = sellerProfile.offer ? `\nSeller offer: ${sellerProfile.offer}\nTarget verticals: ${JSON.stringify(sellerProfile.targetVerticals)}` : "";
  return `Research the top ${limit} prospect(s) in category "${category}" in "${city}" using the research-prospect skill (full flow: Maps discovery → audit → SEMrush → LinkedIn → synthesise → persist to Railway DB).${icp}\n\nFollow all stages in the SKILL.md SOP exactly. Persist each result. Report back when done.`;
}

function invokeClaudeCode(prompt: string, onProgress: (stage: string, detail: string) => void): Promise<{ status: "ok" | "error"; output: string }> {
  return new Promise((resolve) => {
    const args = ["--print", "--no-conversation", prompt];
    console.log(`[agent] spawning: claude ${args.slice(0, 2).join(" ")} ...`);

    const proc = spawn("claude", args, {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Parse progress from Claude's output lines
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        if (/Stage \d|Navigating|SEMrush|LinkedIn|Persisting|Grade/i.test(line)) {
          const stage = line.match(/Stage (\d)/)?.[1] ? `Stage ${line.match(/Stage (\d)/)?.[1]}` : "Research";
          onProgress(stage, line.slice(0, 120));
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ status: "ok", output: stdout.slice(-2000) });
      } else {
        resolve({ status: "error", output: stderr.slice(-1000) || stdout.slice(-1000) });
      }
    });

    proc.on("error", (err) => {
      resolve({ status: "error", output: `Failed to spawn claude: ${err.message}. Is Claude Code installed? (npm install -g @anthropic/claude-code)` });
    });
  });
}

function connect() {
  const ws = new WebSocket(BRIDGE_URL);
  let reconnectDelay = 2000;

  ws.on("open", () => {
    reconnectDelay = 2000; // reset on successful connect
    console.log(`[agent] ✅ Connected to bridge`);
    ws.send(JSON.stringify({
      type: "register",
      agentToken: AGENT_TOKEN,
      info: { version: PKG.version, platform: process.platform, nodeVersion: process.version },
    }));
  });

  ws.on("message", async (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }

    if (msg.type === "registered") {
      console.log(`[agent] ✅ Registered. Waiting for research tasks...`);
      console.log(`[agent] Make sure SEMrush + LinkedIn are open in Chrome.`);
      return;
    }

    if (msg.type === "task") {
      const payload = msg.payload as { taskId: string; category: string; city: string; limit?: number; sellerProfile?: Record<string, unknown> };
      const { taskId, category, city, limit = 1, sellerProfile = {} } = payload;
      console.log(`\n[agent] 📋 Task received: research "${category}" in "${city}" (${limit} prospect(s))`);

      const send = (m: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

      send({ type: "progress", taskId, stage: "Starting", detail: `Researching ${category} in ${city}` });

      const prompt = buildResearchPrompt(category, city, limit, sellerProfile);
      const result = await invokeClaudeCode(prompt, (stage, detail) => {
        send({ type: "progress", taskId, stage, detail });
        console.log(`[agent]   ${stage}: ${detail.slice(0, 80)}`);
      });

      send({ type: "result", taskId, status: result.status, data: { output: result.output }, error: result.status === "error" ? result.output : undefined });
      console.log(`[agent] Task ${taskId} → ${result.status}`);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`[agent] Disconnected (${code}). Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000); // exponential backoff, max 30s
  });

  ws.on("error", (err) => {
    console.error(`[agent] WebSocket error: ${err.message}`);
  });
}

// Graceful exit
process.on("SIGINT", () => { console.log("\n[agent] Stopping."); process.exit(0); });
process.on("SIGTERM", () => process.exit(0));

connect();
