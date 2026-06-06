/**
 * research-run — the deterministic orchestrator.
 *
 * Turns "business type + city" into ONE fixed recipe + a hard completion gate,
 * so a research run is the same every time instead of an agent improvising.
 *
 *   npx tsx src/research-run.ts plan "med spas" "Dubai" 20
 *   npx tsx src/research-run.ts finalize outputs/tmp/<domain>.json
 *   npx tsx src/research-run.ts gate <domain>
 *
 * The agent executes the printed plan by INJECTING the codified extractors
 * (src/browser/*.js — never ad-hoc JS), assembles each Dossier, and persists
 * via finalize → recordDossier (which runs assertDeepResearchComplete). The gate
 * is what stops corner-cutting: a prospect is not "researched" until SEMrush +
 * competitive + LinkedIn + a 2nd decision-maker (or an explicit not-public note)
 * are all present.
 */
import { readFileSync } from "node:fs";
import { normalizeVertical, synthesizeDiagnosis, hasBusinessSchema } from "./synthesis.js";
import { getPersona } from "./personas.js";
import { inferSemrushDatabase } from "./semrush.js";
import { deepResearchGateIssues } from "./research-gate.js";
import { recordDossier } from "./record-dossier.js";
import { q, T, pool } from "./db.js";
import type { Dossier } from "./dossier.js";

const SELLER_PERSONA = "ai_search_visibility"; // your business — AI-search visibility + lead conversion

const CITY_COUNTRY: Record<string, string> = {
  dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates", sharjah: "United Arab Emirates",
  madrid: "Spain", barcelona: "Spain", valencia: "Spain", sevilla: "Spain",
  berlin: "Germany", munich: "Germany", münchen: "Germany", hamburg: "Germany", frankfurt: "Germany", köln: "Germany",
  london: "United Kingdom", manchester: "United Kingdom", birmingham: "United Kingdom",
  miami: "United States", "new york": "United States", "los angeles": "United States", chicago: "United States", austin: "United States",
  istanbul: "Turkey", ankara: "Turkey", riyadh: "Saudi Arabia", jeddah: "Saudi Arabia",
  paris: "France", milan: "Italy", amsterdam: "Netherlands", dublin: "Ireland",
};

function inferMarket(city: string): { country: string; db: string } {
  const c = city.toLowerCase();
  let country = "";
  for (const [k, v] of Object.entries(CITY_COUNTRY)) if (c.includes(k)) { country = v; break; }
  if (!country && c.includes(",")) country = city.split(",").pop()!.trim();
  const db = inferSemrushDatabase(country, city);
  return { country: country || city, db };
}

export interface RunPlan {
  category: string;
  vertical: string;
  sellerPersona: string;
  city: string;
  country: string;
  semrushDb: string;
  count: number;
  mapsUrl: string;
  extractors: Record<string, string>;
  semrushOverviewUrl: (domain: string) => string;
  semrushCompetitorsUrl: (domain: string) => string;
  requiredFields: string[];
}

export function planRun(category: string, city: string, count = 5): RunPlan {
  const vertical = normalizeVertical(category);
  if (!getPersona(SELLER_PERSONA)) throw new Error(`Unknown seller persona ${SELLER_PERSONA}`);
  const { country, db } = inferMarket(city);
  return {
    category, vertical, sellerPersona: SELLER_PERSONA, city, country, semrushDb: db, count,
    mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${category} ${city}`)}`,
    extractors: {
      maps: "src/browser/maps-extract.js",
      audit: "src/browser/audit.js",
      semrush: "src/browser/semrush-extract.js",
      competitors: "src/browser/semrush-competitors.js",
      linkedin: "src/browser/linkedin-people.js",
    },
    semrushOverviewUrl: (d) => `https://www.semrush.com/analytics/overview/?db=${db}&q=${d}&searchType=domain`,
    semrushCompetitorsUrl: (d) => `https://www.semrush.com/analytics/organic/competitors/?db=${db}&q=${d}&searchType=domain`,
    requiredFields: [
      "competitive.primaryCountry + semrushDatabase",
      "SEMrush overview metrics (authority/traffic/keywords/backlinks/refDomains) + AI suite",
      "competitive pass: competitors OR categoryAiLeader (or explicit thin/no-data note)",
      "founder (name/role/linkedin) — verify name+company; else explicit not-public note",
      "2nd decision-maker (DM2) — or explicit 'only founder/owner public' note",
      "business email (find-contacts) + dual-wedge synthesis + relevance",
    ],
  };
}

