/**
 * End-to-end QA — exercises the live server: REST scaffold + WebSocket bridge
 * plan round-trip (web client → bridge → agent receives the plan intact).
 *
 * Run against a running local server:  npx tsx src/test-e2e.ts
 * (assumes server on http://localhost:3000)
 */
import { WebSocket } from "ws";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const WS = BASE.replace("http", "ws") + "/ws";
const TOKEN = "qa-agent-001";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}  ${detail}`); }
};

async function main() {
  // ── 1. REST: personas + scaffold ──────────────────────────────────────────
  console.log("\n── REST endpoints ──");
  const personas = await (await fetch(`${BASE}/api/personas`)).json();
  check("GET /api/personas returns ≥4 personas", Array.isArray(personas) && personas.length >= 4, `got ${personas.length}`);
  check("personas include ai_search_visibility", personas.some((p: any) => p.id === "ai_search_visibility"));

  const scaffoldRes = await fetch(`${BASE}/api/scaffold`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ persona: "web_redesign", vertical: "med_spa", region: "Berlin, Germany" }),
  });
  const plan = await scaffoldRes.json();
  check("POST /api/scaffold returns a plan", !!plan.researchSources, JSON.stringify(plan).slice(0, 80));
  const types = (plan.researchSources || []).map((s: any) => s.type);
  check("web_redesign scaffold has pagespeed, NO semrush_ai (generalization)",
    types.includes("pagespeed") && !types.includes("semrush_ai"), types.join(","));

  const bad = await (await fetch(`${BASE}/api/scaffold`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: "nope", vertical: "x", region: "y" }),
  })).json();
  check("scaffold with unknown persona → error", !!bad.error);

  // ── 2. WebSocket: plan round-trip through the bridge ───────────────────────
  console.log("\n── WebSocket bridge plan round-trip ──");
  const agentReceived = await new Promise<any>((resolveTask, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout — agent never got the task")), 8000);

    // (a) the agent connects + registers
    const agent = new WebSocket(WS);
    agent.on("open", () => agent.send(JSON.stringify({ type: "register", agentToken: TOKEN, info: { qa: true } })));
    agent.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "registered") {
        // (b) once the agent is registered, a web client sends a research task WITH a plan
        const client = new WebSocket(WS);
        client.on("open", () => client.send(JSON.stringify({ type: "watch", agentToken: TOKEN })));
        client.on("message", (r2) => {
          const wm = JSON.parse(r2.toString());
          if (wm.type === "watched") {
            client.send(JSON.stringify({
              type: "research", agentToken: TOKEN, category: "med spa", city: "Berlin, Germany",
              limit: 1, researchPlan: plan,
            }));
          }
        });
      }
      if (m.type === "task") { clearTimeout(timeout); agent.close(); resolveTask(m.payload); }
    });
    agent.on("error", reject);
  }).catch((e) => ({ __error: e.message }));

  if ((agentReceived as any).__error) {
    check("agent received the task", false, (agentReceived as any).__error);
  } else {
    check("agent received the task over the bridge", !!agentReceived.taskId);
    check("task carried the researchPlan", !!agentReceived.researchPlan, "plan missing in payload");
    check("plan arrived intact (persona = web_redesign)", agentReceived.researchPlan?.sellerPersona === "web_redesign");
    const rt = (agentReceived.researchPlan?.researchSources || []).map((s: any) => s.type);
    check("plan sources intact (pagespeed present, no semrush_ai)",
      rt.includes("pagespeed") && !rt.includes("semrush_ai"), rt.join(","));
  }

  // ── 3. Webpage serves the persona picker ───────────────────────────────────
  console.log("\n── Webpage ──");
  const html = await (await fetch(`${BASE}/app`)).text();
  check("/app serves the persona picker UI", html.includes("What you sell (persona)") && html.includes("previewPlan"));

  console.log(`\n${"═".repeat(46)}\nE2E RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
