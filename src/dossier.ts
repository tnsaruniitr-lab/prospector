// Deep-research dossier: the per-prospect brief produced by fusing browser
// research (identity + contacts + rendered audit) with SEMrush competitive data.
// `renderDossier` turns the structured object into a hand-workable markdown brief.

import type { DiagnosisProblem } from "./synthesis.js";
import { inferSemrushDatabase } from "./semrush.js";

export interface DossierContact {
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  linkedinVerified?: boolean;
  source?: string;
}

export interface AiVisibilityMetrics {
  visibility?: string | number;
  mentions?: string | number;
  citedPages?: string | number;
  chatgpt?: string | number;
  gemini?: string | number;
  aiOverview?: string | number;
  aiMode?: string | number;
}

export interface AiCompetitorComparison extends AiVisibilityMetrics {
  domain: string;
  note?: string;
}

export interface Dossier {
  name: string;
  domain: string;
  category: string;
  geo: string;
  positioning: string;
  usp: string;
  services: string[];
  googleRating?: number | null;
  googleReviews?: number | null;

  contacts: {
    businessEmail?: string | null;
    secondEmail?: string | null;
    businessPhone?: string | null;
    whatsapp?: string | null;
    instagram?: string | null;
    bookingLink?: string | null;
    founder?: DossierContact | null;
    decisionMaker2?: DossierContact | null;
    others?: DossierContact[];
  };

  audit: {
    title?: string;
    metaDescLen?: number;
    h1Count?: number;
    h2Count?: number;
    schemaTypes?: string[];
    hasLocalBusiness: boolean;
    hasPerson: boolean;
    hasFAQ: boolean;
    hasAggregateRating: boolean;
    hreflang?: string[];
    renderedWords?: number;
    images?: number;
    imagesNoAlt?: number;
    hasChatWidget?: boolean;
    hasWhatsAppBot?: boolean;
    hasWhatsApp?: boolean;
  };

  competitive: {
    primaryCountry?: string;
    semrushDatabase?: string;
    authorityScore?: string | number;
    organicTraffic?: string;
    trafficTrend?: string;
    organicKeywords?: string;
    backlinks?: string;
    refDomains?: string;
    aiVisibility?: AiVisibilityMetrics;
    competitors?: { domain: string; commonLevel?: string; keywords?: string | number }[];
    aiCompetitors?: AiCompetitorComparison[];
    categoryAiLeader?: AiCompetitorComparison;
  };

  weakPoints?: { gap: string; evidence: string; impact: string }[];
  topAiProblems?: DiagnosisProblem[];
  topFixes?: string[];
  hook?: string;
  subjectHeadline?: string; // AI-visibility comparison vs the category leader — outreach subject line
  leadOffer: "aeo" | "bot" | "attribution";
  pitch: string;
  priorityNote?: string;
  researchStatus?: string;
  outreachStatus?: string;
  notes?: string;
  researchedNote?: string;
}

const yn = (b: boolean | undefined) => (b ? "✅ yes" : "❌ **no**");
const OFFER: Record<string, string> = { aeo: "AEO / AI-search visibility", bot: "WhatsApp / chatbot automation", attribution: "Attribution / analytics" };

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).trim().replace(/,/g, "").match(/^([0-9]*\.?[0-9]+)\s*([kmb])?/i);
  if (!m) return null;
  const mult = ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[(m[2] ?? "").toLowerCase()] ?? 1;
  return parseFloat(m[1]) * mult;
}

function pct(prospect: unknown, competitor: unknown) {
  const p = n(prospect), c = n(competitor);
  if (p == null || c == null || c === 0) return "";
  return `${Math.round((p / c) * 100)}%`;
}

function gap(prospect: unknown, competitor: unknown) {
  const p = n(prospect), c = n(competitor);
  if (p == null || c == null) return "";
  const d = p - c;
  return d > 0 ? `+${Math.round(d)}` : `${Math.round(d)}`;
}

function aiRankScore(c: AiCompetitorComparison) {
  return n(c.visibility) ?? n(c.mentions) ?? n(c.citedPages) ?? 0;
}

