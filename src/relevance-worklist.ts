// Prioritised outreach worklist — orders researched prospects by:
//   1. ICP relevance (highly_relevant > moderate > not_relevant)
//   2. Commercial grade (A > B > C > D)
// Reads live from Railway, computes relevance at query time from the dossier JSONB.
import { pool } from "./db.js";
import { scoreRelevance } from "./relevance.js";

const TIER_ORDER: Record<string, number> = { highly_relevant: 0, moderate: 1, not_relevant: 2 };
const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

const rows = await pool.query(`
  select name, grade_tier, priority, ai_mentions, review_count, dossier
  from prospect.prospects
  where research_status = 'researched'
  order by review_count desc nulls last`);

const scored = rows.rows.map((r) => {
  const rv = scoreRelevance(r.dossier);
  return { ...r, rv };
}).sort((a, b) => {
  const td = (TIER_ORDER[a.rv.tier] ?? 9) - (TIER_ORDER[b.rv.tier] ?? 9);
  if (td !== 0) return td;
  const gd = (GRADE_ORDER[a.grade_tier] ?? 9) - (GRADE_ORDER[b.grade_tier] ?? 9);
  if (gd !== 0) return gd;
  return (b.priority ?? 0) - (a.priority ?? 0);
});

// ── Print ──────────────────────────────────────────────────────────────────
let lastTier = "";
for (const r of scored) {
  const tier = r.rv.tier.replace(/_/g, " ").toUpperCase();
  if (tier !== lastTier) { console.log(`\n${"═".repeat(70)}\n${tier}\n${"═".repeat(70)}`); lastTier = tier; }
  const geo = (r.dossier as { geo?: string }).geo ?? "";
  console.log(`\n● ${r.name}  [grade ${r.grade_tier ?? "?"}/${r.priority ?? "?"}]  · ${r.rv.score}/100 relevance  · ${geo}`);
  console.log(`  VERDICT  : ${r.rv.verdict}`);
  console.log(`  PITCH    : ${r.rv.valueProp.slice(0, 140)}…`);
  console.log(`  FACTORS  : ${r.rv.factors.map((f) => `${f.factor}(${f.effect > 0 ? "+" : ""}${f.effect})`).join("  ")}`);
}

const counts = scored.reduce((acc, r) => { acc[r.rv.tier] = (acc[r.rv.tier] ?? 0) + 1; return acc; }, {} as Record<string, number>);
console.log(`\n[worklist] ${scored.length} researched · highly_relevant: ${counts.highly_relevant ?? 0} · moderate: ${counts.moderate ?? 0} · not_relevant: ${counts.not_relevant ?? 0}`);
await pool.end();
