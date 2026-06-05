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
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fetchAndExtract, buildBrandExtractPrompt, parseBrandExtract } from "./brand-infer.js";

const __dir = dirname(fileURLToPath(import.meta.url));
// Package root: parent of src/ (dev via tsx) or dist/ (published). Claude runs
// here so it finds .claude/skills/research-prospect + the research helper code.
const PKG_ROOT = resolve(__dir, "..");
const PKG = JSON.parse(readFileSync(resolve(PKG_ROOT, "package.json"), "utf-8"));

// Default to localhost for local mode. Set BRIDGE_URL env var to connect to a hosted server:
//   BRIDGE_URL=wss://your-railway-url/ws npx prospect-engine connect
const BRIDGE_URL = process.env.BRIDGE_URL || "ws://localhost:3000/ws";
const AGENT_TOKEN = process.env.AGENT_TOKEN || process.env.npm_config_token || "";
const SKILL_PATH = resolve(PKG_ROOT, ".claude", "skills", "research-prospect", "SKILL.md");

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

// v2: write the Research Plan to disk so the skill can read it, and build a
// plan-driven prompt. The skill runs ONLY the plan's enabled sources.
function writePlanAndPrompt(plan: Record<string, unknown>, limit: number): string {
  const planPath = resolve(PKG_ROOT, "research-plan.json");
  writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf-8");
  const vertical = String(plan.prospectVertical ?? "");
  const region = String(plan.region ?? "");
  const persona = String(plan.sellerPersona ?? "");
  const sources = Array.isArray(plan.researchSources)
    ? (plan.researchSources as Array<{ type: string; enabled?: boolean }>).filter(s => s.enabled !== false).map(s => s.type).join(", ")
    : "";
  const contact = (plan.contactSource as { type?: string })?.type ?? "linkedin";
  return [
    `Research the top ${limit} prospect(s): vertical "${vertical}" in "${region}".`,
    `A Research Plan has been written to research-plan.json — READ IT FIRST and follow it.`,
    `Seller persona: ${persona}. Run ONLY these research sources: ${sources}. Contact source: ${contact}.`,
    `Use the research-prospect skill, but run only the plan's enabled sources/signals — do NOT run sources the plan disabled.`,
    `For each enabled source, gather its signals or record an explicit thin/blocked/not-found note (never fabricate).`,
    `Synthesise, score relevance for this persona, persist to Railway DB, and report when done.`,
  ].join("\n");
}

// Lightweight text-only Claude call (no browser/MCP needed) — used for brand
// inference. Returns Claude's raw stdout. Runs in the user's Claude Code → no key.
function invokeClaudeText(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--print", prompt], {
      cwd: existsSync(SKILL_PATH) ? PKG_ROOT : process.cwd(),
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });
    let out = "";
    proc.stdout?.on("data", (c: Buffer) => { out += c.toString(); });
    proc.on("close", () => resolve(out));
    proc.on("error", (e) => resolve(`__ERROR__ ${e.message}`));
  });
}

function invokeClaudeCode(prompt: string, onProgress: (stage: string, detail: string) => void): Promise<{ status: "ok" | "error"; output: string }> {
  return new Promise((resolve) => {
    const args = ["--print", prompt];
    console.log(`[agent] spawning: claude --print ...`);

    // cwd = package root so Claude finds the skill + research code regardless of
    // where the user launched `prospect-engine connect` from.
    const proc = spawn("claude", args, {
      cwd: existsSync(SKILL_PATH) ? PKG_ROOT : process.cwd(),
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
      const payload = msg.payload as { taskId: string; category: string; city: string; limit?: number; sellerProfile?: Record<string, unknown>; researchPlan?: Record<string, unknown> };
      const { taskId, category, city, limit = 1, sellerProfile = {}, researchPlan } = payload;
      const label = researchPlan ? `${researchPlan.prospectVertical} in ${researchPlan.region} (plan: ${researchPlan.sellerPersona})` : `"${category}" in "${city}"`;
      console.log(`\n[agent] 📋 Task received: research ${label} (${limit} prospect(s))`);

      const send = (m: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

      send({ type: "progress", taskId, stage: "Starting", detail: `Researching ${label}` });

      // v2: if a Research Plan is attached, write it + use the plan-driven prompt.
      const prompt = researchPlan
        ? writePlanAndPrompt(researchPlan, limit)
        : buildResearchPrompt(category, city, limit, sellerProfile);
      const result = await invokeClaudeCode(prompt, (stage, detail) => {
        send({ type: "progress", taskId, stage, detail });
        console.log(`[agent]   ${stage}: ${detail.slice(0, 80)}`);
      });

      send({ type: "result", taskId, status: result.status, data: { output: result.output }, error: result.status === "error" ? result.output : undefined });
      console.log(`[agent] Task ${taskId} → ${result.status}`);
    }

    // ── LLM brand inference (no-key — runs in THIS machine's Claude Code) ──
    if (msg.type === "infer_task") {
      const { taskId, url } = msg as { taskId: string; url: string };
      const send = (m: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
      console.log(`\n[agent] 🔎 Infer brand from ${url}`);
      try {
        const scraped = await fetchAndExtract(url);                       // scrape: plain code, no key
        const prompt = buildBrandExtractPrompt(url, scraped);
        const out = await invokeClaudeText(prompt);                       // reason: user's Claude Code, no key
        if (out.startsWith("__ERROR__")) {
          send({ type: "infer_result", taskId, status: "error", error: `Claude Code not available (${out.replace("__ERROR__", "").trim()}). Is it installed + on PATH?` });
          return;
        }
        const parsed = parseBrandExtract(out);
        if (!parsed) { send({ type: "infer_result", taskId, status: "error", error: "Claude returned non-JSON output" }); return; }
        send({ type: "infer_result", taskId, status: "ok", data: { ...parsed, title: scraped.title, description: scraped.description } });
        console.log(`[agent] infer → persona=${parsed.personaId} conf=${parsed.confidence}`);
      } catch (e) {
        send({ type: "infer_result", taskId, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
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
