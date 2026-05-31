import { synthesizeDiagnosis } from "./synthesis.js";
import { recordDossier } from "./record-dossier.js";
import { completeContact } from "./contact-complete.js";
import { q, T, pool } from "./db.js";
import type { Dossier, DossierContact } from "./dossier.js";

// Live Miami med-spa batch — every value gathered this session via the
// research-prospect SOP: browser-Maps discovery → rendered on-page audit
// (src/browser/audit.js) → SEMrush overview → web search for decision-makers.
// Synthesis + persistence run through the REAL code (synthesizeDiagnosis +
// recordDossier). Never fabricated: unfound values are null / role-unconfirmed.

// Category AI leader in this set (used for the comparative hook on the others).
const LEADER = { domain: "zuriplasticsurgery.com", mentions: 235, citedPages: 255 };

// Gold-standard enrichment (live SEMrush): per-engine AI mentions (sum = total),
// organic-traffic trend, and top organic competitors. Competitors only where the
// SEMrush DB returned real aesthetic/surgery domains (the account defaults to the
// .de database, so US competitor data is unreliable for the rest — left empty).
const AI_SPLIT: Record<string, { chatgpt: string; aiOverview: string; aiMode: string; gemini: string; trend: string; competitors?: { domain: string; commonLevel: string; keywords: number }[] }> = {
  "zuriplasticsurgery.com": { chatgpt: "44", aiOverview: "123", aiMode: "56", gemini: "12", trend: "-12%", competitors: [{ domain: "prosculpt.com", commonLevel: "24%", keywords: 2 }, { domain: "pscatlanta.com", commonLevel: "24%", keywords: 2 }, { domain: "sanchezplasticsurgery.com", commonLevel: "16%", keywords: 1 }] },
  "arvivaesthetics.com": { chatgpt: "25", aiOverview: "99", aiMode: "70", gemini: "9", trend: "+20%", competitors: [{ domain: "diehlplastics.com", commonLevel: "11%", keywords: 2 }, { domain: "vspotmedispa.com", commonLevel: "11%", keywords: 1 }] },
  "dolcemedicalspas.com": { chatgpt: "26", aiOverview: "0", aiMode: "10", gemini: "4", trend: "+6.4%" },
  "lovethenuyou.com": { chatgpt: "11", aiOverview: "1", aiMode: "24", gemini: "0", trend: "-1.4%" },
  "medaestheticsmiami.com": { chatgpt: "38", aiOverview: "14", aiMode: "39", gemini: "7", trend: "+1%" },
  "brickellcosmetic.com": { chatgpt: "43", aiOverview: "7", aiMode: "23", gemini: "6", trend: "+17%" },
  "avivamedicalspa.com": { chatgpt: "11", aiOverview: "5", aiMode: "12", gemini: "1", trend: "-47%" },
  "rejuvalinemedspa.com": { chatgpt: "6", aiOverview: "0", aiMode: "3", gemini: "1", trend: "+5.1%" },
  "feeltheheal.com": { chatgpt: "2", aiOverview: "6", aiMode: "5", gemini: "0", trend: "+5.4%" },
  "miamiskinspa.com": { chatgpt: "27", aiOverview: "10", aiMode: "15", gemini: "4", trend: "-36%" },
};

