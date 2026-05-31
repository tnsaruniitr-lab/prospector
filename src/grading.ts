import type { Dossier } from "./dossier.js";

// Relevance grade — "is this prospect worth reaching out to?"
// Composite of Value (budget/size) × Opportunity (how compelling the pitch) ×
// Reachability (can we actually contact a decision-maker). Pure + deterministic.

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const num = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface Grade {
  score: number;            // 0-100
  tier: "A" | "B" | "C" | "D";
  value: number;            // 0-1
  opportunity: number;      // 0-1
  reachability: number;     // 0-1
  reasons: string[];
}

/** Worth-it axis: real, active, money-making business. Google reviews if we have
 *  them (from discovery), else an authority-score proxy. */
function valueScore(d: Dossier): number {
  if (d.googleReviews != null) {
    const reviews = clamp(Math.log10(d.googleReviews + 1) / Math.log10(300), 0, 1);
    const rating = d.googleRating == null ? 0.6
      : d.googleRating >= 4.5 ? 1 : d.googleRating >= 4 ? 0.85 : d.googleRating >= 3.5 ? 0.55 : 0.3;
    return clamp(0.7 * reviews + 0.3 * rating, 0, 1);
  }
  const auth = num(d.competitive.authorityScore) ?? 0;
  return clamp(auth / 45, 0.05, 1); // Authority ~45 = strong
}

/** Sellable-gap axis: more AEO/SEO gaps + lower AI visibility = more to pitch. */
function opportunityScore(d: Dossier): number {
  const a = d.audit;
  let o = 0;
  if (!a.hasLocalBusiness) o += 0.25;
  if (!a.hasPerson) o += 0.2;
  if (!a.hasFAQ) o += 0.2;
  if (!a.hasAggregateRating) o += 0.1;
  const ai = num(d.competitive.aiVisibility?.mentions) ?? 999;
  if (ai < 30) o += 0.2;
  return clamp(o, 0, 1);
}

/** Can-we-act axis: verified founder > founder contact > DM2 > business inbox > none. */
function reachabilityScore(d: Dossier): number {
  const f = d.contacts.founder, dm2 = d.contacts.decisionMaker2;
  if (f?.linkedin && f.linkedinVerified) return 1.0;
  if (f?.email || f?.linkedin) return 0.7;
  if (dm2?.linkedin || dm2?.email) return 0.6;
  if (d.contacts.businessEmail || d.contacts.whatsapp) return 0.4;
  return 0.1;
}

export function gradeDossier(d: Dossier): Grade {
  const value = valueScore(d), opportunity = opportunityScore(d), reachability = reachabilityScore(d);
  let score = Math.round(100 * (0.35 * value + 0.45 * opportunity + 0.20 * reachability));
  const reasons: string[] = [];

  if (opportunity >= 0.6) reasons.push("strong pitch — multiple AEO/AI gaps");
  if (reachability >= 0.9) reasons.push("verified founder reachable");
  else if (reachability < 0.3) { score = Math.min(score, 40); reasons.push("decision-maker not reachable"); }
  if (value < 0.2) { score = Math.min(score, 50); reasons.push("low value / small footprint"); }
  else if (value >= 0.55) reasons.push("established — budget likely");

  const tier = score >= 70 ? "A" : score >= 50 ? "B" : score >= 30 ? "C" : "D";
  return {
    score, tier,
    value: +value.toFixed(2), opportunity: +opportunity.toFixed(2), reachability: +reachability.toFixed(2),
    reasons,
  };
}

/**
 * Value-only pre-grade for a DISCOVERED (not-yet-researched) candidate, so the
 * research queue is ranked by value (reviews) — work the high-value ones first.
 * Capped below a researched A/B; the full grade replaces it after research.
 */
export function gradeCandidate(reviews: number | null, rating: number | null): { score: number; tier: "Q"; reasons: string[] } {
  const r = reviews != null ? clamp(Math.log10(reviews + 1) / Math.log10(300), 0, 1) : 0;
  const rt = rating == null ? 0.6 : rating >= 4.5 ? 1 : rating >= 4 ? 0.85 : rating >= 3.5 ? 0.55 : 0.3;
  const value = clamp(0.7 * r + 0.3 * rt, 0, 1);
  return { score: Math.round(value * 55), tier: "Q", reasons: [`queued · value ${value.toFixed(2)} (${reviews ?? 0} reviews)`] };
}
