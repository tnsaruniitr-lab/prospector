import http from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "./db.js";
import { paths } from "./config.js";
import { attachBridge, getAgentStatus } from "./bridge.js";
import { scoreRelevance } from "./relevance.js";
import { flattenDossier } from "./dossier.js";

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

  // ── Seller profile ──────────────────────────────────────────────────────
  if (url.startsWith("/api/brand") && method === "GET") {
    const token = new URL(url, "http://x").searchParams.get("token") || "";
    const r = await pool.query("select * from prospect.seller_profiles where agent_token=$1", [token]).catch(() => ({ rows: [] }));
    json(res, r.rows[0] || null);
    return;
  }

  if (url === "/api/brand" && method === "POST") {
    const body = await readBody(req) as Record<string, unknown>;
    const { agent_token, seller_name, offer, value_prop, fixes, target_verticals, min_reviews } = body;
    if (!agent_token) { json(res, { error: "agent_token required" }, 400); return; }
    await pool.query(`
      insert into prospect.seller_profiles (agent_token, seller_name, offer, value_prop, fixes, target_verticals, min_reviews, updated_at)
      values ($1,$2,$3,$4,$5,$6::jsonb,$7,now())
      on conflict (agent_token) do update set seller_name=$2, offer=$3, value_prop=$4, fixes=$5, target_verticals=$6::jsonb, min_reviews=$7, updated_at=now()
    `, [agent_token, seller_name, offer, value_prop, fixes, JSON.stringify(target_verticals || []), min_reviews || 25]);
    json(res, { ok: true });
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

httpServer.listen(port, () => console.log(`[server] running on :${port} — UI at /app`));

migrate()
  .then(() => migrateBridgeTasks())
  .then(() => console.log("[server] migrations applied"))
  .catch((e) => console.error("[server] migration failed:", e instanceof Error ? e.message : e));
