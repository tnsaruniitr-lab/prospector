import { scoreBusiness } from "./scoring.js";
import type { AuditSignals, BotSignals, BusinessFacts } from "./types.js";

// The 5 Dubai clinics — REAL audit + bot signals from the live demo.
// reviewCount/rating are ESTIMATES here (Places provides them in the real pipeline).
interface Sample { name: string; facts: BusinessFacts; audit: AuditSignals; bot: BotSignals }

const SAMPLES: Sample[] = [
  { name: "Aesthetics International", facts: { reviewCount: 250, rating: 4.6 },
    audit: { reachable: true, classification: "CSR/blocked", aiReadable: false, failCount: 4, warnCount: 2, hasValidSchema: false, hasPersonSchema: false, slowMs: null },
    bot: { hasChatbot: false, hasWhatsAppBot: false, hasWhatsAppLink: false } },
  { name: "EDEN Aesthetics", facts: { reviewCount: 120, rating: 4.7 },
    audit: { reachable: true, classification: "SSR", aiReadable: true, failCount: 3, warnCount: 3, hasValidSchema: false, hasPersonSchema: false, slowMs: 400 },
    bot: { hasChatbot: false, hasWhatsAppBot: false, hasWhatsAppLink: true } },
  { name: "Hortman Clinics", facts: { reviewCount: 200, rating: 4.5 },
    audit: { reachable: true, classification: "SSR", aiReadable: true, failCount: 2, warnCount: 4, hasValidSchema: true, hasPersonSchema: false, slowMs: 1460 },
    bot: { hasChatbot: true, hasWhatsAppBot: false, hasWhatsAppLink: true } },
  { name: "Altaderma", facts: { reviewCount: 150, rating: 4.8 },
    audit: { reachable: true, classification: "SSR", aiReadable: true, failCount: 2, warnCount: 4, hasValidSchema: true, hasPersonSchema: false, slowMs: 1242 },
    bot: { hasChatbot: false, hasWhatsAppBot: false, hasWhatsAppLink: true } },
  { name: "Zieda's Aesthetic Clinic", facts: { reviewCount: 80, rating: 4.6 },
    audit: { reachable: true, classification: "SSR", aiReadable: true, failCount: 2, warnCount: 5, hasValidSchema: true, hasPersonSchema: false, slowMs: 5296 },
    bot: { hasChatbot: true, hasWhatsAppBot: false, hasWhatsAppLink: true } },
];

const scored = SAMPLES.map((s) => ({ ...s, sc: scoreBusiness(s.facts, s.audit, s.bot) }))
  .sort((a, b) => b.sc.priority - a.sc.priority);

console.log("\nComponent 1 — Audit & Prioritize  (review counts = estimates)\n");
console.log("  #  PRIO  VAL  OPP   LEAD          BUSINESS");
console.log("  " + "-".repeat(72));
scored.forEach((r, i) => {
  const d = r.sc.dims;
  console.log(
    `  ${i + 1}.  ${String(r.sc.priority).padStart(3)}  ${r.sc.value.toFixed(2)} ${r.sc.opportunity.toFixed(2)}  ${r.sc.leadOffer.toUpperCase().padEnd(11)} ${r.name}  (${r.facts.reviewCount} rev, ${r.facts.rating}★)`,
  );
  console.log(`        dims: aeo ${d.aeo.toFixed(2)} · bot ${d.bot.toFixed(2)} · attr ${d.attribution.toFixed(2)}`);
  console.log(`        why:  ${r.sc.reasons.join("; ")}`);
});
console.log("");
