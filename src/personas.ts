/**
 * Seller persona library + Signal Map + plan scaffolding.
 *
 * Spec: docs/configurable-sources-design.md (Phase 1).
 *
 * A persona = "what you sell." It drives:
 *   - which browser sources to run (defaultResearchSources)
 *   - what facts to extract from each (signalMap)
 *   - how to weight relevance (relevanceWeights) + the ideal scale band
 *   - the pitch/value-prop language
 *
 * scaffoldPlan() turns "persona + who + where" into a pre-filled, editable
 * ResearchPlan — the AI-scaffolded starting point the user then refines.
 *
 * Browser-only: every source is a logged-in Chrome recipe. No API keys.
 */

import type {
  ResearchPlan,
  ResearchSource,
  ResearchSourceType,
  ContactSourceType,
  Signal,
  OutputField,
} from "./research-plan.js";

// ── Scale band: where reach-worthiness peaks (sweet spot, not "bigger=better") ─
export interface ScaleBand {
  metric: "review_count" | "headcount" | "organic_traffic";
  tooSmall: number; // below this → no budget
  idealLow: number; // sweet spot starts
  idealHigh: number; // sweet spot ends
  tooBig: number; // above this → slow / unreachable / already-served
}

// ── Relevance weights (sum used as-is; tuned per persona) ───────────────────
export interface RelevanceWeights {
  painFit: number; // do they have the pain you solve
  capacity: number; // can they afford you (composite proxies)
  scale: number; // proximity to the ideal scale band
  reachable: number; // can you get to a decision-maker
  timing: number; // "why now" triggers
}

export interface SellerPersona {
  id: string;
  name: string;
  offer: string;
  valueProp: string;
  painArchetype: string; // ties to brand-onboarding-design.md archetypes
  defaultResearchSources: ResearchSourceType[];
  defaultContactSource: ContactSourceType;
  signalMap: Partial<Record<ResearchSourceType, Signal[]>>;
  idealScale: ScaleBand;
  relevanceWeights: RelevanceWeights;
  disqualifiers: string[]; // hard nos (plain-language; enforced in relevance-v2)
}

// ── The library ─────────────────────────────────────────────────────────────

