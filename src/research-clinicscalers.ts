import { synthesizeDiagnosis } from "./synthesis.js";
import { recordDossier } from "./record-dossier.js";
import { pool } from "./db.js";
import type { Dossier } from "./dossier.js";

// Live research output for clinicscalers.com — all values gathered this session
// via the research-prospect SOP (rendered audit + SEMrush). Contacts came back
// "owner not public" honestly (no LinkedIn slug, no named team, 0 search hits).

const dx = synthesizeDiagnosis({
  name: "ClinicScalers",
  category: "healthcare marketing",
  geo: "Dubai",
  hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
  renderedWords: 784, images: 6, imagesNoAlt: 6, hreflang: ["ar", "en"],
  authorityScore: 7, aiMentions: 2, citedPages: 5, trafficTrend: "+1,200%",
  categoryLeader: null,
});

const d: Dossier = {
  name: "ClinicScalers",
  domain: "clinicscalers.com",
  category: "healthcare marketing agency",
  geo: "Dubai, UAE",
  googleRating: null,
  googleReviews: null,
  positioning: "Healthcare/medical marketing agency for clinics, doctors & hospitals (Dubai, Abu Dhabi, Sharjah, KSA).",
  usp: "Exclusively healthcare marketing; patient-growth positioning.",
  services: ["medical marketing", "dental marketing", "clinic advertising", "patient growth", "SEO / paid ads"],
  contacts: {
    businessEmail: null,
    whatsapp: "+971504247919",
    instagram: null,
    founder: null, // owner not public — recorded honestly
  },
  audit: {
    title: "Healthcare & Medical Marketing Agency in Dubai | ClinicScalers",
    metaDescLen: 219, h1Count: 1, h2Count: 5,
    schemaTypes: ["WebPage", "BreadcrumbList", "WebSite", "SearchAction"],
    hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    hreflang: ["ar", "en"], renderedWords: 784, images: 6, imagesNoAlt: 6,
    hasChatWidget: true, hasWhatsAppBot: false, hasWhatsApp: true,
  },
  competitive: {
    primaryCountry: "United Arab Emirates", semrushDatabase: "ae",
    authorityScore: 7, organicTraffic: "13/mo", trafficTrend: "+1,200% (off a tiny base)",
    organicKeywords: "2", backlinks: "3K", refDomains: "33",
    aiVisibility: { mentions: 2, citedPages: 5, chatgpt: "2", gemini: "0", aiOverview: "0", aiMode: "0" },
    competitors: [], // thin — ranks for only 2 keywords
  },
  topAiProblems: dx.problems,
  topFixes: dx.fixes,
  hook: dx.hook,
  leadOffer: "aeo",
  pitch: "ClinicScalers sells healthcare marketing — yet its own site ranks for just 2 keywords (Authority 7) and is nearly invisible to AI. The cause is the exact gap they'd fix for a client: no Organization/LocalBusiness schema, no FAQ, no Person, every image missing alt. The most credible proof-of-competence they could ship is fixing their own AI/search footprint first.",
  priorityNote: "Medium — strong ICP fit (agency serving clinics) but tiny digital footprint; owner not yet reachable.",
  outreachStatus: "new",
  notes: "Owner/founder NOT public: LinkedIn company slug unavailable, no named team on site, contact page 404, 0 LinkedIn people-search hits. Only public contact: WhatsApp +971504247919. Competitive set thin (2 keywords). Office: Marina Plaza, Dubai Marina.",
  researchedNote: "Live: rendered on-page audit (clinicscalers.com) + SEMrush overview. Founder genuinely not publicly findable (recorded, not fabricated).",
};

const id = await recordDossier(d);
console.log(`[research] ClinicScalers recorded → ${id}`);
const cnt = await pool.query("select count(*)::int as n from prospect.prospects");
console.log(`[research] DB now holds ${cnt.rows[0].n} prospects`);
await pool.end();
