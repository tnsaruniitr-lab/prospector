import { pool } from "./db.js";

// Prove WHERE we're connected and WHAT is stored — no assertions, just the DB talking.
const url = process.env.DATABASE_URL || "";
const host = url.replace(/\/\/[^@]*@/, "//<redacted>@"); // hide user:password
console.log("Connection target:", host);

const who = await pool.query("select current_database() as db, inet_server_addr() as server_ip");
console.log("current_database:", who.rows[0].db, "· server_ip:", who.rows[0].server_ip);

const counts = await pool.query(`
  select
    (select count(*) from prospect.prospects)::int as prospects_total,
    (select count(*) from prospect.prospects where research_status='researched')::int as researched,
    (select count(*) from prospect.prospects where city='Miami, FL' and research_status='researched')::int as miami_researched,
    (select count(*) from prospect.contacts)::int as contacts,
    (select count(*) from prospect.audits)::int as audits`);
console.table(counts.rows);

// Sample one Miami row straight from Railway, including the JSONB dossier proof.
const sample = await pool.query(`
  select name, domain, grade_tier, priority, authority_score, ai_mentions, review_count,
         (dossier->>'pitch') is not null as has_pitch_json,
         jsonb_array_length(coalesce(dossier->'topAiProblems','[]'::jsonb)) as problems_in_json,
         researched_at
  from prospect.prospects where domain='dolcemedicalspas.com'`);
console.log("\nSample row (Dolce) as stored on Railway:");
console.table(sample.rows);

await pool.end();
