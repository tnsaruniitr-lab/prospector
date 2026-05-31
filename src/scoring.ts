import type { AuditSignals, BotSignals, BusinessFacts, LeadOffer, Scored } from "./types.js";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** reviews on a log scale: 0→0, ~30→0.6, 300+→~1. */
const reviewsCurve = (rc: number | null) =>
  clamp(Math.log10((rc ?? 0) + 1) / Math.log10(300), 0, 1);

/**
 * VALUE (0-1) — "is this business worth it?" Mostly review_count (proven demand
 * + budget), adjusted by rating health. A 5-review shop and a 500-review clinic
 * are not in the same league; rating < 3.5 signals reputation trouble.
 */
export function valueScore(f: BusinessFacts): number {
  const reviews = reviewsCurve(f.reviewCount);
  const rating =
    f.rating == null ? 0.6
    : f.rating >= 4.5 ? 1.0
    : f.rating >= 4.0 ? 0.85
    : f.rating >= 3.5 ? 0.55
    : 0.3;
  return clamp(0.7 * reviews + 0.3 * rating, 0, 1);
}

/**
 * OPPORTUNITY per product line (each 0-1) — "how much can we sell them?"
 *   aeo         broken/invisible search + AI presence
 *   bot         no chat/WhatsApp capture, scaled by inbound volume (reviews)
 *   attribution active spender, measurement unknown (proxy until pixel detection)
 */
export function opportunityDims(a: AuditSignals, b: BotSignals, f: BusinessFacts) {
  let aeo = 0;
  if (!a.aiReadable) aeo += 0.35; // crawlers / LLMs can't read the page
  if (!a.hasValidSchema) aeo += 0.25;
  if (!a.hasPersonSchema) aeo += 0.15; // no credentialed doctor schema (YMYL)
  if (a.slowMs != null && a.slowMs > 1800) aeo += 0.2;
  else if (a.slowMs != null && a.slowMs > 800) aeo += 0.1;
  aeo += clamp(a.failCount * 0.04, 0, 0.25);
  aeo = clamp(aeo, 0, 1);

  // Bot opportunity scales with inbound volume — more reviews ≈ more inbound to automate.
  const inbound = reviewsCurve(f.reviewCount);
  const botBase =
    b.hasChatbot || b.hasWhatsAppBot ? 0.15 : b.hasWhatsAppLink ? 0.55 : 0.85;
  const bot = clamp(botBase * (0.55 + 0.45 * inbound), 0, 1);

  // Attribution: clearly investing (active/reviews) but measurement gap. Baseline
  // until we detect ad pixels (Meta/GA4/GTM) present without an attribution layer.
  const attribution = clamp(0.45 * inbound, 0, 1);

  return { aeo, bot, attribution };
}

/** Full-stack priority: value × opportunity, plus the lead offer (biggest gap). */
export function scoreBusiness(f: BusinessFacts, a: AuditSignals, b: BotSignals): Scored {
  const value = valueScore(f);
  const dims = opportunityDims(a, b, f);

  const entries = Object.entries(dims) as [LeadOffer, number][];
  const [leadOffer] = entries.reduce((m, e) => (e[1] > m[1] ? e : m));
  const avg = (dims.aeo + dims.bot + dims.attribution) / 3;
  const opportunity = clamp(0.6 * Math.max(dims.aeo, dims.bot, dims.attribution) + 0.4 * avg, 0, 1);
  const priority = Math.round(100 * value * opportunity);

  const reasons: string[] = [];
  if (!a.aiReadable) reasons.push("content not readable by AI crawlers");
  if (!a.hasValidSchema) reasons.push("missing/invalid JSON-LD schema");
  if (!a.hasPersonSchema) reasons.push("no credentialed doctor schema (YMYL)");
  if (a.slowMs != null && a.slowMs > 1800) reasons.push(`very slow site (${a.slowMs}ms TTFB)`);
  else if (a.slowMs != null && a.slowMs > 800) reasons.push(`slow site (${a.slowMs}ms TTFB)`);
  if (!b.hasChatbot && !b.hasWhatsAppBot)
    reasons.push(b.hasWhatsAppLink ? "WhatsApp link but no automation" : "no chat/WhatsApp capture at all");

  return { value, opportunity, priority, leadOffer, dims, reasons };
}

/** Gate: skip the no-budget bottom and the no-pain top. */
export function qualifyByPriority(
  s: Scored,
  f: BusinessFacts,
  minPriority = 12,
): { status: "qualified" | "rejected"; reason: string } {
  if ((f.reviewCount ?? 0) < 5)
    return { status: "rejected", reason: "too few reviews — inactive / no budget" };
  if (s.priority < minPriority)
    return { status: "rejected", reason: `priority ${s.priority} too low — clean site, no wedge` };
  return { status: "qualified", reason: `priority ${s.priority} · lead with ${s.leadOffer.toUpperCase()}` };
}
