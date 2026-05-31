import { config } from "./config.js";

export interface SemrushOverview {
  rank: string;
  organicKeywords: number | null;
  organicTraffic: number | null;
  organicCost: number | null;
  adwordsKeywords: number | null;
  adwordsTraffic: number | null;
  adwordsCost: number | null;
  aiOverviewOccurrences: number | null;
  aiOverviewOwned: number | null;
}

export interface SemrushKeyword {
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  volume: number | null;
  cpc: number | null;
  trafficPct: number | null;
  url: string;
  intent: string;
}

export interface SemrushCompetitor {
  domain: string;
  relevance: number | null;
  commonKeywords: number | null;
  organicKeywords: number | null;
  organicTraffic: number | null;
  organicCost: number | null;
}

export interface SemrushBacklinksOverview {
  authorityScore: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  followBacklinks: number | null;
  nofollowBacklinks: number | null;
  textBacklinks: number | null;
  imageBacklinks: number | null;
}

export interface SemrushEnrichment {
  database: string;
  overview: SemrushOverview | null;
  topKeywords: SemrushKeyword[];
  competitors: SemrushCompetitor[];
  backlinks: SemrushBacklinksOverview | null;
  summary: string;
  errors: string[];
}

type CsvRow = Record<string, string>;

const SEO_ENDPOINT = "https://api.semrush.com/";
const BACKLINKS_ENDPOINT = "https://api.semrush.com/analytics/v1/";

const COUNTRY_DATABASE: Record<string, string> = {
  "united states": "us",
  usa: "us",
  us: "us",
  germany: "de",
  deutschland: "de",
  de: "de",
  "united arab emirates": "ae",
  uae: "ae",
  "saudi arabia": "sa",
  ksa: "sa",
  turkey: "tr",
  turkiye: "tr",
  türkiye: "tr",
  "united kingdom": "uk",
  uk: "uk",
  canada: "ca",
  australia: "au",
  france: "fr",
  spain: "es",
  italy: "it",
  india: "in",
};

const CITY_DATABASE: Record<string, string> = {
  berlin: "de",
  "new york": "us",
  nyc: "us",
  miami: "us",
  dubai: "ae",
  riyadh: "sa",
  istanbul: "tr",
  london: "uk",
  toronto: "ca",
  sydney: "au",
  paris: "fr",
  madrid: "es",
  milan: "it",
  mumbai: "in",
  delhi: "in",
};

function toNum(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text: string): CsvRow[] {
  const sep = text.includes(";") ? ";" : ",";
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
    } else if (ch === sep) {
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

function domainOnly(domainOrUrl: string): string {
  try {
    return new URL(/^https?:\/\//i.test(domainOrUrl) ? domainOrUrl : `https://${domainOrUrl}`)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return domainOrUrl.replace(/^www\./, "").toLowerCase();
  }
}

export function inferSemrushDatabase(country: string, city: string): string {
  if (config.SEMRUSH_DATABASE) return config.SEMRUSH_DATABASE;
  const c = country.trim().toLowerCase();
  const local = city.trim().toLowerCase();
  if (c && COUNTRY_DATABASE[c]) return COUNTRY_DATABASE[c];
  for (const [key, db] of Object.entries(CITY_DATABASE)) {
    if (local.includes(key)) return db;
  }
  return "us";
}

async function semrushCsv(endpoint: string, params: Record<string, string | number | undefined>): Promise<CsvRow[]> {
  if (!config.SEMRUSH_API_KEY) return [];
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({ key: config.SEMRUSH_API_KEY, ...params })) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || /^ERROR/i.test(text)) {
    throw new Error(text.slice(0, 220).replace(/\s+/g, " "));
  }
  return parseCsv(text);
}

async function domainOverview(domain: string, database: string): Promise<SemrushOverview | null> {
  const rows = await semrushCsv(SEO_ENDPOINT, {
    type: "domain_ranks",
    domain,
    database,
    export_columns: "Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac,FK52,FP52",
  });
  const r = rows[0];
  if (!r) return null;
  return {
    rank: r.Rank || r.Rk || "",
    organicKeywords: toNum(r["Organic Keywords"] ?? r.Or),
    organicTraffic: toNum(r["Organic Traffic"] ?? r.Ot),
    organicCost: toNum(r["Organic Cost"] ?? r.Oc),
    adwordsKeywords: toNum(r["Adwords Keywords"] ?? r.Ad),
    adwordsTraffic: toNum(r["Adwords Traffic"] ?? r.At),
    adwordsCost: toNum(r["Adwords Cost"] ?? r.Ac),
    aiOverviewOccurrences: toNum(r.FK52),
    aiOverviewOwned: toNum(r.FP52),
  };
}

