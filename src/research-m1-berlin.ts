import { synthesizeDiagnosis, hasBusinessSchema } from "./synthesis.js";
import { recordDossier } from "./record-dossier.js";
import { completeContact } from "./contact-complete.js";
import { q, T, pool } from "./db.js";
import { scoreRelevance } from "./relevance.js";
import { gradeDossier } from "./grading.js";
import { renderDossier } from "./dossier.js";
import type { Dossier } from "./dossier.js";

// ── LIVE RESEARCH — M1 Med Beauty Berlin Mitte ───────────────────────────────
// Discovered: browser Maps "kosmetische klinik in Berlin" → #1 by reviews (1,405 · 4.9★)
// All values gathered live: rendered audit + SEMrush db=de + LinkedIn company People page.

// Category AI leader (from SEMrush db=de competitors pass)
const CATEGORY_LEADER = { domain: "koe-klinik.de", mentions: 265, citedPages: 250 };
// NOTE: M1 itself has 570 AI mentions — it IS the category leader. koe-klinik is #2.
// This means the relevance verdict correctly shows "already leading AI" (defensive pitch).

const schemaTypes = ["contao:Page", "WebSite"]; // only CMS + WebSite — no medical schema

const dx = synthesizeDiagnosis({
  name: "M1 Med Beauty", category: "cosmetic clinic", geo: "Berlin, Germany",
  vertical: "private_clinic",
  starAsset: "Dr. René Raboch (Facharzt für Plastische Ästhetische Chirurgie)",
  hasLocalBusiness: hasBusinessSchema(schemaTypes, "private_clinic"),
  hasPerson: false, hasFAQ: false, hasAggregateRating: false,
  renderedWords: 455, images: 13, imagesNoAlt: 2,
  titleLen: 61, metaDescLen: 149, h1Count: 1,
  hasCanonical: false, noindex: false, hasViewport: true,
  hreflang: ["de", "x-default", "en"],
  authorityScore: 38, aiMentions: 570, citedPages: 230,
  trafficTrend: "-3.1%",
  categoryLeader: CATEGORY_LEADER, // used for comparative hook vs #2 competitor
});

// Contacts
const ctx = { domain: "m1-beauty.de", business: "M1 Med Beauty", city: "Berlin" };
const founder = await completeContact({
  name: "Attila Strauss",
  role: "CEO, M1 Kliniken AG (parent company)",
  linkedin: "https://www.linkedin.com/in/straussa",
  linkedinVerified: true,
  source: "LinkedIn company People page — 'CEO M1 Kliniken AG · Berlin Metropolitan Area' ✓",
}, ctx);
const dm2 = await completeContact({
  name: "Kilian Brenske",
  role: "Co-Geschäftsführer, M1 Med Beauty Berlin GmbH",
  linkedinVerified: false,
  source: "LinkedIn company People page (current; confirmed via Impressum Handelsregister co-GF)",
}, ctx);

