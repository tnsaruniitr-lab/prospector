import { pool } from "./db.js";

const r = await pool.query(`
  select p.grade_tier as tier, p.priority as score, p.name,
         p.authority_score as auth, p.ai_mentions as ai, p.review_count as reviews,
         (select count(*) from prospect.contacts c where c.prospect_id = p.id)::int as contacts,
         (p.dossier->'contacts'->'founder'->>'name') as founder
  from prospect.prospects p
  where p.city = 'Miami, FL' and p.research_status = 'researched'
  order by p.priority desc nulls last`);
console.log("\nMIAMI MED SPAS — researched & graded (real DB):");
console.table(r.rows);
await pool.end();