function aiLeader(d: Dossier): AiCompetitorComparison | null {
  if (d.competitive.categoryAiLeader) return d.competitive.categoryAiLeader;
  const comps = [...(d.competitive.aiCompetitors ?? [])];
  if (!comps.length) return null;
  return comps.sort((a, b) => aiRankScore(b) - aiRankScore(a))[0];
}

function aiCompetitor2(d: Dossier): AiCompetitorComparison | null {
  const leader = aiLeader(d);
  const comps = (d.competitive.aiCompetitors ?? []).filter((c) => c.domain !== leader?.domain);
  if (!comps.length) return null;
  return comps.sort((a, b) => aiRankScore(b) - aiRankScore(a))[0];
}

function marketCountry(d: Dossier): string {
  if (d.competitive.primaryCountry?.trim()) return d.competitive.primaryCountry.trim();
  const geo = d.geo.toLowerCase();
  if (/\b(uae|dubai|abu dhabi|sharjah|united arab emirates)\b/.test(geo)) return "United Arab Emirates";
  if (/\b(miami|new york|nyc|fl|florida|united states|usa|us)\b/.test(geo)) return "United States";
  if (/\b(berlin|germany|deutschland)\b/.test(geo)) return "Germany";
  if (/\b(riyadh|saudi|ksa)\b/.test(geo)) return "Saudi Arabia";
  if (/\b(istanbul|turkey|turkiye|türkiye)\b/.test(geo)) return "Turkey";
  return d.geo;
}

function marketDb(d: Dossier): string {
  return d.competitive.semrushDatabase?.trim() || inferSemrushDatabase(marketCountry(d), d.geo);
}