// LinkedIn verification pass (live, read-only on the authenticated session): each
// profile was visited and verified=true ONLY when the profile's NAME *and* CURRENT
// COMPANY match the prospect. Non-matches are recorded honestly, never forced.
const LINKEDIN: Record<string, { fLink?: string; fVerified?: boolean; fRole?: string; fNote?: string; dropDm2?: boolean; dm2Verified?: boolean; dm2Role?: string }> = {
  "miamiskinspa.com": { fVerified: true }, // Lee Coco — profile shows "Miami Skin Spa" ✓
  "rejuvalinemedspa.com": { fVerified: true }, // Odette Binker — "Business Owner @Rejuvaline MedSpa" ✓
  "zuriplasticsurgery.com": { fLink: "https://www.linkedin.com/in/alex-zuriarrain-md", fVerified: true }, // "Zuri Plastic Surgery" ✓
  "brickellcosmetic.com": { fLink: "https://www.linkedin.com/in/julie-pernas-49a4a097", fVerified: true }, // "Owner at Brickell Cosmetic Center" ✓
  "medaestheticsmiami.com": { fLink: "https://www.linkedin.com/in/medaestheticsmiami", fVerified: true }, // "Founder & President at MedAesthetics Miami" ✓
  "avivamedicalspa.com": { fLink: "https://www.linkedin.com/in/shimera-cama-lmhcbcba6610b846", fVerified: true, dropDm2: true }, // profile = Ava Franzoni "Founder of Aviva Medical Spa" ✓ (the shimera-cama slug IS Ava's, so drop the separate dm2)
  "dolcemedicalspas.com": { dm2Verified: true, dm2Role: "HR Director at Dolce Medical Spa" }, // Liel Cohen confirmed
  "lovethenuyou.com": { fLink: "https://www.linkedin.com/in/nicole-habib-mms-pa-c-860a1817", fVerified: false, fNote: "Founder per the NuYou site; her LinkedIn lists The Woodruff Institute as current employer, so current-company is unverified." },
  "arvivaesthetics.com": { fVerified: false, fNote: "LinkedIn confirms Dr. Tali Arviv but her current role is CEO @ Boutique Surgery Center — she has EXITED Arviv; not a current reachable decision-maker." },
  "feeltheheal.com": { fVerified: false, fNote: "No public LinkedIn found for Daryn Herzfeld (verified absent)." },
};

// 2nd decision-maker pass — live LinkedIn *company People page* scrape (current
// employees). `name` = a real DM2 found there; `soloNote` = checked-and-none (kept
// honest, never assumed). The note wording satisfies the research gate's DM2 check.
const DM2: Record<string, { name?: string; role?: string; verified?: boolean; soloNote?: string }> = {
  "zuriplasticsurgery.com": { name: "Yalexa Leon", role: "Practice Manager", verified: true },
  "arvivaesthetics.com": { name: "Marharyta Kuzmichova", role: "Facility Director", verified: true },
  "avivamedicalspa.com": { name: "Daniela Romero, PA-C", role: "Board-Certified Physician Assistant (clinical lead)", verified: true },
  "miamiskinspa.com": { name: "Joseph J. Almeida", role: "Managing Partner", verified: true },
  "lovethenuyou.com": { soloNote: "LinkedIn company People page lists no employees — only the founder Nicole Habib is public (solo, founder-led)." },
  "feeltheheal.com": { soloNote: "LinkedIn company People page lists no Feel The Heal staff — only the founder Daryn Herzfeld is public (solo, founder-led)." },
  "medaestheticsmiami.com": { soloNote: "LinkedIn company People page lists only administrative staff — only the founder Rosanna Bermejo is a public decision-maker." },
};

interface R {
  candidate: string;            // name as stored at discovery (to attach the domain)
  name: string; domain: string; rating: number; reviews: number;
  positioning: string; usp: string; services: string[];
  title: string; metaDescLen: number; schemaTypes: string[];
  hasLocalBusiness: boolean; hasPerson: boolean; hasFAQ: boolean; hasAggregateRating: boolean;
  h1Count: number; h2Count: number; renderedWords: number; images: number; imagesNoAlt: number;
  hasChatWidget?: boolean; hasWhatsApp?: boolean;
  authorityScore: number; organicTraffic: string; organicKeywords: string; backlinks: string; refDomains: string;
  aiMentions: number; aiCitedPages: number;
  businessEmail?: string | null; businessPhone?: string | null; instagram?: string | null;
  founder?: DossierContact | null; decisionMaker2?: DossierContact | null;
  starAsset?: string | null; isLeader?: boolean;
  pitch: string; notes?: string;
}

