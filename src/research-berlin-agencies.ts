import { synthesizeDiagnosis, hasBusinessSchema } from "./synthesis.js";
import { recordDossier } from "./record-dossier.js";
import { completeContact } from "./contact-complete.js";
import { q, T, pool } from "./db.js";
import type { Dossier, DossierContact } from "./dossier.js";

// Berlin marketing-agency VALIDATION WAVE (top 3) — live: browser-Maps discovery →
// rendered audit → SEMrush db=de (overview + per-engine AI + competitors) → LinkedIn.
// Proves the marketing_agency vertical end-to-end on real German data.
const LEADER_DE = { domain: "smarketer.de", mentions: 57, citedPages: 103 };

interface R {
  candidate: string; name: string; domain: string; rating: number; reviews: number;
  positioning: string; usp: string; services: string[];
  title: string; metaDescLen: number; h1Count: number; h2Count: number; schemaTypes: string[];
  hasPerson: boolean; hasFAQ: boolean; hasAggregateRating: boolean;
  renderedWords: number; images: number; imagesNoAlt: number; hasChatWidget: boolean;
  canonical: boolean; noindex: boolean; viewport: boolean;
  authorityScore: number; organicTraffic: string; trafficTrend: string | null; organicKeywords: string; backlinks: string; refDomains: string;
  aiMentions: number; aiCitedPages: number; chatgpt: string; aiOverview: string; aiMode: string; gemini: string;
  competitors: { domain: string; commonLevel: string; keywords: number }[];
  businessEmail?: string | null; businessPhone?: string | null; instagram?: string | null;
  founder: DossierContact; decisionMaker2?: DossierContact | null;
  starAsset: string; pitch: string; notes: string;
}

async function build(r: R): Promise<Dossier> {
  const dx = synthesizeDiagnosis({
    name: r.name, category: "marketing agency", geo: "Berlin, Germany", vertical: "marketing_agency", starAsset: r.starAsset,
    hasLocalBusiness: hasBusinessSchema(r.schemaTypes, "marketing_agency"),
    hasPerson: r.hasPerson, hasFAQ: r.hasFAQ, hasAggregateRating: r.hasAggregateRating,
    renderedWords: r.renderedWords, images: r.images, imagesNoAlt: r.imagesNoAlt,
    titleLen: r.title.length, metaDescLen: r.metaDescLen, h1Count: r.h1Count,
    hasCanonical: r.canonical, noindex: r.noindex, hasViewport: r.viewport,
    authorityScore: r.authorityScore, aiMentions: r.aiMentions, citedPages: r.aiCitedPages, trafficTrend: r.trafficTrend,
    categoryLeader: { domain: LEADER_DE.domain, mentions: LEADER_DE.mentions, citedPages: LEADER_DE.citedPages },
  });
  const ctx = { domain: r.domain, business: r.name, city: "Berlin" };
  const founder = await completeContact(r.founder, ctx);
  const decisionMaker2 = r.decisionMaker2 ? await completeContact(r.decisionMaker2, ctx) : null;
  return {
    name: r.name, domain: r.domain, category: "marketing_agency", geo: "Berlin, Germany",
    positioning: r.positioning, usp: r.usp, services: r.services,
    googleRating: r.rating, googleReviews: r.reviews,
    contacts: { businessEmail: r.businessEmail ?? null, businessPhone: r.businessPhone ?? null, instagram: r.instagram ?? null, founder, decisionMaker2 },
    audit: {
      title: r.title, metaDescLen: r.metaDescLen, h1Count: r.h1Count, h2Count: r.h2Count, schemaTypes: r.schemaTypes,
      hasLocalBusiness: hasBusinessSchema(r.schemaTypes, "marketing_agency"), hasPerson: r.hasPerson, hasFAQ: r.hasFAQ, hasAggregateRating: r.hasAggregateRating,
      renderedWords: r.renderedWords, images: r.images, imagesNoAlt: r.imagesNoAlt, hasChatWidget: r.hasChatWidget, hasWhatsApp: false,
    },
    competitive: {
      primaryCountry: "Germany", semrushDatabase: "de",
      authorityScore: r.authorityScore, organicTraffic: r.organicTraffic, trafficTrend: r.trafficTrend ?? undefined,
      organicKeywords: r.organicKeywords, backlinks: r.backlinks, refDomains: r.refDomains,
      aiVisibility: { mentions: r.aiMentions, citedPages: r.aiCitedPages, chatgpt: r.chatgpt, aiOverview: r.aiOverview, aiMode: r.aiMode, gemini: r.gemini },
      competitors: r.competitors,
      categoryAiLeader: { domain: LEADER_DE.domain, mentions: LEADER_DE.mentions, citedPages: LEADER_DE.citedPages, note: "category AI leader among Berlin agencies — still only 57 mentions, the category is wide open" },
    },
    topAiProblems: dx.problems, topFixes: dx.fixes, hook: dx.hook, weakPoints: dx.weakPoints, subjectHeadline: dx.subjectHeadline ?? undefined,
    leadOffer: "aeo", pitch: r.pitch, outreachStatus: "new", notes: r.notes,
    researchedNote: "Berlin agency validation wave: browser-Maps discovery + rendered audit + SEMrush db=de overview/AI/competitors + LinkedIn company People page.",
  };
}

