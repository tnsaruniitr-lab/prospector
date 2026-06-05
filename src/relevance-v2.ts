/**
 * Relevance v2 — persona-aware, evidence-linked prospect scoring.
 *
 * Spec: docs/configurable-sources-design.md ("Relevance" section).
 *
 * Improvements over v1:
 *   - Composite CAPACITY (reviews + ads + pricing + funding + hiring), not just reviews
 *   - SWEET-SPOT scale: proximity to the persona's ideal band, NOT "bigger = better"
 *   - TIMING triggers ("why now"): declining traffic, competitor delta, hiring, stale content
 *   - PERSONA-WEIGHTED: each seller weights pain/capacity/scale/reach/timing differently
 *   - HARD DISQUALIFIERS run first, separate from soft scores
 *   - EVIDENCE-LINKED rationale: the "why", tied to the actual signals
 *
 * HONEST CEILING: web signals are PROXIES for budget, not ground truth. Scores are
 * evidence-based estimates, never "they will pay $X". Thresholds are provisional
 * until calibrated against real outcomes (replies/deals).
 */

import type { SellerPersona, ScaleBand } from "./personas.js";

export interface RelevanceInput {
  vertical: string;
  inTargetVertical?: boolean; // false → wrong_vertical disqualifier may apply
  hasWebsite: boolean;

  // pain
  painGaps: number; // count of pain signals triggered

  // capacity proxies (any subset; more = better estimate)
  reviewCount?: number;
  headcount?: number;
  runningAds?: boolean;
  pricingTier?: "budget" | "mid" | "premium";
  funding?: "none" | "bootstrapped" | "funded" | "public";
  hiring?: boolean;

  // scale metric values (the engine picks the one the persona's band uses)
  organicTraffic?: number;

  // reachability
  verifiedFounder?: boolean;
  founderEmail?: boolean;
  dm2?: boolean;

  // timing triggers
  trafficDeclining?: boolean;
  competitorDelta?: number; // leader / their ratio
  staleContent?: boolean;
  openRoles?: number;

  // persona-specific disqualifier flags
  alreadyDominant?: boolean;
  siteAlreadyModern?: boolean;
}

export interface RelevanceFactor {
  factor: string;
  sub: number; // 0-100 sub-score
  weight: number;
  contribution: number; // weighted points toward the final
}

