import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { paths } from "./config.js";
import { searchApolloContacts } from "./apollo.js";
import { runAudit } from "./audit.js";
import { botCheck } from "./botcheck.js";
import { extractSiteContacts, normalizeWebsite } from "./contact-extract.js";
import { getPlaybook } from "./playbooks.js";
import { scoreBusiness } from "./scoring.js";
import {
  enrichSemrush,
  semrushDomainOverviewUrl as buildSemrushDomainOverviewUrl,
  semrushOrganicCompetitorsUrl as buildSemrushOrganicCompetitorsUrl,
} from "./semrush.js";
import type { AuditResult, ExtractedContact, Playbook } from "./types.js";

interface CsvRunOpts {
  input: string;
  playbookId: string;
  output?: string;
  limit?: number;
  start?: number;
}

type Row = Record<string, string>;

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["business name", "company", "agency", "name", "clinic", "practice"],
  website: ["website", "site", "url", "domain"],
  category: ["category", "type", "icp", "vertical"],
  city: ["city", "location"],
  country: ["country"],
  phone: ["phone", "phone 2", "business phone", "primary phone"],
  email: ["email", "email 2", "business email", "primary email"],
  instagram: ["instagram", "ig"],
  linkedin: ["linkedin", "linkedIn", "linkedin url"],
  contactName: ["contact name", "owner name", "founder", "person"],
  role: ["role", "title"],
  notes: ["notes"],
  existingIssues: ["key aeo/seo issues", "seo gaps", "aeo gaps", "top issue", "issues"],
};

