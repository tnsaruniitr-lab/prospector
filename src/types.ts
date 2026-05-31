// Shared types for the prospect engine.

export type Channel = "phone" | "email" | "linkedin" | "instagram";

export interface Playbook {
  id: string; // 'roofing' | 'dental_implants' | 'med_spa'
  label: string;
  /** Places text-search seeds; each is combined with the city. */
  searchSeeds: string[];
  qualify: {
    minReviews: number; // below this => inactive / no budget
    maxReviews: number; // above this => likely enterprise/franchise (note, don't reject)
    minPain: number; // below this => site too clean, no wedge
  };
  /** Outreach channels in priority order for this vertical. */
  channelPriority: Channel[];
  /** Where the owner is typically findable, in priority order. */
  ownerSources: string[];
  /** Titles/seniority terms to search in Apollo and recognize on-site. */
  contactTitles: string[];
  /** Builds a first-touch opener from the top audit issue. */
  opener: (ctx: { name: string; city: string; topIssue: string; channel: Channel }) => string;
}

/** Normalized output of a Places search. */
export interface NormalizedProspect {
  placeId: string;
  name: string;
  website: string | null;
  domain: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  types: string[];
}

/** Result of running the deterministic auditor over one URL. */
export interface AuditResult {
  status: "ok" | "error";
  error?: string;
  signals: AuditSignals;
  topIssues: { id: string; evidence: string }[];
}

export type QualStatus = "new" | "qualified" | "rejected" | "no_website";

export interface QualVerdict {
  status: QualStatus;
  reason: string;
}

// ── Component 1: Audit & Prioritize ───────────────────────────────────────

/** Structured audit signals derived from the deterministic auditor. */
export interface AuditSignals {
  reachable: boolean;
  classification: string | null; // SSR | CSR | blocked | ...
  aiReadable: boolean; // content visible to AI crawlers (not SPA-cloaked / not challenge-walled)
  failCount: number;
  warnCount: number;
  hasValidSchema: boolean; // JSON-LD present AND valid
  hasPersonSchema: boolean; // credentialed Person/doctor schema (YMYL E-E-A-T)
  slowMs: number | null; // median TTFB
}

/** Bot / on-site capture signals (deterministic HTML scan). */
export interface BotSignals {
  hasChatbot: boolean; // a known chat vendor widget is present
  hasWhatsAppBot: boolean; // a WhatsApp automation vendor (WATI, Respond.io, …)
  hasWhatsAppLink: boolean; // a plain wa.me / click-to-chat link (manual)
}

/** Google-derived business facts used for the Value axis. */
export interface BusinessFacts {
  reviewCount: number | null;
  rating: number | null;
}

/** Which product line to lead the pitch with. */
export type LeadOffer = "aeo" | "bot" | "attribution";

/** Output of the priority model. */
export interface Scored {
  value: number; // 0-1: is this business worth it? (budget + demand)
  opportunity: number; // 0-1: how much can we sell them?
  priority: number; // 0-100: value × opportunity
  leadOffer: LeadOffer; // biggest gap → headline pitch
  dims: { aeo: number; bot: number; attribution: number };
  reasons: string[]; // human-readable hooks
}

// ── Component 2: Contact Enrichment ───────────────────────────────────────

export interface SocialLinks {
  instagram: string | null;
  linkedin: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  x: string | null;
}

export interface ExtractedContact {
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  instagram: string | null;
  source: "website_crawl" | "apollo_search" | "apollo_enrich";
  confidence: number;
  evidence: string;
}

export interface SiteContactExtraction {
  pagesScanned: string[];
  emails: string[];
  phones: string[];
  whatsapp: string | null;
  socials: SocialLinks;
  contactForms: string[];
  bookingLinks: string[];
  people: ExtractedContact[];
  notes: string[];
}
