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
    founder: { name: "Sebastian Wenske", role: "CEO & Founder", linkedin: "https://www.linkedin.com/in/sebastian-wenske-361b27120", linkedinVerified: true, source: "Space Rocket LinkedIn company People page (current)" },
    decisionMaker2: { name: "Dennis Büchle", role: "Team Lead, Webdesign", linkedin: "https://www.linkedin.com/in/dennis-buechle", linkedinVerified: true, source: "Space Rocket LinkedIn company People page (current)" },
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
    notes: "Geschäftsführer Coskun Yukari verified via Handelsregister (HRB 101448 B) + Impressum (predecessor Tarkan Sahin exited 2024); no personal LinkedIn found. No valid LinkedIn company page — the 'creativeline' slug is a different (Indian) agency, so only the founder is the public decision-maker. info@cl-berlin.de · +49 30 46606650 · IG @creativeline_berlin.",
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
    founder: { name: "Lisa Ut", role: "Inhaberin / Founder", linkedinVerified: false, source: "Verified via Creditreform + Impressum colex-werbeagentur.de (no personal LinkedIn found)" },
    decisionMaker2: { name: "Timur Ut", role: "Web Designer & Kundenberater (Ut family)", linkedin: "https://www.linkedin.com/in/timur-ut-771b8b17b", linkedinVerified: true, source: "Colex LinkedIn company People page (current employee)" },
    starAsset: "Inhaberin Lisa Ut",
    pitch: "Colex has LocalBusiness + Organization + Person schema (ahead of most agencies) but a thin 237-word homepage, an 81-char title, and just 1 AI mention. Deepen the content + add FAQ/AggregateRating and the schema head-start converts into AI citations in a category where even the leader has only 57.",
    notes: "Inhaberin Lisa Ut (verified via Creditreform/Impressum; no personal LinkedIn). DM2 Timur Ut (Ut family) found on the Colex LinkedIn company People page. Founded 2014, 6-person team. IG @colexwerbeagentur.",
  },
  {
    candidate: "dskom digital.marketing.agentur", name: "dskom", domain: "dskom.de", rating: 5.0, reviews: 144,
    positioning: "Berlin digital-marketing agency (since 2002) — SEO, SEA (Google/Bing Ads), web analytics, e-mail marketing.",
    usp: "20+ years; certified Google Ads Partner since 2006; iBusiness Top-100 German SEO provider.",
    services: ["SEO", "SEA / Google Ads", "web analytics", "e-mail marketing", "online marketing"],
    title: "dskom | digital.marketing.agentur - Onlineagentur in Berlin", metaDescLen: 155, h1Count: 1, h2Count: 21,
    schemaTypes: ["Organization", "Person", "Article", "BreadcrumbList", "WebSite"],
    hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 3109, images: 150, imagesNoAlt: 40, hasChatWidget: true, canonical: true, noindex: false, viewport: true,
    authorityScore: 29, organicTraffic: "5.4K", trafficTrend: "+4.2%", organicKeywords: "2.9K", backlinks: "9.7K", refDomains: "763",
    aiMentions: 41, aiCitedPages: 52, chatgpt: "14", aiOverview: "9", aiMode: "9", gemini: "9", competitors: [],
    businessEmail: "info@dskom.de", businessPhone: "+49 30 49907084", instagram: "dskomgmbh",
    founder: { name: "Sven Deutschländer", role: "Geschäftsführer & Founder", linkedinVerified: false, source: "Impressum dskom.de + VGSD (GF since 2002; no individual /in/ captured)" },
    decisionMaker2: { name: "Dennis Hayungs", role: "Head of E-Mail-Marketing", linkedin: "https://www.linkedin.com/in/dennis-hayungs-b373a27a", linkedinVerified: true, source: "dskom LinkedIn company People page" },
    starAsset: "Sven Deutschländer (GF, Top-100 SEO)",
    pitch: "dskom is a 20-year Google Ads Partner and Top-100 German SEO firm (Authority 29, 41 AI mentions) — but its own site has no FAQ or AggregateRating schema. For an agency that sells SEO, closing its own AEO gaps (FAQ hub + review schema) is the most credible proof of competence.",
    notes: "GF Sven Deutschländer + Harry Schäfer (since 2002). DM2 Dennis Hayungs (Head of E-Mail-Marketing) from the LinkedIn company page. info@dskom.de · +49 30 49907084 · IG @dskomgmbh.",
  },
  {
    candidate: "Netzbekannt", name: "Netzbekannt", domain: "netzbekannt.de", rating: 5.0, reviews: 68,
    positioning: "Berlin SEO & online-marketing agency (since 2012) — SEO, SEA, online-marketing strategy. Top Agentur 2025.",
    usp: "Award-winning (Top Agentur 2025); the MOST AI-visible agency in this Berlin set (98 AI mentions — above the leader).",
    services: ["SEO", "SEA", "online marketing strategy", "content", "consulting"],
    title: "Online Marketing Agentur Berlin | Netzbekannt", metaDescLen: 122, h1Count: 1, h2Count: 43,
    schemaTypes: ["Organization", "Person", "ImageObject", "WebSite", "Article"],
    hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 2592, images: 111, imagesNoAlt: 17, hasChatWidget: true, canonical: true, noindex: false, viewport: true,
    authorityScore: 25, organicTraffic: "5.4K", trafficTrend: "+11%", organicKeywords: "416", backlinks: "2.8K", refDomains: "299",
    aiMentions: 98, aiCitedPages: 11, chatgpt: "20", aiOverview: "23", aiMode: "38", gemini: "17", competitors: [],
    instagram: "netzbekannt",
    founder: { name: "Gabriel Gelman", role: "CEO & Founder", linkedin: "https://www.linkedin.com/in/gabriel-gelman", linkedinVerified: true, source: "Netzbekannt LinkedIn company People page (current)" },
    decisionMaker2: { name: "Jascha Bechmann", role: "Geschäftsführer (SEA & Sales)", linkedin: "https://www.linkedin.com/in/jascha-bechmann-866a1787", linkedinVerified: true, source: "Netzbekannt LinkedIn company People page (current)" },
    starAsset: "Gabriel Gelman (CEO & founder)",
    pitch: "Netzbekannt already wins AI search in Berlin — 98 AI mentions, more than any peer including the category benchmark. But only 11 cited pages and no FAQ/AggregateRating schema means it's leaving the citation footprint thin. Lock the lead in with an FAQ/answer hub + review schema before competitors catch up.",
    notes: "Founder/CEO Gabriel Gelman + GF Jascha Bechmann, both verified on the LinkedIn company page. Top Agentur 2025. Highest AI mentions (98) in the Berlin set. IG @netzbekannt.",
  },
  {
    candidate: "MEWIGO WordPress Agentur Berlin", name: "MEWIGO", domain: "mewigo.de", rating: 5.0, reviews: 74,
    positioning: "Berlin owner-operated WordPress + advertising agency (Friedrichshain, since 2006) — web design, online marketing, corporate/print design.",
    usp: "19+ years; owner-operated WordPress specialists; LocalBusiness + AggregateRating schema already in place.",
    services: ["WordPress", "web design", "online marketing", "corporate design", "print"],
    title: "MEWIGO | WordPress Agentur Berlin | Werbeagentur Berlin", metaDescLen: 135, h1Count: 1, h2Count: 5,
    schemaTypes: ["Organization", "LocalBusiness", "AggregateRating", "Product", "WebSite", "BreadcrumbList"],
    hasPerson: false, hasFAQ: false, hasAggregateRating: true,
    renderedWords: 810, images: 57, imagesNoAlt: 15, hasChatWidget: false, canonical: true, noindex: false, viewport: true,
    authorityScore: 25, organicTraffic: "1.1K", trafficTrend: "+9.9%", organicKeywords: "312", backlinks: "5.1K", refDomains: "544",
    aiMentions: 5, aiCitedPages: 11, chatgpt: "2", aiOverview: "0", aiMode: "2", gemini: "1", competitors: [],
    instagram: "mewigo.berlin",
    founder: { name: "Diego Hinz", role: "Geschäftsführer / Owner", linkedinVerified: false, source: "Impressum mewigo.de (owner-operated since 2006)" },
    starAsset: "Diego Hinz (GF)",
    pitch: "MEWIGO already has LocalBusiness + AggregateRating schema (ahead of most agencies) but its founder Diego Hinz is invisible to AI (no Person schema) and it has no FAQ — just 5 AI mentions despite 19 years and Authority 25. Add Person + FAQ to convert that foundation into AI citations.",
    notes: "Owner-operated; Diego Hinz (GF, verified via Impressum). No LinkedIn company People page found — only the founder is the public decision-maker. IG @mewigo.berlin.",
  },
  {
    candidate: "Creative Mind Agency", name: "Creative Mind Agency", domain: "creative-mind.media", rating: 5.0, reviews: 87,
    positioning: "Berlin online-marketing & content agency (Creative Mind GmbH) — authentic content production + online advertising.",
    usp: "Founder-led content + performance agency; 5.0★ across 87 reviews.",
    services: ["content production", "online advertising", "social media", "video", "online marketing"],
    title: "Creative Mind | Home", metaDescLen: 185, h1Count: 1, h2Count: 14, schemaTypes: [],
    hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 458, images: 9, imagesNoAlt: 9, hasChatWidget: false, canonical: false, noindex: false, viewport: true,
    authorityScore: 8, organicTraffic: "35", trafficTrend: "+150%", organicKeywords: "22", backlinks: "343", refDomains: "61",
    aiMentions: 2, aiCitedPages: 0, chatgpt: "2", aiOverview: "0", aiMode: "0", gemini: "0", competitors: [],
    instagram: "creativemindgmbh",
    founder: { name: "Luca Weissenbacher", role: "Geschäftsführender Gesellschafter (Co-Founder)", linkedin: "https://www.linkedin.com/in/luca-weissenbacher-ab19121bb", linkedinVerified: true, source: "Creative Mind LinkedIn company People page (current)" },
    decisionMaker2: { name: "Sebastian Däumling", role: "Geschäftsführender Gesellschafter (Co-Founder)", linkedin: "https://www.linkedin.com/in/sebastian-d%C3%A4umling", linkedinVerified: true, source: "Creative Mind LinkedIn company People page (current)" },
    starAsset: "Luca Weissenbacher (co-founder)",
    pitch: "Creative Mind has the weakest technical foundation in the set — zero schema, a 20-char title, no canonical, 458 words, and just 2 AI mentions. For a content/marketing agency that's an own-goal: Organization + ProfessionalService + Person schema, a proper title, and an FAQ hub would lift it from invisible to citable fast.",
    notes: "Co-founders Luca Weissenbacher + Sebastian Däumling, both verified on the LinkedIn company page. IG @creativemindgmbh.",
  },
  {
    candidate: "Smarketer GmbH", name: "Smarketer", domain: "smarketer.de", rating: 4.7, reviews: 70,
    positioning: "Europe's leading pure Google Ads agency (Berlin-Mitte, since 2011) — Google & Microsoft Ads. 250 employees, 1,000+ clients.",
    usp: "Market leader for Google Ads in Europe; 250 staff; Google + Microsoft Ads Partner.",
    services: ["Google Ads", "Microsoft Ads", "SEA", "performance marketing", "PPC"],
    title: "Smarketer | Google Ads vom Marktführer", metaDescLen: 148, h1Count: 1, h2Count: 9, schemaTypes: [],
    hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 1659, images: 85, imagesNoAlt: 1, hasChatWidget: true, canonical: true, noindex: false, viewport: true,
    authorityScore: 32, organicTraffic: "", trafficTrend: null, organicKeywords: "", backlinks: "", refDomains: "",
    aiMentions: 57, aiCitedPages: 103, chatgpt: "", aiOverview: "", aiMode: "", gemini: "", competitors: [],
    instagram: "smarketer.de",
    founder: { name: "David Gabriel", role: "Founder & CEO", linkedinVerified: false, source: "smarketer.de /agentur + press (founder/CEO since 2011)" },
    decisionMaker2: { name: "Jonas Wekenborg", role: "Agile Product & Project Manager", linkedin: "https://www.linkedin.com/in/jonas-wekenborg", linkedinVerified: true, source: "Smarketer LinkedIn company People page" },
    starAsset: "David Gabriel (founder & CEO)",
    pitch: "Smarketer is Europe's #1 Google Ads agency (250 staff, 1,000 clients) — yet its own site has ZERO structured data and only 57 AI mentions. The market leader in paid search is itself under-built for AI search: Organization + ProfessionalService + Person schema and an FAQ hub would make the leader as visible to AI as it is to advertisers.",
    notes: "Founder/CEO David Gabriel; 250-employee agency (largest in the Berlin set). DM2 Jonas Wekenborg from the LinkedIn company page. SEMrush overview captured partially (Authority 32, AI 57/103). IG @smarketer.de.",
  },
  {
    candidate: "Dasch Marketing - Online-Marketing & SEO", name: "Dasch Marketing", domain: "dasch-marketing.de", rating: 5.0, reviews: 64,
    positioning: "Berlin online-marketing & SEO agency (Dasch = David Schlaebitz) — social, web design, SEO; transparent pricing.",
    usp: "Best-optimized site in the set — ProfessionalService + Person + FAQ + AggregateRating schema all present.",
    services: ["SEO", "social media marketing", "web design", "online marketing"],
    title: "Dasch Marketing - Online-Marketing Agentur in Berlin", metaDescLen: 113, h1Count: 3, h2Count: 23,
    schemaTypes: ["ProfessionalService", "Organization", "Person", "LocalBusiness", "AggregateRating", "FAQPage", "Service"],
    hasPerson: true, hasFAQ: true, hasAggregateRating: true,
    renderedWords: 1463, images: 175, imagesNoAlt: 149, hasChatWidget: false, canonical: true, noindex: false, viewport: true,
    authorityScore: 14, organicTraffic: "79", trafficTrend: "+155%", organicKeywords: "49", backlinks: "487", refDomains: "148",
    aiMentions: 3, aiCitedPages: 1, chatgpt: "2", aiOverview: "0", aiMode: "1", gemini: "0", competitors: [],
    instagram: "daschmarketing",
    founder: { name: "David Schlaebitz", role: "Founder (Inhaber)", linkedin: "https://www.linkedin.com/in/david-schlaebitz", linkedinVerified: false, source: "LinkedIn — headline matches Dasch positioning; agency name = DAvid SCHlaebitz" },
    decisionMaker2: { name: "Willi Wilke", role: "Projektmanager", linkedin: "https://www.linkedin.com/in/willi-wilke-2bb2342b0", linkedinVerified: true, source: "Dasch Marketing LinkedIn company People page" },
    starAsset: "David Schlaebitz (founder)",
    pitch: "Dasch already has the schema most agencies lack (ProfessionalService + Person + FAQ + AggregateRating) — but Authority 14 and just 3 AI mentions mean the foundation isn't earning citations yet. The wins are content depth + backlinks + alt text on its 149 unlabelled images, to convert good markup into AI visibility.",
    notes: "Founder David Schlaebitz (agency name = his initials; LinkedIn headline matches). DM2 Willi Wilke (Projektmanager). Best on-page schema in the set; 149/175 images missing alt. IG @daschmarketing.",
  },
  {
    candidate: "Agentur Emilian - Internetagentur Berlin", name: "Agentur Emilian", domain: "agentur-emilian.de", rating: 5.0, reviews: 42,
    positioning: "Berlin online-marketing agency (since 2018) — founder-led by Alexandra Buckard; SEO, SEA, social.",
    usp: "Founder-led (named after her son); LocalBusiness + FAQ + AggregateRating schema already in place.",
    services: ["SEO", "SEA", "social media", "online marketing", "content"],
    title: "Online Marketing Agentur Berlin | Agentur Emilian", metaDescLen: 148, h1Count: 1, h2Count: 10,
    schemaTypes: ["Organization", "LocalBusiness", "AggregateRating", "FAQPage", "PostalAddress", "WebSite"],
    hasPerson: false, hasFAQ: true, hasAggregateRating: true,
    renderedWords: 376, images: 64, imagesNoAlt: 52, hasChatWidget: true, canonical: true, noindex: false, viewport: true,
    authorityScore: 23, organicTraffic: "977", trafficTrend: "-11%", organicKeywords: "660", backlinks: "2.1K", refDomains: "362",
    aiMentions: 9, aiCitedPages: 17, chatgpt: "2", aiOverview: "2", aiMode: "5", gemini: "0", competitors: [],
    instagram: "agenturemilian",
    founder: { name: "Alexandra Buckard", role: "Founder & Geschäftsführerin", linkedin: "https://www.linkedin.com/in/alexandra-buckard-10563318a", linkedinVerified: true, source: "Agentur Emilian LinkedIn company People page (current)" },
    decisionMaker2: { name: "Michelle Hartmann", role: "Online Marketing Managerin", linkedin: "https://www.linkedin.com/in/michelle-hartmann-946a5b212", linkedinVerified: true, source: "Agentur Emilian LinkedIn company People page (current)" },
    starAsset: "Alexandra Buckard (founder & GF)",
    pitch: "Agentur Emilian has LocalBusiness + FAQ + AggregateRating schema and 9 AI mentions — but founder Alexandra Buckard is invisible to AI (no Person schema), the homepage is thin (376 words), traffic is declining (-11%), and 52/64 images lack alt. Add Person markup + content depth to reverse the slide and lift citations.",
    notes: "Founder Alexandra Buckard + DM2 Michelle Hartmann, both verified on the LinkedIn company page. Declining traffic (-11%); thin homepage. IG @agenturemilian.",
  },
  {
    candidate: "Anne Grabs - Social Media Marketing", name: "Anne Grabs", domain: "annegrabs.de", rating: 5.0, reviews: 56,
    positioning: "Berlin social-media marketing consultancy (since 2012) — solo expert Anne Grabs; strategy, Instagram, content; bestseller author.",
    usp: "15+ years; multiple bestseller books; Instagram & content-strategy specialist.",
    services: ["social media strategy", "Instagram marketing", "content", "consulting", "workshops"],
    title: "Social Media Marketing für Unternehmen in Berlin", metaDescLen: 150, h1Count: 1, h2Count: 8, schemaTypes: ["Organization", "WebSite", "Person"],
    hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    renderedWords: 900, images: 20, imagesNoAlt: 8, hasChatWidget: false, canonical: true, noindex: false, viewport: true,
    authorityScore: 21, organicTraffic: "660", trafficTrend: "+64%", organicKeywords: "124", backlinks: "1.4K", refDomains: "248",
    aiMentions: 6, aiCitedPages: 5, chatgpt: "3", aiOverview: "2", aiMode: "0", gemini: "1", competitors: [],
    founder: { name: "Anne Grabs", role: "Founder / Social Media Consultant", linkedinVerified: false, source: "annegrabs.de /ueber-mich (solo consultancy since 2012; bestseller author)" },
    starAsset: "Anne Grabs (founder, author)",
    pitch: "Anne Grabs has strong personal authority (15+ years, bestseller author, +64% traffic) and Person schema — but no FAQ and just 6 AI mentions. For a personal-brand consultancy, an FAQ/answer hub built around her books + a structured Q&A is the fastest way to turn that authority into AI citations.",
    notes: "Solo social-media consultancy — only the founder Anne Grabs is the decision-maker (no team/DM2; verified via her site, bestseller author). Growing traffic (+64%).",
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
