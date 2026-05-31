import { pool } from "./db.js";

// Quick "what's in the DB" check.
const p = await pool.query(
  "select name, domain, geo_city as city, lead_offer, authority_score, ai_mentions, research_status from (select *, city as geo_city from prospect.prospects) s order by name",
);
console.log("\nPROSPECTS:");
console.table(p.rows);

const c = await pool.query(
  `select pr.name as business, co.name, co.role, co.email, co.email_status, co.linkedin_url
   from prospect.contacts co join prospect.prospects pr on pr.id = co.prospect_id
   order by pr.name, co.confidence desc nulls last`,
);
console.log("CONTACTS:");
console.table(c.rows);

await pool.end();
