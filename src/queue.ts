/**
 * Local request queue — the bridge between the web UI and YOUR local Claude.
 *
 * The web UI writes 'pending' requests (a Detect or Research click). Your local
 * Claude (the conversational one already running — no key, no spawned CLI) drains
 * them: read pending → do the work with its own tools → write the result back.
 * The web UI polls and shows the result.
 *
 * Commands:
 *   npx tsx src/queue.ts list                 → pending requests as JSON
 *   npx tsx src/queue.ts take <id>            → mark a request 'processing'
 *   npx tsx src/queue.ts done <id> '<json>'   → write result + mark 'done'
 *   npx tsx src/queue.ts fail <id> '<msg>'    → mark 'error'
 *
 * For OTHER users: same flow on their machine — their web UI writes to their
 * queue, they tell their own local Claude to drain it. Each person talks to
 * their own local Claude; no shared keys, no central LLM.
 */

import { pool } from "./db.js";

const [cmd, id, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "list": {
      const r = await pool.query(
        `select id, agent_token, type, payload, created_at
           from prospect.requests where status='pending' order by created_at asc`,
      );
      console.log(JSON.stringify(r.rows, null, 2));
      break;
    }
    case "take": {
      await pool.query(`update prospect.requests set status='processing', updated_at=now() where id=$1`, [id]);
      console.log(`[queue] ${id} → processing`);
      break;
    }
    case "done": {
      let result: unknown = {};
      try { result = JSON.parse(arg || "{}"); } catch { result = { note: arg }; }
      await pool.query(
        `update prospect.requests set status='done', result=$2::jsonb, updated_at=now() where id=$1`,
        [id, JSON.stringify(result)],
      );
      console.log(`[queue] ${id} → done`);
      break;
    }
    case "fail": {
      await pool.query(`update prospect.requests set status='error', error=$2, updated_at=now() where id=$1`, [id, arg || "error"]);
      console.log(`[queue] ${id} → error`);
      break;
    }
    default:
      console.log("usage: queue.ts list | take <id> | done <id> '<json>' | fail <id> '<msg>'");
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
