import { recordCandidates } from "./record-candidates.js";
import { pool, q, T } from "./db.js";

// Candidates extracted live from Google Maps "med spas in Riyadh" (browser-Maps
// path). Websites need a per-card click or Places API; names + reviews seed the queue.
const candidates = [
  { name: "Sokoun Ladies and Gents Spa", city: "Riyadh", category: "med_spa", rating: 4.9, reviews: 1001 },
  { name: "Bioskinspa Riyadh", city: "Riyadh", category: "med_spa", rating: 4.8, reviews: 570 },
  { name: "Spa and Wellness Centre at Four Seasons Hotel Riyadh", city: "Riyadh", category: "med_spa", rating: 4.4, reviews: 184 },
  { name: "صالون مكحال (Salon Makhal)", city: "Riyadh", category: "med_spa", rating: 4.9, reviews: 115 },
  { name: "FeetLab KSA", city: "Riyadh", category: "med_spa", rating: 4.9, reviews: 28 },
];

const r = await recordCandidates(candidates);
console.log(`[discover] med spas · Riyadh → ${r.inserted} new candidates queued (${r.skipped} already known)`);

const pend = await q(
  `select name, city, rating, review_count as reviews, research_status from ${T.prospects} where research_status = 'pending' order by review_count desc nulls last`,
);
console.log("\nPENDING QUEUE (discovered, awaiting deep research):");
console.table(pend);
await pool.end();