export function renderPlan(p: RunPlan): string {
  return [
    `RESEARCH RUN — ${p.count} × "${p.category}" in ${p.city}`,
    `  seller persona : ${p.sellerPersona} (AI-search visibility + lead conversion)`,
    `  prospect vertical: ${p.vertical}   |  country: ${p.country}   |  SEMrush db: ${p.semrushDb}`,
    ``,
    `STEP 0 — Discovery (inject ${p.extractors.maps})`,
    `   navigate: ${p.mapsUrl}`,
    `   → pick top ${p.count} by reputation (reviews) that fit the ICP. Confirm the list.`,
    ``,
    `PER PROSPECT (inject the codified extractor each time — NO ad-hoc JS):`,
    `   1. Audit      — navigate site, inject ${p.extractors.audit}  (schema, Person/FAQ/AggregateRating, h1/h2, words, conversion signals)`,
    `   2. SEMrush    — navigate <overview db=${p.semrushDb}>, inject ${p.extractors.semrush}  (authority/traffic/trend/keywords/backlinks/refDomains + full AI suite)`,
    `   3. Competitors— navigate <competitors db=${p.semrushDb}>, inject ${p.extractors.competitors} → run overview on top 2-3 real peers → set categoryAiLeader + ai_competitor_2`,
    `   4. Email      — npx tsx src/find-contacts.ts <domain>  (business email + people)`,
    `   5. LinkedIn   — founder + DM2 via company People page / Google site:linkedin.com/in; verify name+company → linkedinVerified`,
    `   6. Persist    — write the Dossier JSON, then: npx tsx src/research-run.ts finalize <file.json>`,
    `                   (runs the GATE; if it fails, fill the named gap and re-run — never bypass with saveProspect)`,
    ``,
    `DEFINITION OF DONE (gate-enforced per prospect):`,
    ...p.requiredFields.map((f) => `   ✓ ${f}`),
    ``,
    `After the batch: npx tsx src/db-export.ts  → prospect-dossier-from-db-final.csv + .xlsx`,
  ].join("\n");
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, "").match(/([0-9.]+)\s*([kmb])?/i);
  if (!m) return null;
  const mult = ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[(m[2] ?? "").toLowerCase()] ?? 1;
  return parseFloat(m[1]) * mult;
}

/** Regenerate the pitch fields from the captured signals via the deterministic
 *  rules engine — so problems/fixes/hook/subject/weakPoints are code-derived,
 *  not free text the agent typed. Leaves `pitch`/`priorityNote` (narrative) as-is. */
export function recomputeSynthesis(d: Dossier): void {
  const a = d.audit, c = d.competitive, ai = c.aiVisibility ?? {};
  const vertical = normalizeVertical(d.category);
  const leader = c.categoryAiLeader;
  const f = d.contacts?.founder;
  const s = synthesizeDiagnosis({
    name: d.name, category: d.category, geo: d.geo, vertical,
    starAsset: f?.name ? `${f.role ?? "The founder"} ${f.name}` : null,
    hasLocalBusiness: hasBusinessSchema(a.schemaTypes, vertical),
    hasPerson: !!a.hasPerson, hasFAQ: !!a.hasFAQ, hasAggregateRating: !!a.hasAggregateRating,
    renderedWords: a.renderedWords ?? null, images: a.images ?? null, imagesNoAlt: a.imagesNoAlt ?? null,
    titleLen: a.title ? a.title.length : null, metaDescLen: a.metaDescLen ?? null, h1Count: a.h1Count ?? null,
    authorityScore: num(c.authorityScore), aiMentions: num(ai.mentions), citedPages: num(ai.citedPages),
    trafficTrend: c.trafficTrend ?? null,
    categoryLeader: leader ? { domain: leader.domain, mentions: num(leader.mentions) ?? 0, citedPages: num(leader.citedPages) ?? undefined } : null,
  });
  d.topAiProblems = s.problems;
  d.topFixes = s.fixes;
  d.hook = s.hook;
  d.weakPoints = s.weakPoints;
  if (s.subjectHeadline) d.subjectHeadline = s.subjectHeadline;
}

export async function finalizeProspect(d: Dossier, opts: { recompute?: boolean } = {}): Promise<{ ok: boolean; issues: string[]; id?: string }> {
  if (opts.recompute !== false) recomputeSynthesis(d); // deterministic synthesis
  const issues = deepResearchGateIssues(d);
  if (issues.length) return { ok: false, issues };
  const id = await recordDossier(d); // gated again inside; persists to STORAGE target
  return { ok: true, issues: [], id };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "plan") {
  const [category, city, count] = rest;
  if (!category || !city) { console.error('usage: research-run.ts plan "<category>" "<city>" [count]'); process.exit(1); }
  console.log(renderPlan(planRun(category, city, count ? parseInt(count) : 5)));
  process.exit(0);
} else if (cmd === "finalize") {
  const file = rest[0];
  if (!file) { console.error("usage: research-run.ts finalize <dossier.json>"); process.exit(1); }
  const d = JSON.parse(readFileSync(file, "utf-8")) as Dossier;
  const r = await finalizeProspect(d);
  if (r.ok) { console.log(`✅ ${d.domain} passed the gate → saved (${r.id})`); await pool.end(); process.exit(0); }
  console.error(`❌ ${d.domain} BLOCKED by gate — fill these, then re-run:\n   - ${r.issues.join("\n   - ")}`);
  await pool.end(); process.exit(2);
} else if (cmd === "gate") {
  const domain = rest[0];
  const rows = await q<{ dossier: Dossier }>(`select dossier from ${T.prospects} where domain=$1`, [domain]);
  if (!rows.length) { console.error(`no dossier for ${domain}`); await pool.end(); process.exit(1); }
  const issues = deepResearchGateIssues(rows[0].dossier);
  console.log(issues.length ? `❌ ${domain} gate issues:\n   - ${issues.join("\n   - ")}` : `✅ ${domain} passes the gate`);
  await pool.end(); process.exit(issues.length ? 2 : 0);
} else if (cmd) {
  console.error(`unknown command "${cmd}" — use: plan | finalize | gate`);
  process.exit(1);
}