export interface RelevanceResult {
  tier: "highly_relevant" | "moderate" | "not_relevant";
  score: number; // 0-100
  capacity: number;
  scale: number;
  painFit: number;
  reachable: number;
  timing: number;
  disqualified: boolean;
  disqualifier?: string;
  factors: RelevanceFactor[];
  rationale: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

// ── Composite paying-capacity (0-100) ──────────────────────────────────────
function capacityScore(i: RelevanceInput): number {
  let s = 0;
  if (i.reviewCount != null) s += clamp(Math.log10(i.reviewCount + 1) * 22, 0, 45); // reviews → up to 45
  if (i.runningAds) s += 20; // already spends on marketing = budget + intent
  if (i.pricingTier === "premium") s += 20;
  else if (i.pricingTier === "mid") s += 10;
  if (i.funding === "public") s += 30;
  else if (i.funding === "funded") s += 20;
  else if (i.funding === "bootstrapped") s += 5;
  if (i.hiring) s += 10;
  if (i.headcount != null) s += clamp(Math.log10(i.headcount + 1) * 12, 0, 30); // headcount → up to 30
  return clamp(round(s));
}

// ── Sweet-spot scale (0-100) — proximity to the band, not "bigger=better" ──
function scaleScore(i: RelevanceInput, band: ScaleBand): number {
  const v =
    band.metric === "review_count" ? i.reviewCount :
    band.metric === "headcount" ? i.headcount :
    i.organicTraffic;
  if (v == null) return 50; // unknown → neutral, don't punish
  if (v < band.tooSmall) return 10;
  if (v < band.idealLow) return round(30 + (70 * (v - band.tooSmall)) / (band.idealLow - band.tooSmall)); // 30→100
  if (v <= band.idealHigh) return 100; // sweet spot
  if (v <= band.tooBig) return round(100 - (60 * (v - band.idealHigh)) / (band.tooBig - band.idealHigh)); // 100→40
  return 20; // too big — slow, unreachable, probably already served
}

function painFitScore(i: RelevanceInput): number {
  return clamp(i.painGaps * 22); // each triggered pain signal contributes
}

function reachableScore(i: RelevanceInput): number {
  if (i.verifiedFounder && i.founderEmail) return 100;
  if (i.verifiedFounder) return 70;
  if (i.dm2) return 50;
  if (i.founderEmail) return 45;
  return 10;
}

// ── Timing / "why now" (0-100) ──────────────────────────────────────────────
function timingScore(i: RelevanceInput): number {
  let s = 20; // neutral base
  if (i.trafficDeclining) s += 30;
  if (i.competitorDelta != null && i.competitorDelta >= 2) s += 30;
  if (i.staleContent) s += 20;
  if (i.openRoles != null && i.openRoles > 0) s += 30;
  if (i.hiring) s += 10;
  return clamp(s);
}

// ── Hard disqualifiers (run first) ──────────────────────────────────────────
function checkDisqualifiers(i: RelevanceInput, persona: SellerPersona): string | null {
  for (const d of persona.disqualifiers) {
    if (d === "no_website" && !i.hasWebsite) return "no_website";
    if (d === "wrong_vertical" && i.inTargetVertical === false) return "wrong_vertical";
    if ((d === "already_ai_dominant" || d === "already_dominant_organic") && i.alreadyDominant) return d;
    if (d === "site_already_modern" && i.siteAlreadyModern) return "site_already_modern";
    if (d === "not_hiring" && !i.hiring && (i.openRoles ?? 0) === 0) return "not_hiring";
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────
export function scoreRelevanceV2(i: RelevanceInput, persona: SellerPersona): RelevanceResult {
  const disq = checkDisqualifiers(i, persona);

  const painFit = painFitScore(i);
  const capacity = capacityScore(i);
  const scale = scaleScore(i, persona.idealScale);
  const reachable = reachableScore(i);
  const timing = timingScore(i);

  const w = persona.relevanceWeights;
  const totalW = w.painFit + w.capacity + w.scale + w.reachable + w.timing;
  const factors: RelevanceFactor[] = [
    { factor: "pain fit", sub: painFit, weight: w.painFit, contribution: (painFit * w.painFit) / totalW },
    { factor: "capacity", sub: capacity, weight: w.capacity, contribution: (capacity * w.capacity) / totalW },
    { factor: "scale fit", sub: scale, weight: w.scale, contribution: (scale * w.scale) / totalW },
    { factor: "reachable", sub: reachable, weight: w.reachable, contribution: (reachable * w.reachable) / totalW },
    { factor: "timing", sub: timing, weight: w.timing, contribution: (timing * w.timing) / totalW },
  ];

  let score = round(factors.reduce((a, f) => a + f.contribution, 0));

  // A hard disqualifier caps the score and forces not_relevant.
  if (disq) score = Math.min(score, 20);

  const tier: RelevanceResult["tier"] =
    disq ? "not_relevant" : score >= 65 ? "highly_relevant" : score >= 40 ? "moderate" : "not_relevant";

  return {
    tier, score, capacity, scale, painFit, reachable, timing,
    disqualified: !!disq, disqualifier: disq ?? undefined,
    factors,
    rationale: buildRationale({ tier, score, painFit, capacity, scale, reachable, timing, disq, i, persona }),
  };
}

// ── Evidence-linked rationale ───────────────────────────────────────────────
function buildRationale(a: {
  tier: string; score: number; painFit: number; capacity: number; scale: number;
  reachable: number; timing: number; disq: string | null; i: RelevanceInput; persona: SellerPersona;
}): string {
  if (a.disq) {
    const map: Record<string, string> = {
      no_website: "no standalone website — nothing to sell against",
      wrong_vertical: "outside your target verticals",
      already_ai_dominant: "already dominates AI search — the thing you'd sell is done",
      already_dominant_organic: "already dominates organic — little to gain",
      site_already_modern: "site is already modern — no redesign wedge",
      not_hiring: "not currently hiring — no timing trigger",
    };
    return `NOT RELEVANT — disqualified: ${map[a.disq] ?? a.disq}.`;
  }
  const bits: string[] = [];
  if (a.painFit >= 60) bits.push("strong pain fit");
  else if (a.painFit <= 25) bits.push("weak pain signal");
  if (a.capacity >= 60) bits.push("clear budget signals");
  else if (a.capacity <= 25) bits.push("thin budget evidence");
  if (a.scale >= 80) bits.push("right in your size sweet spot");
  else if (a.scale <= 25) bits.push("outside your ideal size band");
  if (a.timing >= 60) bits.push("a live 'why now' trigger");
  if (a.reachable >= 70) bits.push("decision-maker reachable");
  else if (a.reachable <= 20) bits.push("hard to reach");
  const head = a.tier === "highly_relevant" ? "HIGHLY RELEVANT" : a.tier === "moderate" ? "MODERATE" : "NOT RELEVANT";
  return `${head} (${a.score}/100). ${bits.join(", ") || "mixed signals"}.`;
}
