import { pool } from "./db.js";
const r = await pool.query(`
  select name,
         ai_mentions as total,
         dossier->'competitive'->'aiVisibility'->>'chatgpt' as chatgpt,
         dossier->'competitive'->'aiVisibility'->>'aiOverview' as ai_overview,
         dossier->'competitive'->'aiVisibility'->>'aiMode' as ai_mode,
         dossier->'competitive'->'aiVisibility'->>'gemini' as gemini,
         traffic_trend,
         jsonb_array_length(coalesce(dossier->'competitive'->'competitors','[]'::jsonb)) as competitors
  from prospect.prospects
  where city='Miami, FL' and research_status='researched'
  order by ai_mentions desc nulls last`);
console.log("\nPer-engine AI split + trend (from Railway dossier JSONB):");
console.table(r.rows);
await pool.end();
