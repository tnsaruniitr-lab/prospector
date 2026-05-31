import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeWebsite } from "./contact-extract.js";
import { dossierToCsv, type Dossier, type DossierContact } from "./dossier.js";
import { synthesizeDiagnosis } from "./synthesis.js";

type Row = Record<string, string>;

interface DossierCsvOpts {
  input: string;
  output?: string;
  limit?: number;
  start?: number;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "outputs");

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
  if (cell || row.length) rows.push([...row, cell]);

  const [headersRaw, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!headersRaw) return [];
  const headers = headersRaw.map((h) => h.trim());
  return body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i]?.trim() ?? ""])));
}

function pick(row: Row, ...keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function yn(v: string) {
  if (!v) return false;
  return /^(y|yes|true|1)$/i.test(v.trim());
}

function num(v: string): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/,/g, "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function domainFromWebsite(website: string) {
  if (!website) return "";
  try {
    return new URL(normalizeWebsite(website)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
  }
}

function leadOffer(v: string): Dossier["leadOffer"] {
  return v === "bot" || v === "attribution" || v === "aeo" ? v : "aeo";
}

function contactFromRow(row: Row): DossierContact | null {
  const name = pick(row, "best_contact_name", "founder_name");
  const role = pick(row, "best_contact_role", "founder_role");
  const email = pick(row, "best_contact_email", "founder_email");
  const phone = pick(row, "best_contact_phone", "founder_phone");
  const linkedin = pick(row, "best_contact_linkedin", "founder_linkedin");
  if (!name && !linkedin) return null;
  return {
    name: name || "Unknown decision-maker",
    role: role || "Decision-maker",
    email: email || null,
    phone: phone || null,
    linkedin: linkedin || null,
    linkedinVerified: /verified/i.test(pick(row, "linkedin_review_status", "founder_linkedin_verified")),
    source: pick(row, "contact_source", "source") || "quick_csv",
  };
}

function parseCompetitors(value: string) {
  if (!value) return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((part) => {
      const m = part.match(/^([^()]+)(?:\(([^)]*)\))?/);
      return {
        domain: (m?.[1] ?? part).trim(),
        keywords: (m?.[2] ?? "").trim() || undefined,
      };
    });
}

function inferBooleans(issueText: string) {
  const t = issueText.toLowerCase();
  return {
    hasLocalBusiness: /localbusiness|medicalbusiness|medicalclinic/.test(t) ? !/no|missing|can't identify|cannot identify/.test(t) : false,
    hasPerson: /no person schema|person schema found|lead practitioner.*invisible|credential/.test(t) ? !/no person schema|invisible/.test(t) : false,
    hasFAQ: /faq/.test(t) ? !/no faq|missing faq|nothing to cite/.test(t) : false,
    hasAggregateRating: /aggregaterating|review schema|rating/.test(t) ? !/no review|missing|no aggregaterating/.test(t) : false,
  };
}