const OUTPUT_HEADERS = [
  "rank",
  "priority",
  "lead_offer",
  "aeo_issue_score",
  "seo_issue_score",
  "business_name",
  "category",
  "city",
  "country",
  "website",
  "business_email",
  "business_phone",
  "whatsapp",
  "instagram",
  "linkedin",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "contact_form",
  "booking_link",
  "best_contact_name",
  "best_contact_role",
  "best_contact_email",
  "best_contact_phone",
  "best_contact_linkedin",
  "best_contact_instagram",
  "contact_source",
  "contact_confidence",
  "linkedin_founder_query",
  "linkedin_founder_google_url",
  "linkedin_people_search_url",
  "linkedin_sales_nav_search_url",
  "linkedin_company_query",
  "linkedin_company_google_url",
  "linkedin_review_status",
  "has_chatbot",
  "has_whatsapp_bot",
  "semrush_database",
  "semrush_domain_overview_url",
  "semrush_organic_competitors_url",
  "semrush_organic_traffic",
  "semrush_organic_keywords",
  "semrush_organic_cost",
  "semrush_authority_score",
  "semrush_referring_domains",
  "semrush_backlinks",
  "semrush_ai_overview_owned",
  "semrush_ai_overview_total",
  "semrush_ai_visibility",
  "semrush_ai_mentions",
  "semrush_ai_cited_pages",
  "semrush_chatgpt_mentions",
  "semrush_chatgpt_cited_pages",
  "semrush_traffic_share",
  "semrush_top_keywords",
  "semrush_top_competitors",
  "semrush_competitive_summary",
  "semrush_browser_review_status",
  "semrush_browser_source_notes",
  "semrush_errors",
  "classification",
  "audit_status",
  "top_issues",
  "pitch_hook",
  "source_notes",
];

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headersRaw, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!headersRaw) return [];
  const headers = headersRaw.map((h) => h.trim());
  return body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i]?.trim() ?? ""])));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function writeCsv(rows: Row[]) {
  return [
    OUTPUT_HEADERS.map(csvCell).join(","),
    ...rows.map((row) => OUTPUT_HEADERS.map((h) => csvCell(row[h])).join(",")),
  ].join("\n");
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clean(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (!/@/.test(v) && /^not\b/i.test(v)) return "";
  if (/^(n\/a|na|none|null|not found|not listed|not listed publicly|not publicly listed|not visible|tbd|find on linkedin)$/i.test(v)) {
    return "";
  }
  return v;
}

function canonicalHeaders(row: Row) {
  const byNorm = new Map(Object.keys(row).map((k) => [k.toLowerCase().trim(), k]));
  const pick = (key: keyof typeof HEADER_ALIASES) => {
    for (const alias of HEADER_ALIASES[key]) {
      const real = byNorm.get(alias.toLowerCase());
      if (real && row[real]) return clean(row[real]);
    }
    return "";
  };
  return {
    name: pick("name"),
    website: pick("website"),
    category: pick("category"),
    city: pick("city"),
    country: pick("country"),
    phone: pick("phone"),
    email: pick("email"),
    instagram: pick("instagram"),
    linkedin: pick("linkedin"),
    contactName: pick("contactName"),
    role: pick("role"),
    notes: pick("notes"),
    existingIssues: pick("existingIssues"),
  };
}

function domainFromWebsite(website: string) {
  try {
    return new URL(normalizeWebsite(website)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function topIssues(audit: AuditResult, fallback: string) {
  if (audit.status === "error") return audit.error ?? fallback;
  const issues = audit.topIssues
    .slice(0, 4)
    .map((i) => `${i.id}: ${i.evidence}`.replace(/\s+/g, " ").slice(0, 220));
  return issues.length ? issues.join(" | ") : fallback;
}

function issueScores(audit: AuditResult) {
  if (audit.status === "error") return { aeo: 0, seo: 0 };
  const s = audit.signals;
  const aeo =
    (!s.aiReadable ? 35 : 0) +
    (!s.hasValidSchema ? 30 : 0) +
    (!s.hasPersonSchema ? 15 : 0) +
    Math.min(s.failCount * 4, 20);
  const seo =
    Math.min(s.failCount * 6 + s.warnCount * 2, 55) +
    (s.slowMs != null && s.slowMs > 1800 ? 20 : s.slowMs != null && s.slowMs > 800 ? 10 : 0);
  return { aeo: Math.min(100, aeo), seo: Math.min(100, seo) };
}

function contactKey(c: ExtractedContact) {
  return `${c.name ?? ""}|${c.email ?? ""}|${c.linkedinUrl ?? ""}|${c.source}`.toLowerCase();
}

function mergeContacts(contacts: ExtractedContact[]) {
  const map = new Map<string, ExtractedContact>();
  for (const c of contacts) {
    const key = contactKey(c);
    const prior = map.get(key);
    if (!prior || c.confidence > prior.confidence) map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}

function inputContact(row: ReturnType<typeof canonicalHeaders>): ExtractedContact | null {
  if (!row.contactName && !row.email && !row.phone && !row.linkedin && !row.instagram) return null;
  return {
    name: row.contactName || null,
    role: row.role || "Existing spreadsheet contact",
    email: row.email || null,
    phone: row.phone || null,
    linkedinUrl: row.linkedin || null,
    instagram: row.instagram || null,
    source: "website_crawl",
    confidence: row.contactName ? 0.58 : 0.45,
    evidence: "Existing CSV/spreadsheet input",
  };
}

function pitchHook(playbook: Playbook, row: ReturnType<typeof canonicalHeaders>, issue: string) {
  const city = row.city || row.country || "your area";
  return playbook.opener({
    name: row.name || row.website || "your business",
    city,
    topIssue: issue,
    channel: playbook.channelPriority[0],
  });
}

function searchUrl(base: string, query: string) {
  return `${base}${encodeURIComponent(query)}`;
}

function linkedinResearchLinks(row: ReturnType<typeof canonicalHeaders>, best: ExtractedContact | undefined) {
  const company = row.name || row.website;
  const city = row.city || row.country;
  const person = best?.name || row.contactName;
  const roleTerms = "founder OR owner OR CEO OR Geschäftsführer OR Inhaber";
  const founderQuery = person
    ? `site:linkedin.com/in "${person}" "${company}"`
    : `site:linkedin.com/in "${company}" (${roleTerms}) ${city}`;
  const companyQuery = `site:linkedin.com/company "${company}" ${city}`;
  const peopleKeywords = person ? `${person} ${company}` : `${company} founder owner CEO`;

  return {
    founderQuery,
    founderGoogleUrl: searchUrl("https://www.google.com/search?q=", founderQuery),
    peopleSearchUrl: searchUrl("https://www.linkedin.com/search/results/people/?keywords=", peopleKeywords),
    salesNavSearchUrl: searchUrl("https://www.linkedin.com/sales/search/people?keywords=", peopleKeywords),
    companyQuery,
    companyGoogleUrl: searchUrl("https://www.google.com/search?q=", companyQuery),
    reviewStatus: best?.linkedinUrl ? "profile_found" : "needs_linkedin_review",
  };
}

function formatKeywords(semrush: Awaited<ReturnType<typeof enrichSemrush>>) {
  return semrush?.topKeywords
    .slice(0, 8)
    .map((k) => `${k.keyword} #${k.position ?? "?"}${k.volume != null ? ` vol ${k.volume}` : ""}`)
    .join(" | ") ?? "";
}

function formatCompetitors(semrush: Awaited<ReturnType<typeof enrichSemrush>>) {
  return semrush?.competitors
    .slice(0, 5)
    .map((c) => `${c.domain}${c.organicTraffic != null ? ` traffic ${c.organicTraffic}` : ""}`)
    .join(" | ") ?? "";
}

export async function runLocalCsv(opts: CsvRunOpts) {
  const playbook = getPlaybook(opts.playbookId);
  const inputPath = resolve(opts.input);
  const inputText = await readFile(inputPath, "utf-8");
  const rawRows = parseCsv(inputText);
  const start = Math.max(0, (opts.start ?? 1) - 1);
  const rows = rawRows.slice(start, opts.limit ? start + opts.limit : undefined);

  if (!rows.length) {
    console.log(`[csv] no rows found in ${inputPath}`);
    return { count: 0, outputPath: null };
  }

  console.log(`[csv] ${rows.length} rows from ${inputPath}`);
  const out: Row[] = [];

  for (let i = 0; i < rows.length; i++) {
    const src = canonicalHeaders(rows[i]);
    if (!src.website) {
      out.push({
        rank: "",
        priority: "0",
        lead_offer: "",
        aeo_issue_score: "0",
        seo_issue_score: "0",
        business_name: src.name,
        category: src.category,
        city: src.city,
        country: src.country,
        website: "",
        business_email: src.email,
        business_phone: src.phone,
        instagram: src.instagram,
        linkedin: src.linkedin,
        audit_status: "skipped_no_website",
        top_issues: src.existingIssues || "No website available for audit",
        source_notes: src.notes,
      });
      console.log(`[csv] ${String(i + 1).padStart(3)}/${rows.length} SKIP no website ${src.name}`);
      continue;
    }

    const website = normalizeWebsite(src.website);
    const domain = domainFromWebsite(website);
    const [audit, bot, site, semrush] = await Promise.all([
      runAudit(website),
      botCheck(website),
      extractSiteContacts(website, { maxPages: 7, contactTitles: playbook.contactTitles }),
      enrichSemrush({ domainOrUrl: domain, country: src.country, city: src.city }),
    ]);
    const apollo = await searchApolloContacts({
      domain,
      city: src.city || src.country || null,
      contactTitles: playbook.contactTitles,
      limit: 5,
    });

    const seeded = inputContact(src);
    const contacts = mergeContacts([...(seeded ? [seeded] : []), ...site.people, ...apollo]);
    const best = contacts[0];
    const linkedinLinks = linkedinResearchLinks(src, best);
    const facts = { reviewCount: null, rating: null };
    const scored = audit.status === "ok" ? scoreBusiness(facts, audit.signals, bot) : null;
    const scores = issueScores(audit);
    const issue = topIssues(audit, src.existingIssues || "basic SEO/AEO signals are missing or unclear");

    out.push({
      rank: "",
      priority: String(scored?.priority ?? 0),
      lead_offer: scored?.leadOffer ?? "",
      aeo_issue_score: String(scores.aeo),
      seo_issue_score: String(scores.seo),
      business_name: src.name,
      category: src.category || playbook.id,
      city: src.city,
      country: src.country,
      website,
      business_email: site.emails[0] ?? src.email,
      business_phone: site.phones[0] ?? src.phone,
      whatsapp: site.whatsapp ?? bot.whatsapp ?? "",
      instagram: site.socials.instagram ?? src.instagram,
      linkedin: site.socials.linkedin ?? src.linkedin,
      facebook: site.socials.facebook ?? "",
      tiktok: site.socials.tiktok ?? "",
      youtube: site.socials.youtube ?? "",
      x: site.socials.x ?? "",
      contact_form: site.contactForms[0] ?? "",
      booking_link: site.bookingLinks[0] ?? "",
      best_contact_name: best?.name ?? "",
      best_contact_role: best?.role ?? "",
      best_contact_email: best?.email ?? "",
      best_contact_phone: best?.phone ?? "",
      best_contact_linkedin: best?.linkedinUrl ?? "",
      best_contact_instagram: best?.instagram ?? "",
      contact_source: best?.source ?? "",
      contact_confidence: best ? String(best.confidence.toFixed(2)) : "",
      linkedin_founder_query: linkedinLinks.founderQuery,
      linkedin_founder_google_url: linkedinLinks.founderGoogleUrl,
      linkedin_people_search_url: linkedinLinks.peopleSearchUrl,
      linkedin_sales_nav_search_url: linkedinLinks.salesNavSearchUrl,
      linkedin_company_query: linkedinLinks.companyQuery,
      linkedin_company_google_url: linkedinLinks.companyGoogleUrl,
      linkedin_review_status: linkedinLinks.reviewStatus,
      has_chatbot: bot.hasChatbot ? "Y" : "N",
      has_whatsapp_bot: bot.hasWhatsAppBot ? "Y" : "N",
      semrush_database: semrush?.database ?? "",
      semrush_domain_overview_url: domain ? buildSemrushDomainOverviewUrl(domain, src.country, src.city) : "",
      semrush_organic_competitors_url: domain ? buildSemrushOrganicCompetitorsUrl(domain, src.country, src.city) : "",
      semrush_organic_traffic: semrush?.overview?.organicTraffic?.toString() ?? "",
      semrush_organic_keywords: semrush?.overview?.organicKeywords?.toString() ?? "",
      semrush_organic_cost: semrush?.overview?.organicCost?.toString() ?? "",
      semrush_authority_score: semrush?.backlinks?.authorityScore?.toString() ?? "",
      semrush_referring_domains: semrush?.backlinks?.referringDomains?.toString() ?? "",
      semrush_backlinks: semrush?.backlinks?.backlinks?.toString() ?? "",
      semrush_ai_overview_owned: semrush?.overview?.aiOverviewOwned?.toString() ?? "",
      semrush_ai_overview_total: semrush?.overview?.aiOverviewOccurrences?.toString() ?? "",
      semrush_ai_visibility: "",
      semrush_ai_mentions: "",
      semrush_ai_cited_pages: "",
      semrush_chatgpt_mentions: "",
      semrush_chatgpt_cited_pages: "",
      semrush_traffic_share: "",
      semrush_top_keywords: formatKeywords(semrush),
      semrush_top_competitors: formatCompetitors(semrush),
      semrush_competitive_summary: semrush?.summary ?? "",
      semrush_browser_review_status: semrush ? "api_enriched" : "needs_browser_review",
      semrush_browser_source_notes: "",
      semrush_errors: semrush?.errors.join(" | ") ?? "",
      classification: audit.signals.classification ?? "",
      audit_status: audit.status,
      top_issues: issue,
      pitch_hook: pitchHook(playbook, src, issue),
      source_notes: src.notes,
    });

    console.log(
      `[csv] ${String(i + 1).padStart(3)}/${rows.length} ` +
        `prio ${String(scored?.priority ?? 0).padStart(3)} ` +
        `${String(contacts.length).padStart(2)} contacts ${src.name || website}`,
    );
  }

  const ranked = out
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .map((row, i) => ({ ...row, rank: String(i + 1) }));

  await mkdir(paths.outputsDir, { recursive: true });
  const outputPath =
    opts.output ??
    resolve(paths.outputsDir, `${playbook.id}-${slug(new Date().toISOString().slice(0, 19))}-enriched.csv`);
  await writeFile(outputPath, writeCsv(ranked), "utf-8");

  console.log(`[csv] wrote ${ranked.length} enriched rows to ${outputPath}`);
  return { count: ranked.length, outputPath };
}
