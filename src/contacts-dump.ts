import { pool } from "./db.js";

// Exactly what decision-maker data is stored for the Miami 10 — no spin.
const rows = await pool.query(`
  select pr.name as business,
         c.name as contact, c.role,
         case when c.linkedin_url is not null then 'yes' else '—' end as linkedin,
         coalesce(c.email,'—') as email,
         coalesce(c.phone,'—') as phone
  from prospect.contacts c
  join prospect.prospects pr on pr.id = c.prospect_id
  where pr.city = 'Miami, FL'
  order by pr.priority desc nulls last, c.role`);
console.log("\nDECISION-MAKERS captured for the Miami 10 (from Railway):");
console.table(rows.rows);

// Business-level channels (stored on the prospect, not the contact row).
const biz = await pool.query(`
  select name as business, coalesce(email,'—') as biz_email,
         coalesce(instagram,'—') as instagram, coalesce(whatsapp,'—') as whatsapp
  from prospect.prospects
  where city='Miami, FL' and research_status='researched'
  order by priority desc nulls last`);
console.log("\nBUSINESS-LEVEL channels:");
console.table(biz.rows);
await pool.end();
