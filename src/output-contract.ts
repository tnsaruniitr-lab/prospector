/**
 * Output Contract — decides WHICH dossier columns a seller gets.
 *
 *   output = UNIVERSAL CORE (always)  +  diagnostic columns (per wedge / persona)
 *
 * - A curated persona (ai_search_visibility) gets its full rich set — nothing
 *   reduced for the AEO use case.
 * - Any other seller gets core + their wedge's proving signals — lean + honest,
 *   no empty AEO columns.
 * - Full dossier JSONB is always stored regardless; this only shapes the VIEW/CSV.
 */

import type { DiagnosticSpec } from "./wedge.js";

export interface ColumnSpec {
  key: string;
  label: string;
  group: "identity" | "contact" | "diagnostic" | "pitch" | "relevance" | "provenance";
  threshold?: string; // for wedge signals
  source?: string;    // for wedge signals
}

// Always present — meaningful for ANY seller.
export const UNIVERSAL_CORE: ColumnSpec[] = [
  { key: "name", label: "Business", group: "identity" },
  { key: "domain", label: "Domain", group: "identity" },
  { key: "category", label: "Vertical", group: "identity" },
  { key: "geo", label: "Region", group: "identity" },
  { key: "google_rating", label: "Rating", group: "identity" },
  { key: "review_count", label: "Reviews", group: "identity" },
  { key: "founder_name", label: "Founder", group: "contact" },
  { key: "founder_role", label: "Founder role", group: "contact" },
  { key: "founder_email", label: "Founder email", group: "contact" },
  { key: "founder_linkedin", label: "Founder LinkedIn", group: "contact" },
  { key: "dm2_name", label: "DM2", group: "contact" },
  { key: "dm2_email", label: "DM2 email", group: "contact" },
  { key: "business_email", label: "Business email", group: "contact" },
  { key: "business_phone", label: "Business phone", group: "contact" },
  { key: "instagram", label: "Instagram", group: "contact" },
  { key: "whatsapp", label: "WhatsApp", group: "contact" },
  { key: "booking_link", label: "Booking", group: "contact" },
  { key: "subject_headline", label: "Subject line", group: "pitch" },
  { key: "pitch", label: "Pitch", group: "pitch" },
  { key: "relevance_tier", label: "Relevance", group: "relevance" },
  { key: "relevance_score", label: "Score", group: "relevance" },
  { key: "relevance_verdict", label: "Verdict", group: "relevance" },
  { key: "researched_note", label: "Sources used", group: "provenance" },
];

// Curated full diagnostic sets per validated persona — your AEO richness, retained.
export const CURATED_DIAGNOSTIC: Record<string, ColumnSpec[]> = {
  ai_search_visibility: [
    // — Visibility wedge —
    { key: "authority_score", label: "Authority", group: "diagnostic" },
    { key: "organic_traffic", label: "Organic traffic", group: "diagnostic" },
    { key: "traffic_trend", label: "Traffic trend", group: "diagnostic" },
    { key: "organic_keywords", label: "Keywords", group: "diagnostic" },
    { key: "ai_mentions", label: "AI mentions", group: "diagnostic" },
    { key: "ai_cited_pages", label: "AI cited pages", group: "diagnostic" },
    { key: "ai_chatgpt", label: "ChatGPT", group: "diagnostic" },
    { key: "ai_gemini", label: "Gemini", group: "diagnostic" },
    { key: "ai_overview", label: "AI Overview", group: "diagnostic" },
    { key: "category_ai_leader", label: "AI leader", group: "diagnostic" },
    { key: "ai_visibility_vs_leader", label: "vs leader", group: "diagnostic" },
    { key: "strongest_ai_competitor", label: "Top competitor", group: "diagnostic" },
    { key: "has_localbusiness_schema", label: "LocalBusiness schema", group: "diagnostic" },
    { key: "has_faq_schema", label: "FAQ schema", group: "diagnostic" },
    // — Lead-conversion wedge —
    { key: "has_booking_link", label: "Booking link", group: "diagnostic" },
    { key: "has_clear_cta", label: "Clear CTA", group: "diagnostic" },
    { key: "has_lead_capture", label: "Lead capture", group: "diagnostic" },
    { key: "shows_reviews", label: "Shows reviews", group: "diagnostic" },
    { key: "performance_score", label: "Page speed", group: "diagnostic" },
    { key: "conversion_gap", label: "Conversion gap", group: "diagnostic" },
    // — Pitch —
    { key: "top_3_problems", label: "Top problems", group: "diagnostic" },
    { key: "top_3_fixes", label: "Top fixes", group: "diagnostic" },
  ],
};

/** The columns a seller's dossier will contain: core + diagnostic (curated or wedge-derived). */
export function outputContract(opts: { persona?: string; wedge?: DiagnosticSpec | null }): ColumnSpec[] {
  const core = UNIVERSAL_CORE;
  let diagnostic: ColumnSpec[] = [];

  if (opts.persona && CURATED_DIAGNOSTIC[opts.persona]) {
    // Validated persona → full curated set (e.g. your AEO rich columns).
    diagnostic = CURATED_DIAGNOSTIC[opts.persona];
  } else if (opts.wedge?.provingSignals?.length) {
    // Any other seller → exactly the wedge's proving signals.
    diagnostic = opts.wedge.provingSignals.map((s) => ({
      key: s.signal, label: s.signal.replace(/_/g, " "), group: "diagnostic" as const,
      threshold: s.threshold, source: s.source,
    }));
  }
  return [...core, ...diagnostic];
}

/** Group a contract for display. */
export function groupContract(cols: ColumnSpec[]): Record<string, ColumnSpec[]> {
  const out: Record<string, ColumnSpec[]> = {};
  for (const c of cols) (out[c.group] ??= []).push(c);
  return out;
}