function aiComparisonSummary(d: Dossier): string {
  const leader = aiLeader(d);
  const own = d.competitive.aiVisibility;
  if (!leader || !own) return "";
  const parts = [
    `Leader ${leader.domain}`,
    own.visibility != null || leader.visibility != null ? `AI Visibility ${own.visibility ?? "?"} vs ${leader.visibility ?? "?"} (${pct(own.visibility, leader.visibility) || "n/a"})` : "",
    own.mentions != null || leader.mentions != null ? `Mentions ${own.mentions ?? "?"} vs ${leader.mentions ?? "?"} (${pct(own.mentions, leader.mentions) || "n/a"})` : "",
    own.citedPages != null || leader.citedPages != null ? `Cited Pages ${own.citedPages ?? "?"} vs ${leader.citedPages ?? "?"} (${pct(own.citedPages, leader.citedPages) || "n/a"})` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function aiCompetitiveHook(d: Dossier): string {
  const leader = aiLeader(d);
  const own = d.competitive.aiVisibility;
  if (!leader || !own) return d.subjectHeadline ?? "";
  const citePct = pct(own.citedPages, leader.citedPages);
  const mentionsPct = pct(own.mentions, leader.mentions);
  if (citePct) {
    return `${d.name} gets ${citePct} of ${leader.domain}'s AI-cited page footprint (${own.citedPages ?? "?"} vs ${leader.citedPages ?? "?"}) in ${marketCountry(d)}.`;
  }
  if (mentionsPct) {
    return `${d.name} gets ${mentionsPct} of ${leader.domain}'s AI mentions (${own.mentions ?? "?"} vs ${leader.mentions ?? "?"}) in ${marketCountry(d)}.`;
  }
  return d.subjectHeadline ?? aiComparisonSummary(d);
}

export function renderDossier(d: Dossier): string {
  const L: string[] = [];
  const c = d.contacts;
  const a = d.audit;
  const s = d.competitive;
  const country = marketCountry(d);
  const db = marketDb(d);

  L.push(`# Prospect Dossier — ${d.name}`);
  L.push(`**${d.domain}** · ${d.category} · ${d.geo}`);
  L.push("");

  L.push(`## Snapshot`);
  L.push(`| | |`);
  L.push(`|---|---|`);
  L.push(`| Authority Score | ${s.authorityScore ?? "—"} |`);
  L.push(`| Organic traffic | ${s.organicTraffic ?? "—"}${s.trafficTrend ? ` (${s.trafficTrend})` : ""} |`);
  L.push(`| Organic keywords | ${s.organicKeywords ?? "—"} |`);
  L.push(`| Backlinks / ref domains | ${s.backlinks ?? "—"} / ${s.refDomains ?? "—"} |`);
  if (s.aiVisibility) L.push(`| **AI visibility** | score ${s.aiVisibility.visibility ?? "—"} · ${s.aiVisibility.mentions ?? "—"} mentions · ${s.aiVisibility.citedPages ?? "—"} cited pages · ChatGPT ${s.aiVisibility.chatgpt ?? "—"} · Gemini ${s.aiVisibility.gemini ?? "—"} |`);
  L.push(`| SEMrush market | ${country} · db=${db} |`);
  L.push(`| **Lead offer** | ${OFFER[d.leadOffer] ?? d.leadOffer} |`);
  L.push("");

  if (d.hook || d.topAiProblems?.length || d.topFixes?.length) {
    L.push(`## 🎯 AI Search Diagnosis`);
    if (d.hook) { L.push(`> ${d.hook}`); L.push(""); }
    if (s.categoryAiLeader) {
      L.push(`**Category AI race:** leader \`${s.categoryAiLeader.domain}\` ${s.categoryAiLeader.mentions ?? "?"} mentions vs **${d.name}** ${s.aiVisibility?.mentions ?? "?"} — ${s.categoryAiLeader.note ?? "the gap is closeable"}.`);
      L.push("");
    }
    const leader = aiLeader(d);
    const comp2 = aiCompetitor2(d);
    if (leader && s.aiVisibility) {
      L.push(`**AI competitor benchmark (${country}, db=${db})**`);
      L.push(`| Domain | AI visibility | Mentions | Cited pages | ChatGPT | AI Overview | AI Mode | Gemini |`);
      L.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);
      L.push(`| ${d.domain} | ${s.aiVisibility.visibility ?? "—"} | ${s.aiVisibility.mentions ?? "—"} | ${s.aiVisibility.citedPages ?? "—"} | ${s.aiVisibility.chatgpt ?? "—"} | ${s.aiVisibility.aiOverview ?? "—"} | ${s.aiVisibility.aiMode ?? "—"} | ${s.aiVisibility.gemini ?? "—"} |`);
      L.push(`| ${leader.domain} | ${leader.visibility ?? "—"} | ${leader.mentions ?? "—"} | ${leader.citedPages ?? "—"} | ${leader.chatgpt ?? "—"} | ${leader.aiOverview ?? "—"} | ${leader.aiMode ?? "—"} | ${leader.gemini ?? "—"} |`);
      if (comp2) L.push(`| ${comp2.domain} | ${comp2.visibility ?? "—"} | ${comp2.mentions ?? "—"} | ${comp2.citedPages ?? "—"} | ${comp2.chatgpt ?? "—"} | ${comp2.aiOverview ?? "—"} | ${comp2.aiMode ?? "—"} | ${comp2.gemini ?? "—"} |`);
      L.push("");
    }
    if (d.topAiProblems?.length) {
      L.push(`**Top 3 things hurting their AI search**`);
      d.topAiProblems.slice(0, 3).forEach((p, i) => L.push(`${i + 1}. ${p.text}  \`${p.evidence}\``));
      L.push("");
    }
    if (d.topFixes?.length) {
      L.push(`**Top 3 fixes that move the needle**`);
      d.topFixes.slice(0, 3).forEach((p, i) => L.push(`${i + 1}. ${p}`));
      L.push("");
    }
  }

  L.push(`## Who they are`);
  L.push(`${d.positioning}`);
  L.push(`- **USP:** ${d.usp}`);
  if (d.services.length) L.push(`- **Services:** ${d.services.join(" · ")}`);
  L.push("");

  L.push(`## Contacts`);
  if (c.founder) {
    const f = c.founder;
    L.push(`- **Founder/owner:** ${f.name} — ${f.role}`);
    L.push(`  - LinkedIn: ${f.linkedin ?? "—"}${f.linkedin ? (f.linkedinVerified ? " ✅ verified" : " (unverified)") : ""}`);
    L.push(`  - Email: ${f.email ?? "—"}`);
  }
  if (c.decisionMaker2) {
    const m = c.decisionMaker2;
    L.push(`- **2nd decision-maker:** ${m.name} — ${m.role}${m.source ? ` _(${m.source})_` : ""}`);
    L.push(`  - LinkedIn: ${m.linkedin ?? "—"} · Email: ${m.email ?? "—"} · Phone: ${m.phone ?? "—"}`);
  }
  if (c.others?.length) {
    L.push(`- **Other decision-makers:**`);
    c.others.forEach((o) => L.push(`  - ${o.name} — ${o.role}${o.linkedin ? ` · ${o.linkedin}` : ""}`));
  }
  L.push(`- **Business:** ${c.businessEmail ?? "—"} · ${c.businessPhone ?? "—"} · WhatsApp ${c.whatsapp ?? "—"} · IG ${c.instagram ?? "—"}${c.bookingLink ? ` · booking ${c.bookingLink}` : ""}`);
  L.push("");

  L.push(`## On-page audit (live rendered)`);
  L.push(`- **Schema present:** ${(a.schemaTypes ?? []).join(", ") || "—"}`);
  L.push(`- LocalBusiness ${yn(a.hasLocalBusiness)} · Person/doctor ${yn(a.hasPerson)} · FAQ ${yn(a.hasFAQ)} · review stars ${yn(a.hasAggregateRating)}`);
  L.push(`- Content: ${a.renderedWords ?? "?"} words · ${a.h2Count ?? "?"} H2 · ${a.imagesNoAlt ?? "?"}/${a.images ?? "?"} images missing alt`);
  L.push(`- hreflang: ${(a.hreflang ?? []).join(", ") || "none"} · chat widget ${a.hasChatWidget ? "yes" : "no"} · WhatsApp ${a.hasWhatsApp ? "yes" : "no"}`);
  L.push("");

  if (s.competitors?.length) {
    L.push(`## Competitive lag (SEMrush)`);
    L.push(`Out-ranked by peers — top organic competitors:`);
    L.push(`| Competitor | Common | Keywords |`);
    L.push(`|---|---|---|`);
    s.competitors.slice(0, 6).forEach((x) => L.push(`| ${x.domain} | ${x.commonLevel ?? "—"} | ${x.keywords ?? "—"} |`));
    L.push("");
  }

  if (d.weakPoints?.length) {
    L.push(`## Full audit gaps`);
    d.weakPoints.forEach((w, i) => {
      L.push(`${i + 1}. **${w.gap}**`);
      L.push(`   - Evidence: ${w.evidence}`);
      L.push(`   - Impact: ${w.impact}`);
    });
    L.push("");
  }

  L.push(`## The pitch (lead with ${OFFER[d.leadOffer] ?? d.leadOffer})`);
  L.push(d.pitch);
  if (d.priorityNote) { L.push(""); L.push(`> ${d.priorityNote}`); }
  if (d.researchedNote) { L.push(""); L.push(`_${d.researchedNote}_`); }
  L.push("");

  return L.join("\n");
}

// ── Flat CSV view (the column contract that mirrors the DB record) ──────────

export const DOSSIER_COLUMNS = [
  "name", "domain", "category", "geo", "google_rating", "google_reviews", "positioning", "usp", "services",
  "business_email", "second_email", "business_phone", "whatsapp", "instagram", "booking_link",
  "founder_name", "founder_role", "founder_email", "founder_phone", "founder_linkedin", "founder_linkedin_verified",
  "dm2_name", "dm2_role", "dm2_email", "dm2_phone", "dm2_linkedin", "dm2_verified", "other_decision_makers",
  "audit_title", "meta_desc_len", "h1_count", "h2_count", "schema_types",
  "has_localbusiness", "has_person", "has_faq", "has_aggregaterating",
  "hreflang", "rendered_words", "images", "images_no_alt", "has_whatsapp", "has_whatsapp_bot", "has_chatbot",
  "authority_score", "organic_traffic", "traffic_trend", "organic_keywords", "backlinks", "ref_domains",
  "ai_visibility_score", "ai_mentions", "ai_cited_pages", "ai_chatgpt", "ai_gemini", "ai_overview", "ai_mode", "top_competitors",
  "semrush_primary_country", "semrush_database",
  "strongest_ai_competitor", "strongest_ai_competitor_ai_visibility", "strongest_ai_competitor_mentions", "strongest_ai_competitor_cited_pages", "strongest_ai_competitor_note",
  "category_ai_leader", "category_ai_leader_ai_visibility", "category_ai_leader_mentions", "category_ai_leader_cited_pages", "category_ai_leader_note",
  "ai_visibility_vs_leader_pct", "ai_mentions_vs_leader_pct", "ai_cited_pages_vs_leader_pct",
  "ai_visibility_gap_vs_leader", "ai_mentions_gap_vs_leader", "ai_cited_pages_gap_vs_leader",
  "ai_chatgpt_gap", "ai_overview_gap", "ai_mode_gap", "ai_gemini_gap",
  "ai_competitor_2", "ai_competitor_2_ai_visibility", "ai_competitor_2_mentions", "ai_competitor_2_cited_pages", "ai_competitor_2_note",
  "ai_competitor_comparison", "ai_competitive_hook",
  "lead_offer", "subject_headline", "top_3_ai_problems", "top_3_fixes", "hook", "weak_points", "pitch", "priority_note", "research_status", "outreach_status", "notes", "sources",
] as const;

export function flattenDossier(d: Dossier): Record<string, string> {
  const c = d.contacts, a = d.audit, s = d.competitive, f = c.founder, dm2 = c.decisionMaker2;
  const yn = (b?: boolean) => (b === undefined ? "" : b ? "yes" : "no");
  const hasComp = s.authorityScore !== undefined && s.authorityScore !== null && String(s.authorityScore) !== "";
  const leader = aiLeader(d);
  const comp2 = aiCompetitor2(d);
  const country = marketCountry(d);
  const db = marketDb(d);
  return {
    name: d.name, domain: d.domain, category: d.category, geo: d.geo,
    google_rating: d.googleRating?.toString() ?? "", google_reviews: d.googleReviews?.toString() ?? "",
    positioning: d.positioning, usp: d.usp, services: d.services.join(" | "),
    business_email: c.businessEmail ?? "", second_email: c.secondEmail ?? "", business_phone: c.businessPhone ?? "",
    whatsapp: c.whatsapp ?? "", instagram: c.instagram ?? "", booking_link: c.bookingLink ?? "",
    founder_name: f?.name ?? "", founder_role: f?.role ?? "", founder_email: f?.email ?? "", founder_phone: f?.phone ?? "",
    founder_linkedin: f?.linkedin ?? "", founder_linkedin_verified: f?.linkedin ? yn(f.linkedinVerified) : "",
    dm2_name: dm2?.name ?? "", dm2_role: dm2?.role ?? "", dm2_email: dm2?.email ?? "", dm2_phone: dm2?.phone ?? "",
    dm2_linkedin: dm2?.linkedin ?? "", dm2_verified: dm2?.linkedin ? yn(dm2.linkedinVerified) : "",
    other_decision_makers: (c.others ?? []).map((o) => `${o.name} (${o.role})`).join("; "),
    audit_title: a.title ?? "", meta_desc_len: a.metaDescLen?.toString() ?? "",
    h1_count: a.h1Count?.toString() ?? "", h2_count: a.h2Count?.toString() ?? "",
    schema_types: (a.schemaTypes ?? []).join(", "),
    has_localbusiness: yn(a.hasLocalBusiness), has_person: yn(a.hasPerson), has_faq: yn(a.hasFAQ), has_aggregaterating: yn(a.hasAggregateRating),
    hreflang: (a.hreflang ?? []).join(", "), rendered_words: a.renderedWords?.toString() ?? "",
    images: a.images?.toString() ?? "", images_no_alt: a.imagesNoAlt?.toString() ?? "",
    has_whatsapp: yn(a.hasWhatsApp), has_whatsapp_bot: yn(a.hasWhatsAppBot), has_chatbot: yn(a.hasChatWidget),
    authority_score: s.authorityScore?.toString() ?? "", organic_traffic: s.organicTraffic ?? "", traffic_trend: s.trafficTrend ?? "",
    organic_keywords: s.organicKeywords ?? "", backlinks: s.backlinks ?? "", ref_domains: s.refDomains ?? "",
    ai_visibility_score: s.aiVisibility?.visibility?.toString() ?? "",
    ai_mentions: s.aiVisibility?.mentions?.toString() ?? "", ai_cited_pages: s.aiVisibility?.citedPages?.toString() ?? "",
    ai_chatgpt: s.aiVisibility?.chatgpt?.toString() ?? "", ai_gemini: s.aiVisibility?.gemini?.toString() ?? "",
    ai_overview: s.aiVisibility?.aiOverview?.toString() ?? "", ai_mode: s.aiVisibility?.aiMode?.toString() ?? "",
    top_competitors: (s.competitors ?? []).map((x) => `${x.domain}(${x.keywords ?? "?"})`).join("; "),
    semrush_primary_country: country,
    semrush_database: db,
    strongest_ai_competitor: leader?.domain ?? "",
    strongest_ai_competitor_ai_visibility: leader?.visibility?.toString() ?? "",
    strongest_ai_competitor_mentions: leader?.mentions?.toString() ?? "",
    strongest_ai_competitor_cited_pages: leader?.citedPages?.toString() ?? "",
    strongest_ai_competitor_note: leader?.note ?? "",
    category_ai_leader: leader?.domain ?? "",
    category_ai_leader_ai_visibility: leader?.visibility?.toString() ?? "",
    category_ai_leader_mentions: leader?.mentions?.toString() ?? "",
    category_ai_leader_cited_pages: leader?.citedPages?.toString() ?? "",
    category_ai_leader_note: leader?.note ?? "",
    ai_visibility_vs_leader_pct: pct(s.aiVisibility?.visibility, leader?.visibility),
    ai_mentions_vs_leader_pct: pct(s.aiVisibility?.mentions, leader?.mentions),
    ai_cited_pages_vs_leader_pct: pct(s.aiVisibility?.citedPages, leader?.citedPages),
    ai_visibility_gap_vs_leader: gap(s.aiVisibility?.visibility, leader?.visibility),
    ai_mentions_gap_vs_leader: gap(s.aiVisibility?.mentions, leader?.mentions),
    ai_cited_pages_gap_vs_leader: gap(s.aiVisibility?.citedPages, leader?.citedPages),
    ai_chatgpt_gap: gap(s.aiVisibility?.chatgpt, leader?.chatgpt),
    ai_overview_gap: gap(s.aiVisibility?.aiOverview, leader?.aiOverview),
    ai_mode_gap: gap(s.aiVisibility?.aiMode, leader?.aiMode),
    ai_gemini_gap: gap(s.aiVisibility?.gemini, leader?.gemini),
    ai_competitor_2: comp2?.domain ?? "",
    ai_competitor_2_ai_visibility: comp2?.visibility?.toString() ?? "",
    ai_competitor_2_mentions: comp2?.mentions?.toString() ?? "",
    ai_competitor_2_cited_pages: comp2?.citedPages?.toString() ?? "",
    ai_competitor_2_note: comp2?.note ?? "",
    ai_competitor_comparison: aiComparisonSummary(d),
    ai_competitive_hook: aiCompetitiveHook(d),
    lead_offer: d.leadOffer,
    subject_headline: d.subjectHeadline ?? "",
    top_3_ai_problems: (d.topAiProblems ?? []).map((p, i) => `${i + 1}. ${p.text} [${p.evidence}]`).join(" | "),
    top_3_fixes: (d.topFixes ?? []).map((p, i) => `${i + 1}. ${p}`).join(" | "),
    hook: d.hook ?? "",
    weak_points: (d.weakPoints ?? []).map((w, i) => `${i + 1}. ${w.gap}`).join(" | "),
    pitch: d.pitch, priority_note: d.priorityNote ?? "",
    research_status: d.researchStatus ?? (hasComp ? "researched" : "partial"),
    outreach_status: d.outreachStatus ?? "", notes: d.notes ?? "",
    sources: d.researchedNote ?? "",
  };
}

export function dossierToCsv(ds: Dossier[]): string {
  const cell = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = DOSSIER_COLUMNS.map(cell).join(",");
  const rows = ds.map((d) => {
    const r = flattenDossier(d);
    return DOSSIER_COLUMNS.map((col) => cell(r[col] ?? "")).join(",");
  });
  return [header, ...rows].join("\n");
}