async function topOrganicKeywords(domain: string, database: string): Promise<SemrushKeyword[]> {
  const rows = await semrushCsv(SEO_ENDPOINT, {
    type: "domain_organic",
    domain,
    database,
    display_limit: config.SEMRUSH_TOP_KEYWORDS_LIMIT,
    display_sort: "tr_desc",
    export_columns: "Ph,Po,Pp,Nq,Cp,Ur,Tr,Tc,In",
  });
  return rows.map((r) => ({
    keyword: r.Keyword || r.Ph || "",
    position: toNum(r.Position ?? r.Po),
    previousPosition: toNum(r["Previous Position"] ?? r.Pp),
    volume: toNum(r.Volume ?? r.Nq),
    cpc: toNum(r.CPC ?? r.Cp),
    trafficPct: toNum(r["Traffic (%)"] ?? r.Tr),
    url: r.Url || r.URL || r.Ur || "",
    intent: r.Intent || r.In || "",
  })).filter((k) => k.keyword);
}

async function organicCompetitors(domain: string, database: string): Promise<SemrushCompetitor[]> {
  const rows = await semrushCsv(SEO_ENDPOINT, {
    type: "domain_organic_organic",
    domain,
    database,
    display_limit: config.SEMRUSH_COMPETITORS_LIMIT,
    export_columns: "Dn,Cr,Np,Or,Ot,Oc",
    display_sort: "cr_desc",
  });
  return rows.map((r) => ({
    domain: r.Domain || r.Dn || "",
    relevance: toNum(r["Competitor Relevance"] ?? r.Cr),
    commonKeywords: toNum(r["Common Keywords"] ?? r.Np),
    organicKeywords: toNum(r["Organic Keywords"] ?? r.Or),
    organicTraffic: toNum(r["Organic Traffic"] ?? r.Ot),
    organicCost: toNum(r["Organic Cost"] ?? r.Oc),
  })).filter((c) => c.domain);
}

async function backlinksOverview(domain: string): Promise<SemrushBacklinksOverview | null> {
  const rows = await semrushCsv(BACKLINKS_ENDPOINT, {
    type: "backlinks_overview",
    target: domain,
    target_type: "root_domain",
    export_columns: "ascore,total,domains_num,follow_num,nofollow_num,texts_num,images_num",
  });
  const r = rows[0];
  if (!r) return null;
  return {
    authorityScore: toNum(r.ascore ?? r["Authority Score"]),
    backlinks: toNum(r.total ?? r.Backlinks),
    referringDomains: toNum(r.domains_num ?? r["Referring Domains"]),
    followBacklinks: toNum(r.follow_num),
    nofollowBacklinks: toNum(r.nofollow_num),
    textBacklinks: toNum(r.texts_num),
    imageBacklinks: toNum(r.images_num),
  };
}

function summarize(data: Omit<SemrushEnrichment, "summary">): string {
  const parts: string[] = [];
  if (data.overview) {
    const o = data.overview;
    parts.push(
      `Organic traffic ${o.organicTraffic ?? "n/a"}, keywords ${o.organicKeywords ?? "n/a"}, cost ${o.organicCost ?? "n/a"}`,
    );
    if (o.aiOverviewOccurrences != null || o.aiOverviewOwned != null) {
      parts.push(`AI Overview owned ${o.aiOverviewOwned ?? 0}/${o.aiOverviewOccurrences ?? 0}`);
    }
  }
  if (data.backlinks) {
    parts.push(
      `Authority ${data.backlinks.authorityScore ?? "n/a"}, referring domains ${data.backlinks.referringDomains ?? "n/a"}, backlinks ${data.backlinks.backlinks ?? "n/a"}`,
    );
  }
  if (data.competitors.length) {
    parts.push(`Competitors: ${data.competitors.slice(0, 3).map((c) => c.domain).join(", ")}`);
  }
  if (data.topKeywords.length) {
    parts.push(`Top keywords: ${data.topKeywords.slice(0, 4).map((k) => `${k.keyword} #${k.position ?? "?"}`).join(", ")}`);
  }
  return parts.join(" | ");
}

export async function enrichSemrush(opts: {
  domainOrUrl: string | null;
  country: string;
  city: string;
}): Promise<SemrushEnrichment | null> {
  if (!config.SEMRUSH_API_KEY || !opts.domainOrUrl) return null;

  const domain = domainOnly(opts.domainOrUrl);
  const database = inferSemrushDatabase(opts.country, opts.city);
  const errors: string[] = [];

  const settled = await Promise.allSettled([
    domainOverview(domain, database),
    topOrganicKeywords(domain, database),
    organicCompetitors(domain, database),
    backlinksOverview(domain),
  ]);

  const overview = settled[0].status === "fulfilled" ? settled[0].value : null;
  const topKeywords = settled[1].status === "fulfilled" ? settled[1].value : [];
  const competitors = settled[2].status === "fulfilled" ? settled[2].value : [];
  const backlinks = settled[3].status === "fulfilled" ? settled[3].value : null;

  for (const result of settled) {
    if (result.status === "rejected") errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  }

  const data = { database, overview, topKeywords, competitors, backlinks, errors };
  return { ...data, summary: summarize(data) };
}