const d: Dossier = {
  name: "M1 Med Beauty Berlin Mitte",
  domain: "m1-beauty.de",
  category: "private_clinic",
  geo: "Berlin, Germany",
  positioning: "Germany's leading aesthetic-medicine chain (43 locations DE/AT/CH/UK) — injectables, laser, plastic surgery. Berlin Mitte flagship at Hackescher Markt.",
  usp: "#1 cosmetic clinic chain in DACH by volume; 1,405 reviews at 4.9★ in Berlin Mitte alone; publicly listed (M1 Kliniken AG).",
  services: ["Botox / injectables", "hyaluronic fillers", "laser treatments", "plastic surgery", "aesthetic medicine"],
  googleRating: 4.9,
  googleReviews: 1405,
  contacts: {
    businessPhone: "+49 30 921079710",
    founder,
    decisionMaker2: dm2,
  },
  audit: {
    title: "M1 Med Beauty - Your No. 1 for beauty medicine! 43x locations",
    metaDescLen: 149, h1Count: 1, h2Count: 3,
    schemaTypes,
    hasLocalBusiness: hasBusinessSchema(schemaTypes, "private_clinic"),
    hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    hreflang: ["de", "x-default", "en"],
    renderedWords: 455, images: 13, imagesNoAlt: 2,
    hasChatWidget: false, hasWhatsApp: false,
  },
  competitive: {
    primaryCountry: "Germany",
    semrushDatabase: "de",
    authorityScore: 38,
    organicTraffic: "177.1K",
    trafficTrend: "-3.1%",
    organicKeywords: "40.2K",
    backlinks: "3.5K",
    refDomains: "705",
    aiVisibility: {
      mentions: 570, citedPages: 230,
      chatgpt: "105", aiOverview: "241", aiMode: "143", gemini: "81",
    },
    competitors: [
      { domain: "aesthetify.de", commonLevel: "24%", keywords: 668 },
      { domain: "koe-klinik.de", commonLevel: "22%", keywords: 934 },
      { domain: "liebdeingesicht.de", commonLevel: "21%", keywords: 642 },
      { domain: "aesthetiqua.de", commonLevel: "19%", keywords: 493 },
    ],
    // M1 IS the category AI leader — noting the #2 for context
    categoryAiLeader: {
      domain: "m1-beauty.de",
      mentions: 570, citedPages: 230,
      note: "M1 is the AI leader in this category — koe-klinik.de is #2 at 265 mentions",
    },
  },
  topAiProblems: dx.problems,
  topFixes: dx.fixes,
  hook: dx.hook,
  weakPoints: dx.weakPoints,
  subjectHeadline: dx.subjectHeadline ?? undefined,
  leadOffer: "aeo",
  pitch: "M1 Med Beauty is the undisputed AI-search leader in German aesthetic medicine (570 AI mentions, 177K organic traffic, Authority 38) — but its own website has ZERO medical schema. No LocalBusiness, no Person/doctor schema, no FAQ, no AggregateRating. A chain that sells 43 locations of premium aesthetics has none of the machine-readable trust signals that Google and AI use to *recommend* clinics. Fixing the schema + adding a doctor/procedure FAQ would compound the already-dominant AI footprint before a well-funded competitor closes the gap.",
  priorityNote: "Publicly listed company (M1 Kliniken AG) — budget confirmed. CEO reachable via LinkedIn. Schema gaps are the quick win.",
  outreachStatus: "new",
  notes: "CEO Attila Strauss verified LinkedIn (M1 Kliniken AG parent). Co-GF Kilian Brenske on company page. Dr. René Raboch (plastic surgeon) also listed. Chain: 43 locations DE/AT/CH/UK. Phone: +49 30 921079710. Publicly listed: M1 Kliniken AG (DE000A0STSQ8). Category AI leader at 570 mentions — pitch is 'protect + extend the lead', not catch-up.",
  researchedNote: "Live: browser Maps discovery (kosmetische klinik Berlin) → rendered audit (m1-beauty.de/de) → SEMrush db=de overview + competitors → LinkedIn company People page (Attila Strauss verified on-profile).",
};

// Persist
const id = await recordDossier(d);
console.log(`\n[m1] persisted → ${id}`);

// Grade
const grade = gradeDossier(d);
console.log(`[m1] grade: ${grade.tier} / ${grade.score}  — ${grade.reasons.join(" · ")}`);

// Relevance
const rel = scoreRelevance(d);
console.log(`[m1] relevance: ${rel.tier.replace(/_/g," ").toUpperCase()} (${rel.score}/100)`);
console.log(`[m1] verdict: ${rel.verdict}`);

// DB count
const cnt = await pool.query("select count(*)::int n from prospect.prospects where research_status='researched'");
console.log(`[m1] DB now holds ${cnt.rows[0].n} researched prospects`);

// Full dossier
console.log("\n" + "═".repeat(70));
console.log(renderDossier(d));

await pool.end();
