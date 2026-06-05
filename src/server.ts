import http from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "./db.js";
import { paths } from "./config.js";
import { attachBridge, getAgentStatus } from "./bridge.js";
import { scoreRelevance } from "./relevance.js";
import { flattenDossier } from "./dossier.js";
import { listPersonas, scaffoldPlan } from "./personas.js";
import { safeParseResearchPlan } from "./research-plan.js";
import { inferFromUrl, inferFromUrlLlm } from "./brand-infer.js";

// Railway entrypoint. Applies migrations on boot, serves the web UI + REST API
// + WebSocket bridge so local research agents can connect from any machine.

async function migrate(): Promise<void> {
  const files = readdirSync(paths.migrationsDir)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort();
  for (const name of files) {
    await pool.query(readFileSync(resolve(paths.migrationsDir, name), "utf-8"));
    console.log(`[server] migrated ${name}`);
  }
}

// ── Bridge-tasks migration (inline — keeps it self-contained) ──────────────
async function migrateBridgeTasks() {
  await pool.query(`
    create table if not exists prospect.bridge_tasks (
      task_id   text primary key,
      agent_token text not null,
      category  text not null,
      city      text not null,
      status    text not null default 'queued',
      detail    text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )`).catch(() => {});
  await pool.query(`
    create table if not exists prospect.seller_profiles (
      id          text primary key default gen_random_uuid()::text,
      agent_token text not null unique,
      seller_name text,
      offer       text,
      value_prop  text,
      fixes       text,
      target_verticals jsonb default '[]',
      min_reviews int default 25,
      created_at  timestamptz default now(),
      updated_at  timestamptz default now()
    )`).catch(() => {});
  // v2: remember the selected persona with the brand.
  await pool.query(`alter table prospect.seller_profiles add column if not exists persona text`).catch(() => {});
  // v2: ICP fields — who to prospect for, how to find them, which sources to use.
  await pool.query(`alter table prospect.seller_profiles add column if not exists icp text`).catch(() => {});
  await pool.query(`alter table prospect.seller_profiles add column if not exists customer_types jsonb default '[]'`).catch(() => {});
  await pool.query(`alter table prospect.seller_profiles add column if not exists competitor_hint text`).catch(() => {});
  await pool.query(`alter table prospect.seller_profiles add column if not exists suggested_sources jsonb default '[]'`).catch(() => {});
  await pool.query(`alter table prospect.seller_profiles add column if not exists services jsonb default '[]'`).catch(() => {});
  // v2: the local request queue — the bridge between the web UI and the user's
  // own local Claude. Web writes a 'pending' request; the local Claude drains it
  // (reads pending → does the work with its tools → writes the result). No key,
  // no spawned CLI — it's the conversational Claude already running locally.
  await pool.query(`
    create table if not exists prospect.requests (
      id          text primary key default gen_random_uuid()::text,
      agent_token text not null,
      type        text not null,             -- 'infer' | 'research'
      payload     jsonb not null default '{}',
      status      text not null default 'pending',  -- pending|processing|done|error
      result      jsonb,
      error       text,
      created_at  timestamptz default now(),
      updated_at  timestamptz default now()
    )`).catch(() => {});
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
}

