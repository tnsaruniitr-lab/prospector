import { recordCandidates } from "./record-candidates.js";
import { pool, q, T } from "./db.js";

// Live browser-Maps discovery for Berlin marketing agencies — union of the
// marketing_agency seeds (werbeagentur / marketing agentur / digitalagentur) in
// Berlin. Non-agencies filtered out (events, pure video/influencer). 20 candidates.
const candidates = [
  { name: "Space Rocket - Webdesign und Online Marketing", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 315 },
  { name: "Creative-Line Werbeagentur GmbH", city: "Berlin", category: "marketing_agency", rating: 4.9, reviews: 219 },
  { name: "Colex Werbeagentur", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 146 },
  { name: "dskom digital.marketing.agentur", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 144 },
  { name: "Level up your Social Media", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 89 },
  { name: "Creative Mind Agency", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 87 },
  { name: "MEWIGO WordPress Agentur Berlin", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 74 },
  { name: "Smarketer GmbH", city: "Berlin", category: "marketing_agency", rating: 4.7, reviews: 70 },
  { name: "Netzbekannt", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 68 },
  { name: "Dasch Marketing - Online-Marketing & SEO", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 64 },
  { name: "Anne Grabs - Social Media Marketing", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 56 },
  { name: "Ocean Werbung", city: "Berlin", category: "marketing_agency", rating: 4.9, reviews: 54 },
  { name: "Agentur Emilian - Internetagentur Berlin", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 42 },
  { name: "wtm Marketing & Vertriebsconsulting GmbH", city: "Berlin", category: "marketing_agency", rating: 4.9, reviews: 37 },
  { name: "OBSCURA - Digital Marketing GmbH", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 31 },
  { name: "ALEKS & SHANTU GmbH", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 25 },
  { name: "bloominds - Agentur für Branding", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 16 },
  { name: "Mattheis. Werbeagentur GmbH", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 15 },
  { name: "Buzzwoo Online Marketing Agentur Berlin", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 13 },
  { name: "Digitalagentur Berlin Bytes", city: "Berlin", category: "marketing_agency", rating: 5.0, reviews: 9 },
];

const r = await recordCandidates(candidates);
console.log(`[discover] marketing agencies · Berlin → ${r.inserted} new candidates queued (${r.skipped} already known)`);

const pend = await q(
  `select name, rating, review_count as reviews, research_status
   from ${T.prospects} where city = 'Berlin' order by review_count desc nulls last`,
);
console.log("\nBERLIN AGENCY QUEUE (by reviews):");
console.table(pend);
await pool.end();
