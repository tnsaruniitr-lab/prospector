import { q, T, pool } from "./db.js";
import { gradeDossier, gradeCandidate } from "./grading.js";
import type { Dossier } from "./dossier.js";

// Rank the whole local pipeline. Researched prospects get the full grade
// (A/B/C/D from Value × Opportunity × Reachability) and become the OUTREACH list;
// discovered-but-unresearched candidates get a value-only pre-grade and form the
// RESEARCH QUEUE, ordered so you work the high-value ones first. Additive.
const rows = await q<{
  id: string; name: string; dossier: Dossier | null;
  review_count: number | null; rating: number | null; research_status: string;
}>(`select id, name, dossier, review_count, rating, research_status from ${T.prospects}`);

const graded = rows.map((r) => {
  const g = r.dossier ? gradeDossier(r.dossier) : gradeCandidate(r.review_count, r.rating);
  return { id: r.id, name: r.name, status: r.research_status, score: g.score, tier: g.tier, reasons: g.reasons.join("; ") };
});

for (const g of graded) {
  await q(`update ${T.prospects} set priority = $2, grade_tier = $3, grade_reasons = $4 where id = $1`, [g.id, g.score, g.tier, g.reasons]);
}

const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
const researched = graded.filter((g) => g.status === "researched").sort(byScore);
const queued = graded.filter((g) => g.status !== "researched").sort(byScore);

console.log("\n══ READY TO REACH OUT (researched, by grade) ══");
for (const g of researched) console.log(`  ${g.tier}  ${String(g.score).padStart(3)}  ${g.name.padEnd(20)} — ${g.reasons}`);

console.log("\n══ RESEARCH QUEUE (discovered, by value — research these next) ══");
for (const g of queued) console.log(`  ${String(g.score).padStart(3)}  ${g.name.padEnd(44)} — ${g.reasons}`);

console.log(`\n[grade] ${researched.length} researched · ${queued.length} queued.`);
await pool.end();
