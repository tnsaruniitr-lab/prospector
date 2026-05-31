import { pool } from "./db.js";

// "What's in the DB" — ranked by grade (priority), researched on top.
const p = await pool.query(
  `select name,
          research_status as status,
          grade_tier as tier,
          priority,
          authority_score as auth,
          ai_mentions as ai,
          review_count as reviews
   from prospect.prospects
   order by (research_status = 'researched') desc, priority desc nulls last, review_count desc nulls last`,
);
console.log("\nALL PROSPECTS (graded researched on top, then pending queue):");
console.table(p.rows);

const c = await pool.query("select count(*)::int as n from prospect.contacts");
console.log(`contacts: ${c.rows[0].n}\n`);
await pool.end();
