import { altaderma, eden } from "./dossier-data.js";
import { recordDossier } from "./record-dossier.js";
import { dbExport } from "./db-export.js";
import { pool } from "./db.js";

// Step-one proof: write the sample dossiers to Railway Postgres, count them,
// then read them back out. Demonstrates the full round-trip dossier ↔ DB.
console.log("[db-flow] writing dossiers → Railway Postgres…");
for (const d of [altaderma, eden]) {
  const id = await recordDossier(d);
  console.log(`  ✓ ${d.name.padEnd(18)} → ${id}`);
}

const p = await pool.query("select count(*)::int as n from prospect.prospects");
const c = await pool.query("select count(*)::int as n from prospect.contacts");
const a = await pool.query("select count(*)::int as n from prospect.audits");
console.log(`[db-flow] DB now holds: ${p.rows[0].n} prospects · ${c.rows[0].n} contacts · ${a.rows[0].n} audits`);

console.log("[db-flow] reading back out of the DB…");
await dbExport();

await pool.end();
