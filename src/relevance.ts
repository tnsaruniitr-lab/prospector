import type { Dossier } from "./dossier.js";

// RELEVANCE / ICP-FIT verdict — complements the commercial grade (gradeDossier).
// The grade scores deal quality (Value×Opportunity×Reachability); this reasons about
// FIT TO YOUR OFFER: do they have the pain you fix, is a competitor already beating
// them in AI (urgency), can you reach them, are they your ICP — and writes the
// per-prospect value prop + "who's selling to / beating them" context. Deterministic.

export interface IcpProfile {
  sellerName: string;        // you / your studio
  offer: string;             // what you sell
  valueProp: string;         // the core promise (verb phrase)
  fixes: string;             // what you actually do
  targetVerticals: string[]; // playbook ids you target
  minReviews: number;        // budget-proxy floor
}

// EDIT THIS to your real offer. Default inferred from the project: an AEO / AI-search
// visibility service for high-ticket local-service + B2B brands.
export const DEFAULT_ICP: IcpProfile = {
  sellerName: "your AEO studio",
  offer: "AEO / AI-search visibility — getting cited by ChatGPT, Gemini & AI Overviews",
  valueProp: "convert an established real-world reputation into AI-search visibility",
  fixes: "add schema + Person/credential markup + an FAQ/answer hub and fix on-page gaps",
  targetVerticals: ["med_spa", "marketing_agency", "law_firm", "dental_implants", "private_clinic"],
  minReviews: 25,
};

export type RelevanceTier = "highly_relevant" | "moderate" | "not_relevant";
export interface RelevanceVerdict {
  tier: RelevanceTier;
  score: number; // 0-100
  valueProp: string;
  competitiveContext: string; // who's beating them in AI + incumbent inference
  factors: { factor: string; detail: string; effect: number }[];
  verdict: string;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, "").match(/^([0-9]*\.?[0-9]+)\s*([kmb])?/i);
  if (!m) return null;
  const mult = ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[(m[2] ?? "").toLowerCase()] ?? 1;
  return parseFloat(m[1]) * mult;
};

export function scoreRelevance(d: Dossier, icp: IcpProfile = DEFAULT_ICP): RelevanceVerdict {
  const factors: RelevanceVerdict["factors"] = [];
  let score = 0;
  const gaps = d.weakPoints?.length ?? 0;
  const ai = num(d.competitive.aiVisibility?.mentions);
  const leader = d.competitive.categoryAiLeader;
  const leaderM = num(leader?.mentions);
  const reviews = num(d.googleReviews);
  const authority = num(d.competitive.authorityScore);
  const f = d.contacts.founder, dm2 = d.contacts.decisionMaker2;

  // 1. PAIN FIT — do they have the gaps you fix? (the core relevance driver)
  const pain = Math.min(40, gaps * 6 + (ai != null && ai < 30 ? 12 : 0));
  if (pain > 0) { score += pain; factors.push({ factor: "Pain fit", detail: `${gaps} AEO/SEO gaps you fix${ai != null ? ` · ${ai} AI mentions` : ""}`, effect: pain }); }

  // 2. COMPETITIVE URGENCY — is a named competitor already beating them in AI?
  let compCtx = "";
  if (leader && leaderM != null && ai != null) {
    const ratio = ai > 0 ? leaderM / ai : leaderM || 0;
    if (ratio >= 2) {
      const u = Math.min(20, Math.round(ratio * 1.5));
      score += u;
      compCtx = `${leader.domain} is winning AI in their category (${leaderM} mentions vs their ${ai}) — a rival is already capturing the AI demand they're missing.`;
      factors.push({ factor: "Competitive urgency", detail: compCtx, effect: u });
    } else if (ai > leaderM) {
      compCtx = `they already lead the category in AI (${ai} vs ${leader.domain}'s ${leaderM}) — defensive, not catch-up.`;
    } else {
      compCtx = `roughly at parity with the AI leader (${leader.domain} ${leaderM} vs ${ai}).`;
    }
  }

  // 3. VALUE / budget
  if (reviews != null && reviews >= icp.minReviews) { const v = Math.min(20, Math.round(Math.log10(reviews + 1) * 8)); score += v; factors.push({ factor: "Budget / established", detail: `${reviews} reviews — real, money-making business`, effect: v }); }
  else if (authority != null && authority >= 20) { score += 10; factors.push({ factor: "Budget / established", detail: `Authority ${authority} (established domain)`, effect: 10 }); }
  else { score -= 8; factors.push({ factor: "Budget / established", detail: `thin footprint (<${icp.minReviews} reviews) — budget unclear`, effect: -8 }); }

  // 4. REACHABILITY
  if ((f?.linkedin && f.linkedinVerified) || f?.email) { score += 15; factors.push({ factor: "Reachable", detail: `verified/contactable decision-maker (${f?.name})`, effect: 15 }); }
  else if (dm2?.email || dm2?.linkedin || d.contacts.businessEmail) { score += 8; factors.push({ factor: "Reachable", detail: `a contact channel exists (DM2 / business inbox)`, effect: 8 }); }
  else { score -= 10; factors.push({ factor: "Reachable", detail: `no reachable decision-maker captured`, effect: -10 }); }

  // 5. ICP fit (vertical)
  const inIcp = icp.targetVerticals.some((v) => d.category === v || d.category.includes(v) || v.includes(d.category));
  if (!inIcp) { score -= 12; factors.push({ factor: "ICP fit", detail: `"${d.category}" is outside your target verticals`, effect: -12 }); }

  // 6. DISQUALIFIER — already optimised → little to sell
  if (gaps <= 1 && ai != null && ai >= 50) { score -= 25; factors.push({ factor: "Already optimised", detail: `few gaps + strong AI presence — little to sell`, effect: -25 }); }

  score = Math.max(0, Math.min(100, score));
  const tier: RelevanceTier = score >= 65 ? "highly_relevant" : score >= 40 ? "moderate" : "not_relevant";

  // Incumbent inference — who's doing their marketing now?
  const optimised = (d.audit.hasLocalBusiness && d.audit.hasPerson) || gaps <= 2;
  const incumbent = optimised
    ? "their site is already fairly optimised — someone competent (in-house or an agency) handles it, so you'd be displacing/augmenting an incumbent."
    : "their on-page/AEO is raw — nobody is doing their AI-search optimisation, so it's wide open for you.";

  const topGap = d.weakPoints?.[0]?.gap ?? "AEO/AI-visibility gaps";
  const valueProp = `${icp.sellerName} sells ${icp.offer}. For ${d.name}: ${topGap} — you'd ${icp.fixes} to ${icp.valueProp}.`;

  const label = tier === "highly_relevant" ? "HIGHLY RELEVANT" : tier === "moderate" ? "MODERATE" : "NOT RELEVANT";
  const verdict = `${label} (${score}/100). ${compCtx} ${incumbent}` +
    (factors.find((x) => x.factor === "Reachable" && x.effect < 0) ? " ⚠ no reachable decision-maker yet — fix before outreach." : "");

  return { tier, score, valueProp, competitiveContext: `${compCtx} ${incumbent}`.trim(), factors, verdict };
}
