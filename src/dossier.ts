// Deep-research dossier: the per-prospect brief produced by fusing browser
// research (identity + contacts + rendered audit) with SEMrush competitive data.
// `renderDossier` turns the structured object into a hand-workable markdown brief.

import type { DiagnosisProblem } from "./synthesis.js";

export interface DossierContact {
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  linkedinVerified?: boolean;
  source?: string;
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
    authorityScore?: string | number;
    organicTraffic?: string;
    trafficTrend?: string;
    organicKeywords?: string;
    backlinks?: string;
    refDomains?: string;
    aiVisibility?: { mentions?: string | number; citedPages?: string | number; chatgpt?: string; gemini?: string; aiOverview?: string; aiMode?: string };
    competitors?: { domain: string; commonLevel?: string; keywords?: string | number }[];
    categoryAiLeader?: { domain: string; mentions?: string | number; citedPages?: string | number; note?: string };
  };

  weakPoints?: { gap: string; evidence: string; impact: string }[];
  topAiProblems?: DiagnosisProblem[];
  topFixes?: string[];
  hook?: string;
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

export function renderDossier(d: Dossier): string {
  const L: string[] = [];
  const c = d.contacts;
  const a = d.audit;
  const s = d.competitive;

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
  if (s.aiVisibility) L.push(`| **AI visibility** | ${s.aiVisibility.mentions ?? "—"} mentions · ChatGPT ${s.aiVisibility.chatgpt ?? "—"} · Gemini ${s.aiVisibility.gemini ?? "—"} |`);
  L.push(`| **Lead offer** | ${OFFER[d.leadOffer] ?? d.leadOffer} |`);
  L.push("");

  if (d.hook || d.topAiProblems?.length || d.topFixes?.length) {
    L.push(`## 🎯 AI Search Diagnosis`);
    if (d.hook) { L.push(`> ${d.hook}`); L.push(""); }
    if (s.categoryAiLeader) {
      L.push(`**Category AI race:** leader \`${s.categoryAiLeader.domain}\` ${s.categoryAiLeader.mentions ?? "?"} mentions vs **${d.name}** ${s.aiVisibility?.mentions ?? "?"} — ${s.categoryAiLeader.note ?? "the gap is closeable"}.`);
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
  "ai_mentions", "ai_cited_pages", "ai_chatgpt", "ai_gemini", "ai_overview", "ai_mode", "top_competitors", "category_ai_leader", "category_ai_leader_mentions",
  "lead_offer", "top_3_ai_problems", "top_3_fixes", "hook", "weak_points", "pitch", "priority_note", "research_status", "outreach_status", "notes", "sources",
] as const;

export function flattenDossier(d: Dossier): Record<string, string> {
  const c = d.contacts, a = d.audit, s = d.competitive, f = c.founder, dm2 = c.decisionMaker2;
  const yn = (b?: boolean) => (b === undefined ? "" : b ? "yes" : "no");
  const hasComp = s.authorityScore !== undefined && s.authorityScore !== null && String(s.authorityScore) !== "";
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
    ai_mentions: s.aiVisibility?.mentions?.toString() ?? "", ai_cited_pages: s.aiVisibility?.citedPages?.toString() ?? "",
    ai_chatgpt: s.aiVisibility?.chatgpt ?? "", ai_gemini: s.aiVisibility?.gemini ?? "",
    ai_overview: s.aiVisibility?.aiOverview ?? "", ai_mode: s.aiVisibility?.aiMode ?? "",
    top_competitors: (s.competitors ?? []).map((x) => `${x.domain}(${x.keywords ?? "?"})`).join("; "),
    category_ai_leader: s.categoryAiLeader?.domain ?? "", category_ai_leader_mentions: s.categoryAiLeader?.mentions?.toString() ?? "",
    lead_offer: d.leadOffer,
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