export const PERSONAS: Record<string, SellerPersona> = {
  // 1) Your use case — AI-search visibility + lead conversion (dual wedge)
  ai_search_visibility: {
    id: "ai_search_visibility",
    name: "AI-search visibility + lead conversion",
    offer: "Get found in AI search (ChatGPT/Gemini/AI Overviews) AND convert the visitors you earn",
    valueProp: "turn an established reputation into AI-search visibility AND captured leads",
    painArchetype: "ai_invisibility",
    defaultResearchSources: ["semrush_ai", "onpage_audit", "google_maps", "pagespeed"],
    defaultContactSource: "linkedin",
    signalMap: {
      semrush_ai: [
        { key: "ai_mentions", meaning: "how often AI engines mention them", painThreshold: "pain if < 30", pitchWeight: 8 },
        { key: "ai_delta_vs_leader", meaning: "gap vs the category AI leader", painThreshold: "pain if leader > 2x", pitchWeight: 9 },
        { key: "cited_pages", meaning: "pages AI quotes from them", painThreshold: "pain if few", pitchWeight: 6 },
        { key: "organic_traffic", meaning: "traffic they're leaking if conversion is weak", pitchWeight: 5 },
      ],
      onpage_audit: [
        // Visibility signals
        { key: "missing_schema", meaning: "no LocalBusiness/Person/FAQ markup", painThreshold: "pain if missing", pitchWeight: 8 },
        { key: "rendered_words", meaning: "thin content AI can't cite", painThreshold: "pain if < 300", pitchWeight: 4 },
        // Lead-conversion signals (the second wedge)
        { key: "has_booking_link", meaning: "can a visitor book/convert in one click", painThreshold: "pain if absent", pitchWeight: 8 },
        { key: "has_clear_cta", meaning: "a clear primary call-to-action above the fold", painThreshold: "pain if weak/absent", pitchWeight: 7 },
        { key: "has_lead_capture", meaning: "form / chat / WhatsApp to capture a lead", painThreshold: "pain if none", pitchWeight: 7 },
        { key: "shows_reviews", meaning: "social proof on-site (rating/testimonials)", painThreshold: "pain if hidden", pitchWeight: 5 },
      ],
      pagespeed: [
        { key: "performance_score", meaning: "slow pages bleed conversions", painThreshold: "pain if < 50", pitchWeight: 6 },
      ],
      google_maps: [
        { key: "google_rating", meaning: "social proof + the reputation they're not converting", pitchWeight: 3 },
        { key: "review_count", meaning: "scale / established / earned traffic to convert", pitchWeight: 4 },
      ],
    },
    idealScale: { metric: "review_count", tooSmall: 10, idealLow: 40, idealHigh: 2000, tooBig: 50000 },
    relevanceWeights: { painFit: 35, capacity: 20, scale: 15, reachable: 20, timing: 10 },
    disqualifiers: ["no_website", "wrong_vertical", "already_ai_dominant"],
  },

  // 2) Website redesign for outdated sites
  web_redesign: {
    id: "web_redesign",
    name: "Website redesign",
    offer: "Modern, fast, conversion-focused website rebuilds",
    valueProp: "replace a dated, slow site with one that converts",
    painArchetype: "conversion_gap",
    defaultResearchSources: ["pagespeed", "onpage_audit", "semrush_seo"],
    defaultContactSource: "linkedin",
    signalMap: {
      pagespeed: [
        { key: "performance_score", meaning: "load speed", painThreshold: "pain if < 50", pitchWeight: 9 },
        { key: "mobile_friendly", meaning: "mobile usability", painThreshold: "pain if false", pitchWeight: 7 },
      ],
      onpage_audit: [
        { key: "copyright_year", meaning: "site age signal", painThreshold: "pain if 2+ yrs old", pitchWeight: 6 },
        { key: "has_viewport", meaning: "responsive baseline", painThreshold: "pain if false", pitchWeight: 5 },
        { key: "rendered_words", meaning: "content depth", pitchWeight: 3 },
      ],
      semrush_seo: [
        { key: "organic_traffic", meaning: "enough visitors to justify spend", pitchWeight: 5 },
      ],
    },
    idealScale: { metric: "organic_traffic", tooSmall: 200, idealLow: 1000, idealHigh: 200000, tooBig: 5000000 },
    relevanceWeights: { painFit: 30, capacity: 25, scale: 15, reachable: 20, timing: 10 },
    disqualifiers: ["no_website", "site_already_modern"],
  },

  // 3) SEO services
  seo_services: {
    id: "seo_services",
    name: "SEO services",
    offer: "Organic growth — rankings, traffic, backlinks",
    valueProp: "grow qualified organic traffic and rankings",
    painArchetype: "reach_starvation",
    defaultResearchSources: ["semrush_seo", "onpage_audit"],
    defaultContactSource: "linkedin",
    signalMap: {
      semrush_seo: [
        { key: "authority_score", meaning: "domain strength", painThreshold: "pain if < 30", pitchWeight: 7 },
        { key: "organic_traffic", meaning: "current traffic", pitchWeight: 5 },
        { key: "organic_traffic_trend", meaning: "trend", painThreshold: "pain if declining", pitchWeight: 8 },
        { key: "organic_keywords", meaning: "coverage", pitchWeight: 5 },
        { key: "backlinks", meaning: "off-page strength", painThreshold: "pain if thin", pitchWeight: 6 },
      ],
      onpage_audit: [
        { key: "title_len", meaning: "title hygiene", painThreshold: "pain if >60 or missing", pitchWeight: 4 },
        { key: "missing_schema", meaning: "structured data gaps", pitchWeight: 5 },
      ],
    },
    idealScale: { metric: "organic_traffic", tooSmall: 100, idealLow: 500, idealHigh: 500000, tooBig: 10000000 },
    relevanceWeights: { painFit: 35, capacity: 20, scale: 15, reachable: 20, timing: 10 },
    disqualifiers: ["no_website", "already_dominant_organic"],
  },

  // 4) Recruiting / talent services — SEMrush irrelevant; LinkedIn-driven
  recruiting: {
    id: "recruiting",
    name: "Recruiting / talent",
    offer: "Help filling roles faster — sourcing + hiring",
    valueProp: "fill open roles faster with better candidates",
    painArchetype: "pipeline_absent",
    defaultResearchSources: ["linkedin_company", "google_maps"],
    defaultContactSource: "linkedin",
    signalMap: {
      linkedin_company: [
        { key: "headcount", meaning: "company size", pitchWeight: 5 },
        { key: "open_roles", meaning: "actively hiring = need now", painThreshold: "opportunity if > 0", pitchWeight: 9 },
        { key: "headcount_growth", meaning: "growing = more hiring", pitchWeight: 6 },
      ],
      google_maps: [
        { key: "review_count", meaning: "scale proxy", pitchWeight: 3 },
      ],
    },
    idealScale: { metric: "headcount", tooSmall: 5, idealLow: 20, idealHigh: 1000, tooBig: 20000 },
    relevanceWeights: { painFit: 30, capacity: 15, scale: 15, reachable: 20, timing: 20 },
    disqualifiers: ["not_hiring"],
  },
};

