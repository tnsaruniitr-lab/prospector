import type { Dossier } from "./dossier.js";
import { synthesizeDiagnosis } from "./synthesis.js";

// Diagnoses are CODE-GENERATED from detected signals (not hand-written).
const altadermaDx = synthesizeDiagnosis({
  name: "Altaderma", category: "aesthetics", geo: "Dubai",
  starAsset: "a Dubai Police health advisor with a Harvard fellowship (Dr. Singel)",
  hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
  renderedWords: 649, images: 52, imagesNoAlt: 32, hreflang: [],
  authorityScore: 14, aiMentions: 19, citedPages: 57, trafficTrend: "↓67%",
  categoryLeader: { domain: "hortmanclinics.com", mentions: 26, citedPages: 131 },
});
const edenDx = synthesizeDiagnosis({
  name: "EDEN Aesthetics", category: "aesthetics", geo: "Dubai",
  starAsset: "an award-winning longevity clinic",
  hasLocalBusiness: true, hasPerson: true, hasFAQ: false, hasAggregateRating: true,
  renderedWords: 809, images: 39, imagesNoAlt: 1, hreflang: ["x-default", "ar-ae", "ru-ru", "en-gb"],
  authorityScore: 32, aiMentions: 24, citedPages: 114, trafficTrend: "+18%",
  categoryLeader: { domain: "hortmanclinics.com", mentions: 26, citedPages: 131 },
});

// Canonical sample dossiers — all values gathered LIVE via the browser
// (rendered audit, SEMrush overview + AI visibility + competitors, LinkedIn verification).
// google_rating/reviews come from the Places/Maps discovery step (not yet run here).

export const altaderma: Dossier = {
  name: "Altaderma",
  domain: "altaderma.com",
  category: "Cosmetic Dermatology Clinic",
  geo: "Dubai, UAE",
  googleRating: null,
  googleReviews: null,
  positioning: "Luxury cosmetic-dermatology clinic and aesthetic training centre, marketed on medical authority and a celebrity medical director.",
  usp: "Medical Director Maj. Gen. Dr. Ali Singel — 30+ years, Royal College of Surgeons Ireland, Harvard fellowship, General Health Advisor to Dubai Police.",
  services: ["cosmetic dermatology", "laser & phototherapy", "injectables", "aesthetic medicine", "aesthetic training"],
  contacts: {
    businessEmail: "info@altaderma.com",
    secondEmail: null,
    businessPhone: "+971 4 271 1900",
    whatsapp: "+971 50 996 7314",
    instagram: "instagram.com/altadermaclinic",
    founder: {
      name: "Maj. Gen. Dr. Ali Singel",
      role: "Medical Director / Owner",
      email: "ali.singel@altaderma.com",
      phone: null,
      linkedin: "https://www.linkedin.com/in/major-general-dr-ali-singel-50488420/",
      linkedinVerified: true,
    },
    decisionMaker2: {
      name: "Joelle Merhi",
      role: "Manager (clinic operations)",
      email: "joelle.merhi@altaderma.com", phone: null,
      linkedin: "https://www.linkedin.com/in/joelle-merhi-13b744b2", linkedinVerified: false,
      source: "LinkedIn company People page",
    },
    others: [{ name: "Fernanda Jimenez", role: "Administrator", linkedin: "https://www.linkedin.com/in/fernanda-jimenez-030156228", source: "LinkedIn company People page" }],
  },
  audit: {
    title: "Best Aesthetic Clinic in Dubai - Altaderma",
    metaDescLen: 130, h1Count: 1, h2Count: 7,
    schemaTypes: ["WebPage", "BreadcrumbList", "WebSite", "SearchAction"],
    hasLocalBusiness: false, hasPerson: false, hasFAQ: false, hasAggregateRating: false,
    hreflang: [], renderedWords: 649, images: 52, imagesNoAlt: 32,
    hasChatWidget: true, hasWhatsAppBot: false, hasWhatsApp: true,
  },
  competitive: {
    authorityScore: 14, organicTraffic: "118/mo", trafficTrend: "↓67%",
    organicKeywords: "467", backlinks: "1.2K", refDomains: "261",
    aiVisibility: { mentions: 19, citedPages: 57, chatgpt: "52", gemini: "2", aiOverview: "1", aiMode: "10" },
    competitors: [
      { domain: "yorkshireskincentre.co.uk", commonLevel: "1%", keywords: "481" },
      { domain: "amsaesthetics.com", commonLevel: "1%", keywords: "435" },
      { domain: "amedics.co.uk", commonLevel: "2%", keywords: "293" },
    ],
    categoryAiLeader: { domain: "hortmanclinics.com", mentions: 26, citedPages: 131, note: "category is wide open — even the leader has just 26 AI mentions / 131 cited pages" },
  },
  topAiProblems: altadermaDx.problems,
  topFixes: altadermaDx.fixes,
  hook: altadermaDx.hook,
  leadOffer: "aeo",
  pitch: "AI search for Dubai aesthetics is wide open — the leader (Hortman) has just 26 AI mentions; you sit at 19 despite a more decorated MD (Dr. Singel — Dubai Police advisor, Harvard). The reason: ChatGPT can't see his credentials (no Person schema) or even identify the clinic (no LocalBusiness schema). Meanwhile EDEN is winning the old SEO game with 48× your search traffic. Add the schema + an FAQ hub and you can OWN AI search for Dubai aesthetics before competitors wake up.",
  priorityNote: "High priority — strong real-world authority + severe digital/AI gaps + a wide-open AI category = clearest 'imagine if we fixed this' case.",
  outreachStatus: "new",
  notes: "Both decision-maker emails are first.last@ patterns on a mail-accepting domain (MX-confirmed = valid_domain); mailbox-level verification pending (Apollo/Hunter). Founder also @dr_alisingel on IG; runs the a4mdubai training academy.",
  researchedNote: "Live rendered audit + SEMrush overview / AI visibility / competitors + LinkedIn profile verification (Dr. Ali Singel, confirmed via session).",
};