function rowToDossier(row: Row): Dossier {
  const name = pick(row, "business_name", "name") || "Unnamed prospect";
  const website = pick(row, "website", "domain");
  const domain = domainFromWebsite(website);
  const category = pick(row, "category") || "prospect";
  const city = pick(row, "city");
  const country = pick(row, "country");
  const geo = [city, country].filter(Boolean).join(", ") || pick(row, "geo") || "unknown";
  const issues = pick(row, "top_issues", "top_3_ai_problems", "semrush_competitive_summary");
  const inferred = inferBooleans(issues);
  const aiMentions = num(pick(row, "semrush_ai_mentions", "ai_mentions"));
  const citedPages = num(pick(row, "semrush_ai_cited_pages", "ai_cited_pages"));
  const authorityScore = pick(row, "semrush_authority_score", "authority_score");

  const dx = synthesizeDiagnosis({
    name,
    category,
    geo,
    hasLocalBusiness: inferred.hasLocalBusiness,
    hasPerson: inferred.hasPerson,
    hasFAQ: inferred.hasFAQ,
    hasAggregateRating: inferred.hasAggregateRating,
    authorityScore: num(authorityScore),
    aiMentions,
    citedPages,
  });

  const founder = contactFromRow(row);
  const semrushStatus = pick(row, "semrush_browser_review_status");
  const sourceNotes = [
    pick(row, "source_notes", "sources"),
    semrushStatus ? `SEMrush browser status: ${semrushStatus}` : "",
    "Generated from quick CSV; run the browser deep-research flow to confirm title/H1/H2/schema/image counts and LinkedIn profiles.",
  ].filter(Boolean).join(" ");

  return {
    name,
    domain,
    category,
    geo,
    googleRating: num(pick(row, "google_rating")),
    googleReviews: num(pick(row, "google_reviews")),
    positioning: pick(row, "positioning") || `${category}${geo !== "unknown" ? ` in ${geo}` : ""}`,
    usp: pick(row, "usp") || pick(row, "source_notes") || "",
    services: pick(row, "services") ? pick(row, "services").split("|").map((s) => s.trim()).filter(Boolean) : [category],
    contacts: {
      businessEmail: pick(row, "business_email") || null,
      secondEmail: pick(row, "second_email") || null,
      businessPhone: pick(row, "business_phone") || null,
      whatsapp: pick(row, "whatsapp") || null,
      instagram: pick(row, "instagram") || null,
      bookingLink: pick(row, "booking_link") || null,
      founder,
    },
    audit: {
      title: pick(row, "audit_title"),
      schemaTypes: pick(row, "schema_types") ? pick(row, "schema_types").split(",").map((s) => s.trim()).filter(Boolean) : [],
      hasLocalBusiness: inferred.hasLocalBusiness,
      hasPerson: inferred.hasPerson,
      hasFAQ: inferred.hasFAQ,
      hasAggregateRating: inferred.hasAggregateRating,
      hasWhatsApp: !!pick(row, "whatsapp") || yn(pick(row, "has_whatsapp")),
      hasWhatsAppBot: yn(pick(row, "has_whatsapp_bot")),
      hasChatWidget: yn(pick(row, "has_chatbot")),
    },
    competitive: {
      authorityScore,
      organicTraffic: pick(row, "semrush_organic_traffic", "organic_traffic"),
      trafficTrend: pick(row, "traffic_trend"),
      organicKeywords: pick(row, "semrush_organic_keywords", "organic_keywords"),
      backlinks: pick(row, "semrush_backlinks", "backlinks"),
      refDomains: pick(row, "semrush_referring_domains", "ref_domains"),
      aiVisibility: {
        mentions: pick(row, "semrush_ai_mentions", "ai_mentions"),
        citedPages: pick(row, "semrush_ai_cited_pages", "ai_cited_pages"),
        chatgpt: pick(row, "semrush_chatgpt_mentions", "ai_chatgpt"),
        gemini: pick(row, "ai_gemini"),
        aiOverview: pick(row, "semrush_ai_overview_total", "ai_overview"),
        aiMode: pick(row, "ai_mode"),
      },
      competitors: parseCompetitors(pick(row, "semrush_top_competitors", "top_competitors")),
    },
    topAiProblems: dx.problems,
    topFixes: dx.fixes,
    hook: pick(row, "hook") || dx.hook,
    leadOffer: leadOffer(pick(row, "lead_offer")),
    pitch: pick(row, "pitch") || pick(row, "pitch_hook") || dx.hook,
    priorityNote: pick(row, "priority_note") || (pick(row, "priority") ? `Quick-list priority ${pick(row, "priority")}.` : ""),
    researchStatus: semrushStatus.startsWith("browser_verified") ? "partial_browser_verified" : "partial",
    outreachStatus: pick(row, "outreach_status") || "new",
    notes: pick(row, "notes") || issues,
    researchedNote: sourceNotes,
  };
}

export function runDossierCsv(opts: DossierCsvOpts) {
  const input = resolve(opts.input);
  const rows = parseCsv(readFileSync(input, "utf-8"));
  const start = opts.start ?? 0;
  const limited = rows.slice(start, opts.limit ? start + opts.limit : undefined);
  const dossiers = limited.map(rowToDossier);
  mkdirSync(outDir, { recursive: true });
  const output = resolve(opts.output ?? resolve(outDir, "prospect-dossier-from-csv.csv"));
  writeFileSync(output, dossierToCsv(dossiers), "utf-8");
  console.log(`[dossier-csv] wrote ${dossiers.length} dossier-shaped rows → ${output}`);
  return { output, count: dossiers.length };
}

function parseArgs(argv: string[]): DossierCsvOpts {
  const opts: DossierCsvOpts = { input: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") opts.input = argv[++i];
    else if (argv[i] === "--output") opts.output = argv[++i];
    else if (argv[i] === "--limit") opts.limit = Number(argv[++i]);
    else if (argv[i] === "--start") opts.start = Number(argv[++i]);
  }
  if (!opts.input) throw new Error("dossier-csv requires --input");
  return opts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDossierCsv(parseArgs(process.argv.slice(2)));
}