export function getPersona(id: string): SellerPersona | null {
  return PERSONAS[id] ?? null;
}

export function listPersonas(): SellerPersona[] {
  return Object.values(PERSONAS);
}

// ── Output contract: derive the dossier fields from the persona's signals ──
// Every output field traces back to a signal (no orphan/fabricated fields).
const SIGNAL_TO_GROUP: Record<string, OutputField["group"]> = {
  ai_mentions: "pain", ai_delta_vs_leader: "pain", cited_pages: "pain",
  missing_schema: "pain", rendered_words: "pain", performance_score: "pain",
  mobile_friendly: "pain", copyright_year: "pain", has_viewport: "pain",
  authority_score: "pain", organic_traffic_trend: "pain", organic_keywords: "pain",
  backlinks: "pain", title_len: "pain", open_roles: "pain", headcount_growth: "pain",
  organic_traffic: "capacity", review_count: "capacity", headcount: "capacity",
  google_rating: "capacity",
};

function deriveOutputFields(persona: SellerPersona): OutputField[] {
  const fields: OutputField[] = [
    { key: "name", label: "Business", group: "identity", fromSignal: "identity" },
    { key: "domain", label: "Domain", group: "identity", fromSignal: "identity" },
  ];
  const seen = new Set<string>();
  for (const sigs of Object.values(persona.signalMap)) {
    for (const s of sigs ?? []) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      fields.push({
        key: s.key,
        label: s.meaning,
        group: SIGNAL_TO_GROUP[s.key] ?? "pain",
        fromSignal: s.key,
      });
    }
  }
  fields.push(
    { key: "founder", label: "Founder", group: "contact", fromSignal: "contact" },
    { key: "founder_email", label: "Email", group: "contact", fromSignal: "contact" },
    { key: "subject_headline", label: "Subject line", group: "pitch", fromSignal: "synthesis" },
    { key: "relevance_verdict", label: "Verdict", group: "pitch", fromSignal: "synthesis" },
  );
  return fields;
}

// ── scaffoldPlan: persona + who + where → pre-filled editable ResearchPlan ──
export function scaffoldPlan(
  personaId: string,
  prospectVertical: string,
  region: string,
): ResearchPlan {
  const persona = getPersona(personaId);
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);

  const researchSources: ResearchSource[] = persona.defaultResearchSources.map((type) => ({
    type,
    enabled: true,
    pinned: false,
    signals: persona.signalMap[type] ?? [],
  }));

  return {
    sellerPersona: persona.id,
    prospectVertical,
    region,
    researchSources,
    contactSource: { type: persona.defaultContactSource, enabled: true },
    outputFields: deriveOutputFields(persona),
    scaffoldedByAi: true,
    editedByUser: false,
  };
}