async function build(r: R): Promise<Dossier> {
  const dx = synthesizeDiagnosis({
    name: r.name, category: "med spa", geo: "Miami, FL", starAsset: r.starAsset ?? null,
    hasLocalBusiness: r.hasLocalBusiness, hasPerson: r.hasPerson, hasFAQ: r.hasFAQ, hasAggregateRating: r.hasAggregateRating,
    renderedWords: r.renderedWords, images: r.images, imagesNoAlt: r.imagesNoAlt,
    titleLen: r.title.length, metaDescLen: r.metaDescLen, h1Count: r.h1Count,
    authorityScore: r.authorityScore, aiMentions: r.aiMentions, citedPages: r.aiCitedPages,
    trafficTrend: AI_SPLIT[r.domain]?.trend ?? null,
    categoryLeader: r.isLeader ? null : LEADER,
  });
  // Real contact completion: derive each decision-maker's email pattern + MX-verify
  // the domain (no API key). LinkedIn-search half no-ops without SerpAPI — fine.
  const ctx = { domain: r.domain, business: r.name, city: "Miami" };
  const founder = r.founder ? await completeContact(r.founder, ctx) : null;
  let decisionMaker2 = r.decisionMaker2 ? await completeContact(r.decisionMaker2, ctx) : null;
  const ai: Partial<(typeof AI_SPLIT)[string]> = AI_SPLIT[r.domain] ?? {};
  // Apply the live LinkedIn verification pass (name + current company confirmed on-profile).
  const li = LINKEDIN[r.domain] ?? {};
  if (founder) {
    if (li.fLink) founder.linkedin = li.fLink;
    if (li.fVerified != null) founder.linkedinVerified = li.fVerified;
    if (li.fRole) founder.role = li.fRole;
    if (li.fNote) founder.source = (founder.source ? founder.source + " · " : "") + li.fNote;
  }
  if (li.dropDm2) decisionMaker2 = null;
  else if (decisionMaker2) {
    if (li.dm2Verified != null) decisionMaker2.linkedinVerified = li.dm2Verified;
    if (li.dm2Role) decisionMaker2.role = li.dm2Role;
  }
  // 2nd decision-maker from the LinkedIn company People-page pass (derive their email too).
  const dm2src = DM2[r.domain];
  if (!decisionMaker2 && dm2src?.name) {
    decisionMaker2 = await completeContact(
      { name: dm2src.name, role: dm2src.role ?? "Decision-maker", linkedinVerified: dm2src.verified ?? false, source: "LinkedIn company People page (current employee)" },
      ctx,
    );
  }
  const notes = r.notes + (dm2src?.soloNote ? " · " + dm2src.soloNote : "");
  return {
    name: r.name, domain: r.domain, category: "med spa", geo: "Miami, FL",
    positioning: r.positioning, usp: r.usp, services: r.services,
    googleRating: r.rating, googleReviews: r.reviews,
    contacts: {
      businessEmail: r.businessEmail ?? null, businessPhone: r.businessPhone ?? null,
      instagram: r.instagram ?? null, founder, decisionMaker2,
    },
    audit: {
      title: r.title, metaDescLen: r.metaDescLen, h1Count: r.h1Count, h2Count: r.h2Count,
      schemaTypes: r.schemaTypes, hasLocalBusiness: r.hasLocalBusiness, hasPerson: r.hasPerson,
      hasFAQ: r.hasFAQ, hasAggregateRating: r.hasAggregateRating, renderedWords: r.renderedWords,
      images: r.images, imagesNoAlt: r.imagesNoAlt, hasChatWidget: !!r.hasChatWidget, hasWhatsApp: !!r.hasWhatsApp,
    },
    competitive: {
      authorityScore: r.authorityScore, organicTraffic: r.organicTraffic, trafficTrend: ai.trend,
      organicKeywords: r.organicKeywords, backlinks: r.backlinks, refDomains: r.refDomains,
      aiVisibility: {
        mentions: r.aiMentions, citedPages: r.aiCitedPages,
        chatgpt: ai.chatgpt, aiOverview: ai.aiOverview, aiMode: ai.aiMode, gemini: ai.gemini,
      },
      competitors: ai.competitors ?? [],
      ...(r.isLeader ? {} : { categoryAiLeader: { domain: LEADER.domain, mentions: LEADER.mentions, citedPages: LEADER.citedPages, note: "highest AI visibility in the Miami set" } }),
    },
    topAiProblems: dx.problems, topFixes: dx.fixes, hook: dx.hook, weakPoints: dx.weakPoints,
    leadOffer: "aeo", pitch: r.pitch, outreachStatus: "new", notes,
    researchedNote: "Live Miami med-spa batch: browser-Maps discovery + rendered on-page audit + SEMrush overview + web search for decision-makers.",
  };
}

