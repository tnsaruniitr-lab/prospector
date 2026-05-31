import { pool } from "./db.js";
const r = await pool.query(`
  select name as business,
         dossier->'contacts'->'founder'->>'name' as founder,
         dossier->'contacts'->'founder'->>'role' as role,
         coalesce(dossier->'contacts'->'founder'->>'email','—') as founder_email,
         case when dossier->'contacts'->'founder'->>'linkedin' is not null then 'yes' else '—' end as linkedin,
         coalesce(dossier->'contacts'->'founder'->>'linkedinVerified','false') as verified
  from prospect.prospects
  where city='Miami, FL' and research_status='researched'
  order by priority desc nulls last`);
console.log("\nFounder verification status (from Railway):");
console.table(r.rows);
const v = await pool.query(`select count(*)::int n from prospect.prospects
  where city='Miami, FL' and (dossier->'contacts'->'founder'->>'linkedinVerified')='true'`);
console.log(`Verified founders: ${v.rows[0].n} / 10`);
await pool.end();
