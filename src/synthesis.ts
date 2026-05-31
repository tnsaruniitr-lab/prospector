// Diagnosis synthesis — turns DETECTED signals into ranked AEO + SEO problems +
// fixes + a catchy hook, each problem tagged with an evidence badge so "measured"
// is visibly separated from "inferred". Rules-driven and repeatable — no hand-
// written narrative. `problems`/`fixes` are the top-3 (the pitch); `weakPoints` is
// the FULL audit (every fired rule, ranked) so nothing detected is dropped.

export type EvidenceBadge = "hard" | "measured" | "comparative" | "heuristic";

export interface DiagnosisProblem {
  text: string;
  evidence: EvidenceBadge;
}

export interface DiagnosisInput {
  name: string;
  category?: string;
  geo?: string;
  starAsset?: string | null;
  // AEO / schema
  hasLocalBusiness: boolean;
  hasPerson: boolean;
  hasFAQ: boolean;
  hasAggregateRating: boolean;
  // content + media
  renderedWords?: number | null;
  images?: number | null;
  imagesNoAlt?: number | null;
  hreflang?: string[];
  slowMs?: number | null;
  // SEO hygiene (from audit.js)
  titleLen?: number | null;
  metaDescLen?: number | null;
  h1Count?: number | null;
  hasCanonical?: boolean;
  noindex?: boolean;
  hasViewport?: boolean;
  // competitive / AI
  authorityScore?: number | string | null;
  aiMentions?: number | null;
  citedPages?: number | null;
  trafficTrend?: string | null;
  categoryLeader?: { domain: string; mentions: number; citedPages?: number } | null;
}

interface Rule {
  when: (i: DiagnosisInput) => boolean;
  weight: number;
  problem: (i: DiagnosisInput) => DiagnosisProblem;
  fix: (i: DiagnosisInput) => string;
}

const RULES: Rule[] = [
  // ── AEO / schema ─────────────────────────────────────────────────────────
  {
    when: (i) => !i.hasLocalBusiness,
    weight: 100,
    problem: (i) => ({ text: `AI can't identify the business — no LocalBusiness/MedicalBusiness schema, so ChatGPT & Gemini can't confidently say what or where ${i.name} is.`, evidence: "hard" }),
    fix: () => "Add LocalBusiness/MedicalClinic schema (name, geo, services, hours) so AI can identify and place the business.",
  },
  // ── SEO: page actively blocked from indexing — most severe (invisible everywhere) ──
  {
    when: (i) => !!i.noindex,
    weight: 96,
    problem: () => ({ text: `Critical: the page carries a noindex robots directive — it's actively excluded from Google and most AI crawlers, so it can't rank or be cited at all.`, evidence: "hard" }),
    fix: () => "Remove the noindex robots meta/header so search engines and AI crawlers can index the page.",
  },
  {
    when: (i) => !i.hasPerson,
    weight: 90,
    problem: (i) => ({ text: `${i.starAsset ?? "The lead practitioner"} is invisible to AI — no Person/credential schema, so on YMYL queries AI can't attribute their authority and favours competitors with better markup.`, evidence: "hard" }),
    fix: () => "Add credentialed Person schema (hasCredential, alumniOf, awards) for the lead doctor/owner.",
  },
  {
    when: (i) => !i.hasFAQ || (i.renderedWords != null && i.renderedWords < 800),
    weight: 80,
    problem: (i) => {
      const cited = i.citedPages != null ? ` ${i.name} has ${i.citedPages} AI-cited pages${i.categoryLeader?.citedPages ? ` vs the leader's ${i.categoryLeader.citedPages}` : ""}.` : "";
      return { text: `Nothing to cite — no FAQ schema${i.renderedWords != null ? ` and only ${i.renderedWords} words` : ""}.${cited} AI quotes pages that answer questions.`, evidence: i.citedPages != null ? "measured" : "hard" };
    },
    fix: () => "Build an FAQ/answer hub (cost, safety, procedure questions) with FAQPage schema to win AI-answer citations.",
  },
  {
    when: (i) => typeof i.authorityScore === "number" && i.authorityScore >= 25 && i.aiMentions != null && i.aiMentions < 30,
    weight: 70,
    problem: (i) => ({ text: `Strong SEO authority (${i.authorityScore}) isn't converting to AI — only ${i.aiMentions} AI mentions, because there's no FAQ/answer content for engines to cite.`, evidence: "comparative" }),
    fix: () => "Convert existing authority into AI citations with an FAQ/answer hub + complete schema — the fastest win given the backlink base.",
  },
  {
    when: (i) => !!i.trafficTrend && /[-↓]/.test(i.trafficTrend),
    weight: 60,
    problem: (i) => ({ text: `Declining search footprint — organic traffic ${i.trafficTrend}${i.authorityScore != null ? `, Authority ${i.authorityScore}` : ""}; competitors out-rank on keyword coverage.`, evidence: "measured" }),
    fix: () => "Reclaim lost keywords, refresh thin pages, and earn a few quality backlinks to lift the domain signal AI engines weight.",
  },
  // ── SEO: heading structure ───────────────────────────────────────────────
  {
    when: (i) => i.h1Count != null && (i.h1Count === 0 || i.h1Count > 3),
    weight: 55,
    problem: (i) => ({ text: i.h1Count === 0 ? `No H1 heading — search engines and AI can't read the page's primary topic.` : `${i.h1Count} H1 tags — a broken heading hierarchy dilutes the page's topic signal.`, evidence: "measured" }),
    fix: () => "Use exactly one descriptive H1 (primary service + geo) and demote the rest to H2/H3.",
  },
  {
    when: (i) => !i.hasAggregateRating,
    weight: 50,
    problem: () => ({ text: `No review schema (AggregateRating) — the trust signal AI and Google use to pick sources is missing.`, evidence: "hard" }),
    fix: () => "Add AggregateRating/Review schema so ratings render and trust is machine-readable.",
  },
  // ── SEO: title + meta ────────────────────────────────────────────────────
  {
    when: (i) => i.titleLen != null && (i.titleLen === 0 || i.titleLen > 60 || i.titleLen < 15),
    weight: 45,
    problem: (i) => ({ text: i.titleLen === 0 ? `Missing <title> tag — the single biggest on-page ranking element is absent.` : i.titleLen! > 60 ? `Title tag is ${i.titleLen} chars (>60) — Google truncates it in results, weakening the click signal.` : `Title tag is only ${i.titleLen} chars — too thin to carry keywords + geo.`, evidence: "measured" }),
    fix: () => `Write a 50–60 char title: primary service + city + brand (e.g. "Med Spa Miami | Botox & Fillers | Brand").`,
  },
  {
    when: (i) => i.metaDescLen != null && (i.metaDescLen === 0 || i.metaDescLen > 165),
    weight: 40,
    problem: (i) => ({ text: i.metaDescLen === 0 ? `No meta description — Google writes its own snippet, losing control of the result's pitch.` : `Meta description is ${i.metaDescLen} chars (>165) — it gets truncated in results.`, evidence: "measured" }),
    fix: () => "Write a 140–160 char meta description with the core offer + a call to action.",
  },
  // ── SEO: mobile + canonical + image hygiene ──────────────────────────────
  {
    when: (i) => i.hasViewport === false,
    weight: 35,
    problem: () => ({ text: `No mobile viewport tag — the page isn't declared mobile-friendly, which Google penalises under mobile-first indexing.`, evidence: "measured" }),
    fix: () => `Add a viewport meta (width=device-width, initial-scale=1) and confirm a responsive layout.`,
  },
  {
    when: (i) => i.images != null && i.imagesNoAlt != null && i.images > 0 && i.imagesNoAlt / i.images > 0.3,
    weight: 30,
    problem: (i) => ({ text: `On-page hygiene — ${i.imagesNoAlt}/${i.images} images missing alt text${i.hreflang && !i.hreflang.length ? "; no hreflang for a multilingual audience" : ""}.`, evidence: "measured" }),
    fix: () => "Add descriptive alt text to images (accessibility + image-search + AI context).",
  },
  {
    when: (i) => i.hasCanonical === false,
    weight: 25,
    problem: () => ({ text: `No canonical tag — duplicate/parameter URLs can split ranking signals and confuse crawlers.`, evidence: "heuristic" }),
    fix: () => "Add a self-referencing <link rel=canonical> on each page.",
  },
];

