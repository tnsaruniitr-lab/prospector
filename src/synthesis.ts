// Diagnosis synthesis — turns DETECTED signals into the top-3 AI-search problems
// + top-3 fixes + a catchy hook, each problem tagged with an evidence badge so
// "measured" is visibly separated from "inferred" (mirrors the website auditor's
// truth-badge system). Rules-driven and repeatable — no hand-written narrative.

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
  hasLocalBusiness: boolean;
  hasPerson: boolean;
  hasFAQ: boolean;
  hasAggregateRating: boolean;
  renderedWords?: number | null;
  images?: number | null;
  imagesNoAlt?: number | null;
  hreflang?: string[];
  slowMs?: number | null;
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
  {
    when: (i) => !i.hasLocalBusiness,
    weight: 100,
    problem: (i) => ({ text: `AI can't identify the business — no LocalBusiness/MedicalBusiness schema, so ChatGPT & Gemini can't confidently say what or where ${i.name} is.`, evidence: "hard" }),
    fix: () => "Add LocalBusiness/MedicalClinic schema (name, geo, services, hours) so AI can identify and place the business.",
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
  {
    when: (i) => !i.hasAggregateRating,
    weight: 50,
    problem: () => ({ text: `No review schema (AggregateRating) — the trust signal AI and Google use to pick sources is missing.`, evidence: "hard" }),
    fix: () => "Add AggregateRating/Review schema so ratings render and trust is machine-readable.",
  },
  {
    when: (i) => i.images != null && i.imagesNoAlt != null && i.images > 0 && i.imagesNoAlt / i.images > 0.3,
    weight: 30,
    problem: (i) => ({ text: `On-page hygiene — ${i.imagesNoAlt}/${i.images} images missing alt text${i.hreflang && !i.hreflang.length ? "; no hreflang for a multilingual audience" : ""}.`, evidence: "measured" }),
    fix: () => "Add alt text to images and declare hreflang for EN/AR audiences.",
  },
];

export function synthesizeDiagnosis(i: DiagnosisInput): {
  problems: DiagnosisProblem[];
  fixes: string[];
  hook: string;
} {
  const fired = RULES.filter((r) => r.when(i)).sort((a, b) => b.weight - a.weight);
  const top = fired.slice(0, 3);
  return {
    problems: top.map((r) => r.problem(i)),
    fixes: top.map((r) => r.fix(i)),
    hook: buildHook(i, top),
  };
}

function buildHook(i: DiagnosisInput, top: Rule[]): string {
  const biggest = top[0]?.problem(i).text ?? "";
  if (i.categoryLeader && i.aiMentions != null) {
    return `AI search for ${i.category ?? "this category"}${i.geo ? ` in ${i.geo}` : ""} is wide open — even the leader (${i.categoryLeader.domain}) has just ${i.categoryLeader.mentions} AI mentions. ${i.name} sits at ${i.aiMentions}${i.starAsset ? ` despite ${i.starAsset}` : ""} — but AI can't see it. ${biggest} Fix that and leapfrog the category before competitors wake up.`;
  }
  return `${i.name} is leaving AI search on the table: ${biggest} Fixing it is the fastest lever to AI visibility.`;
}
