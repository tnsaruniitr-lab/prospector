import { recordCandidates } from "./record-candidates.js";
import { pool, q, T } from "./db.js";

// Live browser-Maps discovery for Miami med spas — union of the med_spa playbook
// seeds ["med spa", "botox", "medical aesthetics clinic"] in Miami, extracted via
// src/browser/maps-extract.js (names + ratings + reviews; websites resolved at
// research time). 13 unique businesses. Real keyless path → recordCandidates().
const candidates = [
  { name: "Dolce Medical Spa - Miami", city: "Miami", category: "med_spa", rating: 5.0, reviews: 1147 },
  { name: "Zuri Plastic Surgery", city: "Miami", category: "med_spa", rating: 4.9, reviews: 701 },
  { name: "NuYou Medical Aesthetics", city: "Miami", category: "med_spa", rating: 5.0, reviews: 466 },
  { name: "Brickell Cosmetic Center", city: "Miami", category: "med_spa", rating: 4.6, reviews: 447 },
  { name: "Med Aesthetics Miami", city: "Miami", category: "med_spa", rating: 4.8, reviews: 433 },
  { name: "Arviv Medical Aesthetics Miami", city: "Miami", category: "med_spa", rating: 4.8, reviews: 405 },
  { name: "Aviva Medical Spa", city: "Miami", category: "med_spa", rating: 4.7, reviews: 334 },
  { name: "Rejuvaline Medspa", city: "Miami", category: "med_spa", rating: 4.9, reviews: 261 },
  { name: "Feel The Heal", city: "Miami", category: "med_spa", rating: 4.8, reviews: 210 },
  { name: "Miami Skin Spa Aesthetics & Wellness", city: "Miami", category: "med_spa", rating: 4.8, reviews: 157 },
  { name: "smith & co", city: "Miami", category: "med_spa", rating: 4.8, reviews: 84 },
  { name: "South Florida Face and Body", city: "Miami", category: "med_spa", rating: 4.9, reviews: 56 },
  { name: "Milan Aesthetics", city: "Miami", category: "med_spa", rating: 5.0, reviews: 36 },
];

const r = await recordCandidates(candidates);
console.log(`[discover] med spas · Miami → ${r.inserted} new candidates queued (${r.skipped} already known)`);

const pend = await q(
  `select name, city, rating, review_count as reviews, research_status
   from ${T.prospects} where city = 'Miami' order by review_count desc nulls last`,
);
console.log("\nMIAMI QUEUE (discovered, by reviews):");
console.table(pend);
await pool.end();