export function synthesizeDiagnosis(i: DiagnosisInput): {
  problems: DiagnosisProblem[];
  fixes: string[];
  hook: string;
  weakPoints: { gap: string; evidence: string; impact: string }[];
  subjectHeadline: string | null;
} {
  const fired = RULES.filter((r) => r.when(i)).sort((a, b) => b.weight - a.weight);
  const top = fired.slice(0, 3);
  return {
    problems: top.map((r) => r.problem(i)),
    fixes: top.map((r) => r.fix(i)),
    hook: buildHook(i, top),
    // FULL audit — every fired rule, ranked. gap = problem, impact = the fix.
    weakPoints: fired.map((r) => ({ gap: r.problem(i).text, evidence: r.problem(i).evidence, impact: r.fix(i) })),
    subjectHeadline: buildSubjectHeadline(i),
  };
}

/**
 * Outreach subject line built from the AI-visibility comparison: the prospect's
 * SEMrush AI mentions vs the category AI leader's (a real competitor we also
 * extracted). Deterministic — the gap IS the hook. Returns null if we lack both.
 */
export function buildSubjectHeadline(i: DiagnosisInput): string | null {
  const leader = i.categoryLeader;
  const brand = i.aiMentions;
  if (!leader || brand == null || leader.mentions == null) return null;
  const comp = leader.domain.replace(/^www\./, "");
  if (brand === 0) return `${i.name} is invisible in AI search — ${comp} owns the answers`;
  const ratio = leader.mentions / brand;
  if (ratio >= 1.5) {
    const x = ratio >= 3 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
    return `${comp} gets ${x} more AI mentions than ${i.name} (${leader.mentions} vs ${brand})`;
  }
  if (brand > leader.mentions) return `${i.name} already out-cites ${comp} in AI (${brand} vs ${leader.mentions}) — lock the lead in`;
  return `${i.name} ${brand} vs ${comp} ${leader.mentions} AI mentions — a closeable gap`;
}

function buildHook(i: DiagnosisInput, top: Rule[]): string {
  const biggest = top[0]?.problem(i).text ?? "";
  if (i.categoryLeader && i.aiMentions != null) {
    return `AI search for ${i.category ?? "this category"}${i.geo ? ` in ${i.geo}` : ""} is wide open — even the leader (${i.categoryLeader.domain}) has just ${i.categoryLeader.mentions} AI mentions. ${i.name} sits at ${i.aiMentions}${i.starAsset ? ` despite ${i.starAsset}` : ""} — but AI can't see it. ${biggest} Fix that and leapfrog the category before competitors wake up.`;
  }
  return `${i.name} is leaving AI search on the table: ${biggest} Fixing it is the fastest lever to AI visibility.`;
}