function cors(res: http.ServerResponse) {
  res.writeHead(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end();
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => { buf += c; });
    req.on("end", () => { try { resolve(JSON.parse(buf || "{}")); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

const port = Number(process.env.PORT) || 3000;
const httpServer = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "OPTIONS") { cors(res); return; }

  // ── Health ──────────────────────────────────────────────────────────────
  if (url === "/" || url.startsWith("/health")) {
    try {
      const r = await pool.query("select count(*)::int as n from prospect.prospects");
      json(res, { ok: true, db: true, prospects: r.rows[0].n });
    } catch (e) {
      json(res, { ok: false, db: false, error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  // ── Agent status ────────────────────────────────────────────────────────
  if (url.startsWith("/api/agent/") && method === "GET") {
    const token = url.split("/api/agent/")[1];
    json(res, getAgentStatus(token));
    return;
  }

  // ── v2: personas (for the picker) ─────────────────────────────────────────
  if (url.startsWith("/api/personas") && method === "GET") {
    json(res, listPersonas().map((p) => ({
      id: p.id, name: p.name, offer: p.offer,
      defaultResearchSources: p.defaultResearchSources,
      defaultContactSource: p.defaultContactSource,
    })));
    return;
  }

  // ── v2: which detection path is active (useful for the UI to show the user) ─
  if (url === "/api/infer/status" && method === "GET") {
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    json(res, {
      path: hasKey ? "llm" : "keyword",
      label: hasKey ? "AI (broad — any business)" : "Keyword (4 presets)",
      llmModel: hasKey ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5") : null,
      queueAvailable: true, // chat-drain path always available as backup
    });
    return;
  }

  // ── v2: infer persona from the seller's own website (onboarding) ──────────
  if (url === "/api/infer" && method === "POST") {
    const body = (await readBody(req)) as { url?: string };
    if (!body.url) { json(res, { error: "url required" }, 400); return; }
    try {
      // API-call model: if ANTHROPIC_API_KEY is set, the server calls the LLM
      // synchronously (instant + broad — ANY business + ICP + sources). No key →
      // null → fall back to the instant keyword matcher. Either way it's one
      // request → one response. No listen-loop, no queue.
      const llm = await inferFromUrlLlm(body.url).catch(() => null);
      if (llm) { json(res, { ...llm, source: "llm" }); return; }
      const result = await inferFromUrl(body.url);
      json(res, { ...result, source: "keyword" });
    } catch (e) {
      json(res, { error: e instanceof Error ? e.message : String(e) }, 400);
    }
    return;
  }

  // ── v2: request queue — web enqueues, local Claude drains ─────────────────
  if (url === "/api/request" && method === "POST") {
    const body = (await readBody(req)) as { agent_token?: string; type?: string; payload?: unknown };
    if (!body.agent_token || !body.type) { json(res, { error: "agent_token + type required" }, 400); return; }
    try {
      const r = await pool.query(
        `insert into prospect.requests (agent_token, type, payload) values ($1,$2,$3::jsonb) returning id`,
        [body.agent_token, body.type, JSON.stringify(body.payload || {})],
      );
      json(res, { id: r.rows[0].id, status: "pending" });
    } catch (e) { json(res, { error: e instanceof Error ? e.message : String(e) }, 500); }
    return;
  }

  // web UI polls this for the result
  if (url.startsWith("/api/request/") && method === "GET") {
    const id = url.split("/api/request/")[1].split("?")[0];
    const r = await pool.query(`select status, result, error from prospect.requests where id=$1`, [id]).catch(() => ({ rows: [] }));
    json(res, r.rows[0] || { status: "unknown" });
    return;
  }

  // ── v2: scaffold a Research Plan from persona + who + where ────────────────
  if (url === "/api/scaffold" && method === "POST") {
    const body = (await readBody(req)) as { persona?: string; vertical?: string; region?: string };
    if (!body.persona || !body.vertical || !body.region) {
      json(res, { error: "persona, vertical, region required" }, 400);
      return;
    }
    try {
      const plan = scaffoldPlan(body.persona, body.vertical, body.region);
      const v = safeParseResearchPlan(plan); // self-check the scaffold validates
      if (!v.success) { json(res, { error: "scaffold invalid", issues: v.error.issues }, 500); return; }
      json(res, plan);
    } catch (e) {
      json(res, { error: e instanceof Error ? e.message : String(e) }, 400);
    }
    return;
  }

  // ── Seller profile ──────────────────────────────────────────────────────
  if (url.startsWith("/api/brand") && method === "GET") {
    const token = new URL(url, "http://x").searchParams.get("token") || "";
    const r = await pool.query("select * from prospect.seller_profiles where agent_token=$1", [token]).catch(() => ({ rows: [] }));
    json(res, r.rows[0] || null);
    return;
  }

  if (url === "/api/brand" && method === "POST") {
    const body = await readBody(req) as Record<string, unknown>;
    const { agent_token, seller_name, offer, value_prop, fixes, target_verticals, min_reviews, persona,
            icp, customer_types, competitor_hint, suggested_sources, services } = body;
    if (!agent_token) { json(res, { error: "agent_token required" }, 400); return; }
    try {
      await pool.query(`
        insert into prospect.seller_profiles
          (agent_token, seller_name, offer, value_prop, fixes, target_verticals, min_reviews, persona,
           icp, customer_types, competitor_hint, suggested_sources, services, updated_at)
        values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,now())
        on conflict (agent_token) do update set
          seller_name=$2, offer=$3, value_prop=$4, fixes=$5, target_verticals=$6::jsonb,
          min_reviews=$7, persona=$8, icp=$9, customer_types=$10::jsonb,
          competitor_hint=$11, suggested_sources=$12::jsonb, services=$13::jsonb, updated_at=now()
      `, [agent_token, seller_name, offer, value_prop, fixes,
          JSON.stringify(target_verticals || []), min_reviews || 25, persona || null,
          icp || null, JSON.stringify(customer_types || []), competitor_hint || null,
          JSON.stringify(suggested_sources || []), JSON.stringify(services || [])]);
      json(res, { ok: true });
    } catch (e) {
      json(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
    return;
  }

  // ── Prospects list ──────────────────────────────────────────────────────
  if (url.startsWith("/api/prospects") && method === "GET") {
    const params = new URL(url, "http://x").searchParams;
    const token = params.get("token") || "";
    const r = await pool.query(`
      select id, name, domain, grade_tier, priority, ai_mentions, review_count,
             dossier, research_status, researched_at
      from prospect.prospects where research_status='researched'
      order by priority desc nulls last, review_count desc nulls last
    `).catch(() => ({ rows: [] }));

    // Load seller profile for relevance scoring
    const sp = await pool.query("select * from prospect.seller_profiles where agent_token=$1", [token]).catch(() => ({ rows: [] }));
    const sellerProfile = sp.rows[0] || null;

    const rows = r.rows.map((row) => {
      const flat = flattenDossier(row.dossier) as Record<string, string>;
      const rv = scoreRelevance(row.dossier, sellerProfile ? {
        sellerName: sellerProfile.seller_name || "your studio",
        offer: sellerProfile.offer || "",
        valueProp: sellerProfile.value_prop || "",
        fixes: sellerProfile.fixes || "",
        targetVerticals: sellerProfile.target_verticals || [],
        minReviews: sellerProfile.min_reviews || 25,
      } : undefined);
      return {
        id: row.id, name: row.name, domain: row.domain,
        grade: row.grade_tier, score: row.priority,
        ai_mentions: row.ai_mentions, reviews: row.review_count,
        researched_at: row.researched_at,
        relevance_tier: rv.tier, relevance_score: rv.score,
        verdict: rv.verdict,
        subject_headline: flat.subject_headline,
        founder_name: flat.founder_name, founder_email: flat.founder_email,
        founder_linkedin: flat.founder_linkedin,
        dm2_name: flat.dm2_name, dm2_email: flat.dm2_email,
        top_problem: flat.top_3_ai_problems?.split("|")[0]?.trim() || "",
        pitch: flat.pitch?.slice(0, 200),
      };
    });

    // Sort by relevance then grade
    const TIER = { highly_relevant: 0, moderate: 1, not_relevant: 2 };
    rows.sort((a, b) => (TIER[a.relevance_tier as keyof typeof TIER] ?? 9) - (TIER[b.relevance_tier as keyof typeof TIER] ?? 9) || (b.score ?? 0) - (a.score ?? 0));
    json(res, rows);
    return;
  }

  // ── Serve static UI ─────────────────────────────────────────────────────
  if (url === "/app" || url.startsWith("/app")) {
    const uiPath = resolve(paths.projectRoot, "public", "index.html");
    if (existsSync(uiPath)) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(readFileSync(uiPath, "utf-8"));
    } else {
      res.writeHead(302, { location: "/" });
      res.end();
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

// Attach WebSocket bridge
attachBridge(httpServer);

// Safety net: a stray DB/handler error must NEVER kill the server process.
process.on("unhandledRejection", (e) => console.error("[server] unhandledRejection (non-fatal):", e instanceof Error ? e.message : e));
process.on("uncaughtException", (e) => console.error("[server] uncaughtException (non-fatal):", e instanceof Error ? e.message : e));

httpServer.listen(port, () => console.log(`[server] running on :${port} — UI at /app`));

migrate()
  .then(() => migrateBridgeTasks())
  .then(() => console.log("[server] migrations applied"))
  .catch((e) => console.error("[server] migration failed:", e instanceof Error ? e.message : e));