const PROSPECTS: R[] = [
  {
    candidate: "Space Rocket - Webdesign und Online Marketing", name: "Space Rocket", domain: "space-rocket.de", rating: 5.0, reviews: 315,
    positioning: "Berlin web-design + online-marketing agency (Alt-Moabit) — German Web Award winner, 2,000+ websites built.",
    usp: "Award-winning (German Web Awards 2022–24); among the DACH region's top-rated web-design agencies.",
    services: ["web design", "online marketing", "SEO", "Google Ads", "websites"],
    title: "Space Rocket - Online Marketing und Webdesign aus Berlin", metaDescLen: 136, h1Count: 1, h2Count: 3, schemaTypes: [],
    hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 12, images: 15, imagesNoAlt: 11, hasChatWidget: false, canonical: true, noindex: false, viewport: true,
    authorityScore: 25, organicTraffic: "3K", trafficTrend: "+17%", organicKeywords: "115", backlinks: "767", refDomains: "288",
    aiMentions: 5, aiCitedPages: 1, chatgpt: "4", aiOverview: "1", aiMode: "0", gemini: "0", competitors: [],
    instagram: "space.rocket.berlin",
    founder: { name: "Sebastian Wenske", role: "CEO & Founder", linkedinVerified: true, source: "Space Rocket LinkedIn company People page (current)" },
    decisionMaker2: { name: "Dennis Büchle", role: "Team Lead, Webdesign", linkedinVerified: true, source: "Space Rocket LinkedIn company People page (current)" },
    starAsset: "Sebastian Wenske (CEO & founder)",
    pitch: "Space Rocket is a German Web Award winner with 315 reviews and Authority 25 — yet it has ZERO structured data and just 5 AI mentions. The agency that builds award-winning sites for clients is itself invisible to ChatGPT. The most credible proof-of-competence it could ship is fixing its own AEO: Organization + ProfessionalService schema, Person markup for the team, and a results/FAQ hub.",
    notes: "Founder Sebastian Wenske (CEO) + Team Lead Dennis Büchle, both on the LinkedIn company page. Heavy-visual homepage (~12 rendered words) — thin crawlable text. IG @space.rocket.berlin.",
  },
  {
    candidate: "Creative-Line Werbeagentur GmbH", name: "Creative-Line Werbeagentur", domain: "cl-berlin.de", rating: 4.9, reviews: 219,
    positioning: "Berlin full-service Werbeagentur (Brunnenstraße) — print, digital, branding, web.",
    usp: "Full-service advertising with strong digital-print + creative; 219 reviews at 4.9★.",
    services: ["Werbung", "digital print", "web design", "branding", "creative"],
    title: "Creativeline Werbeagentur - Jetzt Produkte Entdecken!", metaDescLen: 159, h1Count: 1, h2Count: 18,
    schemaTypes: ["Place", "PostalAddress", "Organization", "ContactPoint", "WebSite", "Person", "Article"],
    hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 1208, images: 181, imagesNoAlt: 0, hasChatWidget: true, canonical: true, noindex: false, viewport: true,
    authorityScore: 10, organicTraffic: "943", trafficTrend: "+1.6%", organicKeywords: "111", backlinks: "1.5K", refDomains: "233",
    aiMentions: 6, aiCitedPages: 1, chatgpt: "4", aiOverview: "0", aiMode: "1", gemini: "1",
    competitors: [{ domain: "glueckberlin.de", commonLevel: "23%", keywords: 7 }, { domain: "gud.berlin", commonLevel: "15%", keywords: 7 }, { domain: "obscura-berlin.de", commonLevel: "15%", keywords: 6 }, { domain: "heldisch.com", commonLevel: "14%", keywords: 3 }],
    businessEmail: "info@cl-berlin.de", businessPhone: "+49 30 46606650", instagram: "creativeline_berlin",
    founder: { name: "Coskun Yukari", role: "Geschäftsführer", linkedinVerified: false, source: "Impressum cl-berlin.de (current GF; predecessor Tarkan Sahin exited 2024)" },
    starAsset: "Geschäftsführer Coskun Yukari",
    pitch: "Creative-Line has the foundations right (Organization + Person schema, 1,208 words, all 181 images alt-tagged, live chat) but at Authority 10 and 6 AI mentions it's invisible in AI search. The wins are FAQ + AggregateRating schema and content depth — turning a well-built site into a cited one.",
    notes: "Geschäftsführer Coskun Yukari (current; predecessor Tarkan Sahin exited 2024). Only the founder/GF is the named public decision-maker; LinkedIn profiles not individually verified in this validation wave. info@cl-berlin.de · +49 30 46606650 · IG @creativeline_berlin.",
  },
  {
    candidate: "Colex Werbeagentur", name: "Colex Werbeagentur", domain: "colex-werbeagentur.de", rating: 5.0, reviews: 146,
    positioning: "Berlin Werbeagentur (Charlottenburg) — graphic design, web design, advertising technology; female-led since 2014.",
    usp: "Female-led full-service creative agency; 146 reviews at a perfect 5.0★.",
    services: ["Grafikdesign", "Webdesign", "Werbetechnik", "branding"],
    title: "Werbeagentur Berlin - Grafikdesign, Webdesign & Werbetechnik - Colex W", metaDescLen: 50, h1Count: 1, h2Count: 6,
    schemaTypes: ["LocalBusiness,Organization", "ImageObject", "WebSite", "Person", "Article"],
    hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 237, images: 35, imagesNoAlt: 17, hasChatWidget: true, canonical: true, noindex: false, viewport: true,
    authorityScore: 9, organicTraffic: "357", trafficTrend: null, organicKeywords: "19", backlinks: "190", refDomains: "127",
    aiMentions: 1, aiCitedPages: 0, chatgpt: "1", aiOverview: "0", aiMode: "0", gemini: "0",
    competitors: [{ domain: "heldisch.com", commonLevel: "46%", keywords: 3 }, { domain: "unicom-berlin.de", commonLevel: "45%", keywords: 2 }, { domain: "mymedia.berlin", commonLevel: "25%", keywords: 1 }, { domain: "glueckberlin.de", commonLevel: "21%", keywords: 4 }],
    instagram: "colexwerbeagentur",
    founder: { name: "Lisa Ut", role: "Inhaberin / Founder", linkedinVerified: false, source: "Impressum colex-werbeagentur.de (founded 2014, female-led)" },
    starAsset: "Inhaberin Lisa Ut",
    pitch: "Colex has LocalBusiness + Organization + Person schema (ahead of most agencies) but a thin 237-word homepage, an 81-char title, and just 1 AI mention. Deepen the content + add FAQ/AggregateRating and the schema head-start converts into AI citations in a category where even the leader has only 57.",
    notes: "Inhaberin Lisa Ut (founded 2014; 6-person team). Only the founder is the named public decision-maker; LinkedIn not individually verified in this validation wave. IG @colexwerbeagentur.",
  },
];

for (const r of PROSPECTS) {
  await q(`update ${T.prospects} set domain=$2 where name=$1 and domain is null`, [r.candidate, r.domain]);
}
let n = 0;
for (const r of PROSPECTS) {
  const id = await recordDossier(await build(r));
  console.log(`[berlin] ${r.name.padEnd(28)} → ${id}`);
  n++;
}
const cnt = await pool.query("select count(*)::int as n from prospect.prospects where city='Berlin, Germany' and research_status='researched'");
console.log(`\n[berlin] validation wave persisted: ${n} agency dossiers · ${cnt.rows[0].n} Berlin researched`);
await pool.end();
