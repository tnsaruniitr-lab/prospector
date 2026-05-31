import http from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "./db.js";
import { paths } from "./config.js";

// Railway entrypoint. On boot it applies all idempotent migrations (so a deploy
// auto-migrates the DB), then serves a small health endpoint so the service
// stays up. Later this same process can host the round-the-clock worker.
// Runs as compiled JS: `node dist/server.js` (no tsx at runtime).

async function migrate(): Promise<void> {
  const files = readdirSync(paths.migrationsDir)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort();
  for (const name of files) {
    await pool.query(readFileSync(resolve(paths.migrationsDir, name), "utf-8"));
    console.log(`[server] migrated ${name}`);
  }
}

const port = Number(process.env.PORT) || 3000;

http
  .createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url === "/" || url.startsWith("/health")) {
      try {
        const r = await pool.query("select count(*)::int as n from prospect.prospects");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, db: true, prospects: r.rows[0].n }));
      } catch (e) {
        // Service stays up even if the DB isn't reachable yet — easier to debug a deploy.
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, db: false, error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(port, () => console.log(`[server] health endpoint on :${port}`));

migrate()
  .then(() => console.log("[server] migrations applied"))
  .catch((e) => console.error("[server] migration failed (non-fatal):", e instanceof Error ? e.message : e));