export const eden: Dossier = {
  name: "EDEN Aesthetics",
  domain: "edenderma.com",
  category: "Aesthetic Clinic / Med Spa",
  geo: "Dubai, UAE",
  googleRating: null,
  googleReviews: null,
  positioning: "Luxury aesthetics + longevity 'sanctuary'; 4×-awarded, international board-certified doctors.",
  usp: "Longevity / regenerative angle under one roof (aesthetics, surgery, dental, gynecology, IV).",
  services: ["aesthetics", "longevity", "plastic surgery", "dental", "gynecology", "IV therapy"],
  contacts: {
    businessEmail: "contact@edenderma.com",
    secondEmail: null,
    businessPhone: "+971 4 577 4796",
    whatsapp: "+971 4 577 4796",
    instagram: "instagram.com/eden.clinic.dubai",
    founder: { name: "Dr. Farshad Zadeh", role: "Medical Director / Owner", email: null, phone: null, linkedin: null, linkedinVerified: false },
    decisionMaker2: { name: "Christian Forstner", role: "Business Partner / Entrepreneur", email: null, phone: null, linkedin: null, linkedinVerified: false, source: "EDEN team page" },
  },
  audit: {
    title: "Best Aesthetics Clinic in Dubai 2025 | EDEN AESTHETICS",
    metaDescLen: 145, h1Count: 1, h2Count: 2,
    schemaTypes: ["WebSite", "LocalBusiness", "PostalAddress", "AggregateRating", "Review", "Rating", "Person", "Organization"],
    hasLocalBusiness: true, hasPerson: true, hasFAQ: false, hasAggregateRating: true,
    hreflang: ["x-default", "ar-ae", "ru-ru", "en-gb"], renderedWords: 809, images: 39, imagesNoAlt: 1,
    hasChatWidget: false, hasWhatsAppBot: false, hasWhatsApp: true,
  },
  competitive: {
    authorityScore: 32, organicTraffic: "5.7K/mo", trafficTrend: "+18%",
    organicKeywords: "2.9K", backlinks: "55.2K", refDomains: "1.1K",
    aiVisibility: { mentions: 24, citedPages: 114, chatgpt: "41", gemini: "45", aiOverview: "1", aiMode: "27" },
    categoryAiLeader: { domain: "hortmanclinics.com", mentions: 26, citedPages: 131, note: "category wide open — leader only 26 mentions" },
  },
  topAiProblems: edenDx.problems,
  topFixes: edenDx.fixes,
  hook: edenDx.hook,
  leadOffer: "aeo",
  pitch: "EDEN dominates Dubai aesthetics on classic SEO (Authority 32, 5.7K traffic growing, 55K backlinks) — but that authority isn't converting to AI: just 24 mentions, barely ahead of clinics 1/40th your size. The leader sits at only 26, so AI search is still wide open. Add an FAQ hub + complete your review/Person schema and you convert your existing authority into AI-answer dominance before anyone else does.",
  priorityNote: "Medium-high — already strong on SEO; the wedge is converting authority into AI citations (FAQ + schema completeness).",
  outreachStatus: "new",
  notes: "Business partner Christian Forstner listed on team page; founder Dr. Farshad Zadeh has no personal LinkedIn (verified absent).",
  researchedNote: "Live rendered audit + SEMrush overview / AI visibility + site enrichment. Founder LinkedIn genuinely not found.",
};
