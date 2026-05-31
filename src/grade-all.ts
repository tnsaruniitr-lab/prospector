import { q, T, pool } from "./db.js";
import { gradeDossier } from "./grading.js";
import type { Dossier } from "./dossier.js";

// Re-rank pass: grade every dossier in the DB and store priority + tier.
// Additive — touches only the grade columns; dossiers/contacts/audits untouched.
const rows = await q<{ id: string; dossier: Dossier }>(
  `select id, dossier from ${T.prospects} where dossier is not null`,
);

const graded = rows
  .map((r) => ({ id: r.id, name: r.dossier.name, ...gradeDossier(r.dossier) }))
  .sort((a, b) => b.score - a.score);

console.log("\nGRADED PROSPECTS (who to reach out to, best first):\n");
for (const g of graded) {
  await q(
    `update ${T.prospects} set priority = $2, grade_tier = $3, grade_reasons = $4 where id = $1`,
    [g.id, g.score, g.tier, g.reasons.join("; ")],
  );
  console.log(
    `  ${g.tier}  ${String(g.score).padStart(3)}  ${g.name.padEnd(18)} ` +
      `value ${g.value} · opp ${g.opportunity} · reach ${g.reachability}  — ${g.reasons.join("; ")}`,
  );
}
console.log(`\n[grade] graded ${graded.length} prospects.`);
await pool.end();