const PROSPECTS: R[] = [
  {
    candidate: "Dolce Medical Spa - Miami", name: "Dolce Medical Spa", domain: "dolcemedicalspas.com", rating: 5.0, reviews: 1147,
    positioning: "High-volume Miami med spa (SW Miami / Brickell) — Botox, CoolSculpting, fillers and 9+ aesthetic treatments.",
    usp: "The most-reviewed med spa in this Miami set — 1,147 reviews at a perfect 5.0★.",
    services: ["Botox", "CoolSculpting", "dermal fillers", "facials", "body contouring"],
    title: "Dolce Medical Spa", metaDescLen: 21, schemaTypes: [],
    hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    h1Count: 2, h2Count: 4, renderedWords: 470, images: 23, imagesNoAlt: 23, hasChatWidget: false, hasWhatsApp: false,
    authorityScore: 13, organicTraffic: "7K", organicKeywords: "717", backlinks: "2.2K", refDomains: "154", aiMentions: 40, aiCitedPages: 7,
    businessEmail: "miami@dolcemedicalspas.com", businessPhone: "+1 786-305-8898", instagram: "dolcemedicalspas",
    decisionMaker2: { name: "Liel Cohen", role: "Team (role unconfirmed)", linkedin: "https://www.linkedin.com/in/liel-cohen-505147322", linkedinVerified: false, source: "LinkedIn headline shows Dolce Medical Spa; role not confirmed" },
    starAsset: null, isLeader: false,
    pitch: "Dolce has the strongest real-world reputation in the set (1,147 reviews, 5.0★) but its site is its weakest asset: zero structured data, 470 words, all 23 images missing alt text, a 21-char meta. Authority 13 and 40 AI mentions vs the leader's 235 — schema + alt + content turn that reputation into AI-search visibility.",
    notes: "Most-reviewed in the Miami set. Owner not clearly public; Liel Cohen appears under Dolce Medical Spa on LinkedIn (role unconfirmed). Business contact: miami@dolcemedicalspas.com / 786-305-8898.",
  },
  {
    candidate: "Zuri Plastic Surgery", name: "Zuri Plastic Surgery", domain: "zuriplasticsurgery.com", rating: 4.9, reviews: 701,
    positioning: "Board-certified plastic-surgery practice in South Miami led by quadruple board-certified surgeon Dr. Alexander Zuriarrain.",
    usp: "Quadruple board-certified surgeon (8,000+ procedures); the category's strongest digital + AI footprint.",
    services: ["plastic surgery", "BBL", "breast augmentation", "facelift", "body contouring", "aesthetics"],
    title: "Plastic Surgery Miami | Plastic Surgeon Miami | Alexander Zuriarrain", metaDescLen: 165,
    schemaTypes: ["Organization", "MedicalOrganization", "LocalBusiness/MedicalBusiness/PlasticSurgery", "AggregateRating", "Person/Physician", "PostalAddress", "WebSite"],
    hasLocalBusiness: true, hasPerson: true, hasFAQ: false, hasAggregateRating: true,
    h1Count: 1, h2Count: 19, renderedWords: 1851, images: 203, imagesNoAlt: 0, hasChatWidget: false, hasWhatsApp: false,
    authorityScore: 33, organicTraffic: "9.2K", organicKeywords: "5.6K", backlinks: "2.5K", refDomains: "636", aiMentions: 235, aiCitedPages: 255,
    instagram: "drzplasticsurgery",
    founder: { name: "Dr. Alexander Zuriarrain", role: "Founder & Plastic Surgeon", linkedinVerified: false, source: "Official site /about/meet-dr-z + American Board of Cosmetic Surgery + The Aesthetic Society (identity verified; direct line not captured)" },
    starAsset: "Dr. Alexander Zuriarrain", isLeader: true,
    pitch: "Zuri is the AEO benchmark in Miami aesthetics — Authority 33, 235 AI mentions, 255 AI-cited pages, with LocalBusiness + Person + AggregateRating schema and 203 fully alt-tagged images. Only gap: FAQ schema. Low remaining upside makes it a weak AEO pitch — better used as the proof-point ('this is what good looks like') when pitching the others.",
    notes: "Category AI leader in the Miami set (235 mentions). Founder Dr. Alexander Zuriarrain verified via official site + cosmetic-surgery boards; direct personal contact not captured (practice contact public).",
  },
  {
    candidate: "NuYou Medical Aesthetics", name: "NuYou Medical Aesthetics", domain: "lovethenuyou.com", rating: 5.0, reviews: 466,
    positioning: "Boutique Miami med spa (Biscayne Blvd) founded by PA-C injector Nicole Habib — Botox, Sculptra, weight loss, skin.",
    usp: "Founder-led by an advanced injector with 14+ years; 5.0★ across 466 reviews.",
    services: ["Botox", "Sculptra", "medical weight loss", "skin treatments", "dermal fillers"],
    title: "Miami's top-rated expert in Botox, Sculptra, weight loss & skin", metaDescLen: 102,
    schemaTypes: ["WebSite", "Organization", "LocalBusiness", "AggregateRating", "Place"],
    hasLocalBusiness: true, hasPerson: false, hasFAQ: false, hasAggregateRating: true,
    h1Count: 2, h2Count: 28, renderedWords: 1218, images: 41, imagesNoAlt: 33, hasChatWidget: false, hasWhatsApp: false,
    authorityScore: 12, organicTraffic: "3.7K", organicKeywords: "755", backlinks: "2.2K", refDomains: "186", aiMentions: 36, aiCitedPages: 2,
    founder: { name: "Nicole Habib, MMS, PA-C", role: "Founder & Lead Injector", linkedinVerified: false, source: "Official site /meet-nicole-habib + /team" },
    starAsset: "Nicole Habib (founder, PA-C)", isLeader: false,
    pitch: "NuYou has the foundations (LocalBusiness + AggregateRating schema, 1,218 words) but its founder — advanced injector Nicole Habib — is invisible to AI: no Person/credential schema, despite YMYL aesthetics queries rewarding practitioner authority. Add Person + FAQ + alt text on 33 unlabelled images and its 36 AI mentions (vs the leader's 235) should climb.",
    notes: "Founder Nicole Habib (PA-C) verified via official site. Only 2 AI-cited pages — thin citable content.",
  },
  {
    candidate: "Brickell Cosmetic Center", name: "Brickell Cosmetic Center", domain: "brickellcosmetic.com", rating: 4.6, reviews: 447,
    positioning: "Established (2009) Brickell aesthetics & dermatology center — injectables, laser, skin — founder-led with a board-certified medical director.",
    usp: "15+ years in Brickell; board-certified dermatologist medical director.",
    services: ["injectables", "laser", "dermatology", "skin treatments", "body contouring"],
    title: "Top Cosmetic Center in Miami, FL | Brickell Cosmetic Center", metaDescLen: 138,
    schemaTypes: ["WebPage", "Organization", "Physician", "BreadcrumbList", "PostalAddress", "WebSite"],
    hasLocalBusiness: true, hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    h1Count: 3, h2Count: 14, renderedWords: 826, images: 68, imagesNoAlt: 0, hasChatWidget: true, hasWhatsApp: false,
    authorityScore: 26, organicTraffic: "2.9K", organicKeywords: "1.9K", backlinks: "1.2K", refDomains: "321", aiMentions: 79, aiCitedPages: 58,
    instagram: "bcc_miami",
    founder: { name: "Julie Pernas", role: "Owner & Founder (Master Aesthetician)", linkedinVerified: false, source: "Crunchbase + site /our-team" },
    decisionMaker2: { name: "Dr. Chacon", role: "Medical Director (board-certified dermatologist)", linkedinVerified: false, source: "Site /our-team" },
    starAsset: "Dr. Chacon (medical director)", isLeader: false,
    pitch: "Brickell is well-built (Organization + Physician schema, all images alt-tagged, live chat) and already pulls 79 AI mentions — third-best in the set. Missing: AggregateRating schema (447 reviews at 4.6★ not marked up) and FAQ content. Closing those two narrows the distance to the leader (235) fast.",
    notes: "Two decision-makers: founder Julie Pernas (master aesthetician) + medical director Dr. Chacon. IG @bcc_miami. Has live chat widget.",
  },
  {
    candidate: "Med Aesthetics Miami", name: "Med Aesthetics Miami", domain: "medaestheticsmiami.com", rating: 4.8, reviews: 433,
    positioning: "Multi-location Miami med spa (Coral Gables, Aventura, Lauderdale) — laser, injectables, skin — founder-led by NP Rosanna Bermejo.",
    usp: "NP-founder-led, 15+ yrs; strong content footprint (3.9K keywords, 98 AI mentions) across 3 locations.",
    services: ["laser hair removal", "injectables", "dermal fillers", "skin treatments", "body contouring"],
    title: "Med Spa Miami | Laser Hair Removal, toxin & Aesthetic Treatments | Med Aesthetics Miami", metaDescLen: 149,
    schemaTypes: ["WebPage", "MedicalClinic", "AggregateRating", "MedicalProcedure", "MedicalTherapy", "BreadcrumbList"],
    hasLocalBusiness: true, hasPerson: false, hasFAQ: false, hasAggregateRating: true,
    h1Count: 0, h2Count: 13, renderedWords: 1412, images: 62, imagesNoAlt: 1, hasChatWidget: true, hasWhatsApp: false,
    authorityScore: 25, organicTraffic: "5.2K", organicKeywords: "3.9K", backlinks: "2.3K", refDomains: "349", aiMentions: 98, aiCitedPages: 315,
    founder: { name: "Rosanna Bermejo, MBA MSN", role: "Founder & President (Nurse Practitioner)", linkedinVerified: false, source: "Official site /about/our-team" },
    starAsset: "Rosanna Bermejo (founder, NP)", isLeader: false,
    pitch: "Med Aesthetics Miami is a strong performer — Authority 25, 98 AI mentions, 315 AI-cited pages across 3 locations — with MedicalClinic + AggregateRating schema. Two fixable gaps cap it: the homepage has no H1, and founder NP Rosanna Bermejo has no Person/credential schema. Add Person + FAQ and fix the H1 to push 98 toward the leader's 235.",
    notes: "Founder Rosanna Bermejo (NP, MBA) verified via site. Homepage missing an H1 (heading-structure issue). 3 FL locations (Coral Gables, Aventura, Lauderdale).",
  },
  {
    candidate: "Arviv Medical Aesthetics Miami", name: "Arviv Medical Aesthetics", domain: "arvivaesthetics.com", rating: 4.8, reviews: 405,
    positioning: "Multi-location FL med spa (Miami, Tampa, Ocala) — body & face rejuvenation — medical director Dr. Tali Arviv.",
    usp: "Strongest organic footprint after Zuri — 20.8K traffic, 203 AI mentions; board-certified medical director.",
    services: ["laser", "body contouring", "injectables", "skin rejuvenation", "facial rejuvenation"],
    title: "Arviv Medical Aesthetics | Luxurious MedSpas in Florida", metaDescLen: 159,
    schemaTypes: ["WebPage", "Organization", "MedicalBusiness", "Person", "Place", "Service", "PostalAddress"],
    hasLocalBusiness: true, hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    h1Count: 2, h2Count: 4, renderedWords: 525, images: 12, imagesNoAlt: 0, hasChatWidget: true, hasWhatsApp: false,
    authorityScore: 29, organicTraffic: "20.8K", organicKeywords: "14.9K", backlinks: "3.9K", refDomains: "976", aiMentions: 203, aiCitedPages: 447,
    instagram: "arviv_aesthetics",
    founder: { name: "Dr. Tali Arviv", role: "Medical Director & Founder (exited ownership)", linkedin: "https://www.linkedin.com/in/tali-arviv-0a955732", linkedinVerified: false, source: "LinkedIn + site /our-team (board-certified; per public sources exited ownership)" },
    starAsset: "Dr. Tali Arviv (medical director)", isLeader: false,
    pitch: "Arviv punches above the set on reach — 20.8K organic visits and 203 AI mentions, near the leader (235) — with MedicalBusiness + Person schema. But the homepage is thin (525 words) with no FAQ or AggregateRating, and its 405 reviews at 4.8★ aren't marked up. Deepen the homepage + add FAQ/AggregateRating to convert that authority into the #1 AI slot.",
    notes: "Dr. Tali Arviv (board-certified, aesthetics) is medical director; per public sources she exited ownership. Multi-state brand (Miami/Tampa/Ocala). 447 AI-cited pages. IG @arviv_aesthetics.",
  },
  {
    candidate: "Aviva Medical Spa", name: "Aviva Medical Spa", domain: "avivamedicalspa.com", rating: 4.7, reviews: 334,
    positioning: "Miami Design District med spa (est. 2009) — aesthetics & wellness — founder Ava Franzoni.",
    usp: "Design District location, 15+ yrs; 334 reviews at 4.7★.",
    services: ["laser hair removal", "injectables", "skin treatments", "wellness", "body contouring"],
    title: "Aviva Medical Spa - Miami Design District", metaDescLen: 365,
    schemaTypes: ["BreadcrumbList", "Organization", "MedicalOrganization", "WebPage", "WebSite"],
    hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    h1Count: 32, h2Count: 17, renderedWords: 449, images: 50, imagesNoAlt: 50, hasChatWidget: true, hasWhatsApp: false,
    authorityScore: 17, organicTraffic: "407", organicKeywords: "1.5K", backlinks: "832", refDomains: "197", aiMentions: 29, aiCitedPages: 36,
    instagram: "aviva_medspa",
    founder: { name: "Ava Franzoni", role: "Founder", linkedinVerified: false, source: "Site /about-us + press" },
    decisionMaker2: { name: "Shimera Cama", role: "Owner (per LinkedIn)", linkedin: "https://www.linkedin.com/in/shimera-cama-lmhcbcba6610b846/", linkedinVerified: false, source: "LinkedIn headline: Medical Spa Owner — Aviva Medical Spa" },
    starAsset: "Ava Franzoni (founder)", isLeader: false,
    pitch: "Aviva has the location and tenure (Design District since 2009) but the weakest technical foundation in the set: no LocalBusiness/Person/FAQ/AggregateRating schema (only Organization), 32 H1 tags (broken heading structure), all 50 images missing alt, and only 407 organic visits/mo. At 29 AI mentions it's nearly invisible — schema + headings + alt is a high-leverage reset.",
    notes: "Founder Ava Franzoni; Shimera Cama listed as owner on LinkedIn (both associated). Homepage has 32 H1s + all 50 images missing alt; has MedicalOrganization but not LocalBusiness schema. IG @aviva_medspa.",
  },
  {
    candidate: "Rejuvaline Medspa", name: "Rejuvaline Medspa", domain: "rejuvalinemedspa.com", rating: 4.9, reviews: 261,
    positioning: "Family-run Miami med spa (SW Miami) — skincare, body sculpting, wellness — owner Odette Binker, physician medical directors.",
    usp: "22+ years' owner experience; physician medical directors; 4.9★.",
    services: ["skincare", "body sculpting", "wellness", "injectables", "laser"],
    title: "Rejuvaline Medspa | Indulge in a state of the art selection of treatments...", metaDescLen: 0,
    schemaTypes: [],
    hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    h1Count: 0, h2Count: 13, renderedWords: 1508, images: 55, imagesNoAlt: 29, hasChatWidget: true, hasWhatsApp: false,
    authorityScore: 16, organicTraffic: "655", organicKeywords: "302", backlinks: "623", refDomains: "175", aiMentions: 10, aiCitedPages: 6,
    businessPhone: "+1 305-266-0006", instagram: "rejuvalinemedspa",
    founder: { name: "Odette Binker", role: "Owner / Founder", linkedin: "https://www.linkedin.com/in/odette-binker-529127272/", linkedinVerified: false, source: "LinkedIn + site /contact (22+ yrs)" },
    decisionMaker2: { name: "Rodolfo Binker, MD", role: "Medical Director", linkedinVerified: false, source: "Site team page (physician medical director)" },
    starAsset: "Rodolfo Binker MD (medical director)", isLeader: false,
    pitch: "Rejuvaline has real content (1,508 words) and a physician-led team, but the technical foundation is broken: zero schema, no meta description, a 171-character title that's a full sentence, and no H1. AI sees almost nothing — 10 mentions, 6 cited pages. A schema + title/meta + H1 pass is the fastest path to visibility for a 4.9★, 261-review business.",
    notes: "Owner Odette Binker (22+ yrs); medical directors Josefa & Rodolfo Binker MD. Phone 305-266-0006. Title is a 171-char sentence; no meta description; zero schema.",
  },
  {
    candidate: "Feel The Heal", name: "Feel The Heal", domain: "feeltheheal.com", rating: 4.8, reviews: 210,
    positioning: "Holistic detox + skincare med spa (Miami, 20+ yrs, Knoxon Wotel) — colonics, medical-grade skin — founder Daryn Herzfeld.",
    usp: "20+ years; distinctive gut-health + skincare positioning; 3 locations.",
    services: ["colon hydrotherapy", "medical-grade facials", "detox", "skincare", "IV therapy"],
    title: "Feel The Heal – Miami's Premier Detox Medspa!", metaDescLen: 317,
    schemaTypes: ["Organization", "WebSite", "SearchAction"],
    hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    h1Count: 5, h2Count: 8, renderedWords: 562, images: 7, imagesNoAlt: 0, hasChatWidget: false, hasWhatsApp: false,
    authorityScore: 15, organicTraffic: "701", organicKeywords: "457", backlinks: "1.3K", refDomains: "215", aiMentions: 13, aiCitedPages: 26,
    instagram: "feeltheheal",
    founder: { name: "Daryn Herzfeld", role: "Founder (Master Esthetician)", linkedinVerified: false, source: "Official site /about-me + press (20+ yrs)" },
    starAsset: "Daryn Herzfeld (founder)", isLeader: false,
    pitch: "Feel The Heal has a distinctive 20-year niche (gut-health + skincare) and a known founder, but its Wix-style site carries only Organization schema — no LocalBusiness, no Person for Daryn Herzfeld, no FAQ, no AggregateRating — and just 562 words. At 13 AI mentions, adding schema + founder markup + FAQ content would let AI actually describe what makes it unique.",
    notes: "Founder Daryn Herzfeld (master esthetician, 20+ yrs). Wix-style site (Organization + WebSite schema only). IG @feeltheheal / @medspa.miami.",
  },
  {
    candidate: "Miami Skin Spa Aesthetics & Wellness", name: "Miami Skin Spa", domain: "miamiskinspa.com", rating: 4.8, reviews: 157,
    positioning: "Brickell med spa — Morpheus8, Emsculpt, injectables — founder Lee Coco.",
    usp: "Brickell premier positioning; well-structured site; 56 AI mentions on a small footprint.",
    services: ["Morpheus8", "Emsculpt", "injectables", "skin rejuvenation", "body sculpting"],
    title: "Miami Skin Spa | Med Spa in Miami, Brickell — Morpheus8, Emsculpt, Injectables", metaDescLen: 254,
    schemaTypes: ["MedicalClinic", "PostalAddress", "GeoCoordinates", "Place", "City", "MedicalProcedure"],
    hasLocalBusiness: true, hasPerson: true, hasFAQ: false, hasAggregateRating: false,
    h1Count: 1, h2Count: 7, renderedWords: 1281, images: 15, imagesNoAlt: 0, hasChatWidget: false, hasWhatsApp: false,
    authorityScore: 18, organicTraffic: "1.1K", organicKeywords: "2.5K", backlinks: "945", refDomains: "329", aiMentions: 56, aiCitedPages: 126,
    instagram: "miaskinspa",
    founder: { name: "Lee Coco", role: "Founder", linkedin: "https://www.linkedin.com/in/lee-coco-5477b5ba/", linkedinVerified: false, source: "LinkedIn + site" },
    starAsset: "Lee Coco (founder)", isLeader: false,
    pitch: "Miami Skin Spa is well-built for its size — MedicalClinic + MedicalProcedure schema, clean H1, 1,281 words, images alt'd — and already earns 56 AI mentions and 126 cited pages off just 157 reviews. The two gaps are FAQ and AggregateRating schema. Closing them is a quick win to compound an already-efficient AI footprint.",
    notes: "Founder Lee Coco (LinkedIn). Strong schema for its size; missing FAQ + AggregateRating. IG @miaskinspa.",
  },
];

// Attach each resolved domain to the row created at discovery, so recordDossier
// updates THAT row (dedup is by domain) instead of inserting a duplicate.
for (const r of PROSPECTS) {
  await q(`update ${T.prospects} set domain=$2 where name=$1 and domain is null`, [r.candidate, r.domain]);
}

let n = 0;
for (const r of PROSPECTS) {
  const id = await recordDossier(await build(r));
  console.log(`[miami] ${r.name.padEnd(26)} → ${id}`);
  n++;
}
const cnt = await pool.query("select count(*)::int as n from prospect.prospects where research_status='researched'");
console.log(`\n[miami] batch persisted: ${n} dossiers · DB now holds ${cnt.rows[0].n} researched prospects total`);
await pool.end();
