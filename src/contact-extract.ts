import type {
  ExtractedContact,
  SiteContactExtraction,
  SocialLinks,
} from "./types.js";

interface ContactExtractionOpts {
  maxPages?: number;
  timeoutMs?: number;
  contactTitles?: string[];
}

interface PageData {
  url: string;
  html: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const COMMON_PATHS = [
  "/contact",
  "/kontakt",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/meet-the-team",
  "/doctors",
  "/providers",
  "/practitioners",
  "/attorneys",
  "/lawyers",
  "/impressum",
  "/booking",
  "/book-online",
];

const DEFAULT_ROLE_TERMS = [
  "owner",
  "founder",
  "co-founder",
  "ceo",
  "president",
  "managing partner",
  "partner",
  "principal",
  "director",
  "clinic director",
  "medical director",
  "practice manager",
  "marketing manager",
  "marketing director",
  "doctor",
  "dentist",
  "orthodontist",
  "dermatologist",
  "attorney",
  "lawyer",
  "rechtsanwalt",
  "geschaftsfuhrer",
  "geschaeftsfuehrer",
  "inhaber",
  "inhaberin",
];

const GENERIC_EMAIL_PREFIXES = new Set([
  "info",
  "hello",
  "contact",
  "office",
  "admin",
  "support",
  "service",
  "team",
  "booking",
  "appointments",
  "appointment",
  "termin",
  "reception",
  "mail",
]);

const BOOKING_RE =
  /https?:\/\/[^"'\s<>]*(calendly|acuityscheduling|mindbodyonline|zocdoc|doctolib|janeapp|phorest|fresha|booksy|treatwell|simplybook|appointlet|squareup\.com\/appointments)[^"'\s<>]*/gi;

function uniq<T>(items: T[]): T[] {
  return [...new Set(items.filter(Boolean))];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function normalizeWebsite(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const u = new URL(withScheme);
  u.hash = "";
  return u.toString();
}

function sameHost(url: string, root: URL) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function addCandidate(
  candidates: Map<string, number>,
  href: string,
  score: number,
  root: URL,
) {
  let u: URL;
  try {
    u = new URL(href, root);
  } catch {
    return;
  }
  if (!["http:", "https:"].includes(u.protocol)) return;
  u.hash = "";
  if (!sameHost(u.toString(), root)) return;
  if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mov)$/i.test(u.pathname)) return;
  const key = u.toString();
  candidates.set(key, Math.max(candidates.get(key) ?? 0, score));
}

function linkScore(href: string, anchor: string) {
  const s = `${href} ${anchor}`.toLowerCase();
  let score = 5;
  if (/contact|kontakt|impressum/.test(s)) score += 60;
  if (/about|team|doctor|provider|attorney|lawyer|founder|owner|practice|clinic/.test(s)) score += 45;
  if (/book|appointment|termin|consult/.test(s)) score += 20;
  if (/privacy|terms|cookie|blog|news|career|job/.test(s)) score -= 20;
  return score;
}

function discoverLinks(html: string, root: URL): Map<string, number> {
  const out = new Map<string, number>();
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(linkRe)) {
    const href = decodeHtml(m[1] ?? "");
    const anchor = stripHtml(m[2] ?? "").slice(0, 120);
    addCandidate(out, href, linkScore(href, anchor), root);
  }
  return out;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<PageData | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return null;
    return { url: res.url, html: await res.text() };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\s+/g, " "),
  ).trim();
}

function normalizePhone(raw: string): string | null {
  const withoutScheme = raw.replace(/^tel:/i, "").replace(/^\/+/, "").trim();
  if (/\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(withoutScheme)) return null;
  if (/\b\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}\b/.test(withoutScheme)) return null;
  const cleaned = withoutScheme.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 16) return null;
  if (/^(\d)\1+$/.test(digits)) return null;
  return cleaned.startsWith("+") ? `+${digits}` : withoutScheme;
}

function extractEmails(html: string): string[] {
  const text = decodeHtml(html);
  const raw = [
    ...(text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []),
  ];

  for (const m of text.matchAll(/mailto:([^"'\s?#]+)/gi)) {
    raw.push(decodeURIComponent(m[1] ?? ""));
  }

  const obfuscated =
    /([A-Za-z0-9._%+-]+)\s*(?:\(|\[)?at(?:\)|\])?\s*([A-Za-z0-9.-]+)\s*(?:\(|\[)?dot(?:\)|\])?\s*([A-Za-z]{2,})/gi;
  for (const m of text.matchAll(obfuscated)) {
    raw.push(`${m[1]}@${m[2]}.${m[3]}`);
  }

  return uniq(
    raw
      .map((e) => e.trim().replace(/^mailto:/i, "").toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e))
      .filter((e) => !/example\.com|domain\.com|email\.com/i.test(e)),
  ).slice(0, 12);
}

function extractPhones(html: string): string[] {
  const text = decodeHtml(html);
  const raw = [...(text.match(/tel:\/?\/?\+?[0-9 ()/.-]{7,}/gi) ?? [])];
  const contextual =
    /(?:phone|tel|call|telefon|kontakt|whatsapp|mobile|mobil|fax)[^+\d]{0,35}((?:\+|00)?[0-9][0-9 ()./-]{7,}[0-9])/gi;
  for (const m of text.matchAll(contextual)) raw.push(m[1] ?? "");
  const byDigits = new Map<string, string>();
  for (const phone of raw.map(normalizePhone).filter((p): p is string => !!p)) {
    const digits = phone.replace(/\D/g, "");
    if (!byDigits.has(digits)) byDigits.set(digits, phone);
  }
  return [...byDigits.values()].slice(0, 12);
}

function firstUrl(html: string, re: RegExp): string | null {
  const m = decodeHtml(html).match(re);
  return m?.[0]?.replace(/[).,;]+$/, "") ?? null;
}

function usableSocial(url: string | null): string | null {
  if (!url) return null;
  if (/cmsmasters|wordpress|themeforest|envato|wp-content|template/i.test(url)) return null;
  return url;
}

function extractSocials(html: string): SocialLinks {
  const instagramUrl = firstUrl(html, /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?/i);
  const instagram =
    instagramUrl && !/instagram\.com\/(p|reel|explore|accounts)\b/i.test(instagramUrl)
      ? instagramUrl
      : null;
  return {
    instagram: usableSocial(instagram),
    linkedin: usableSocial(firstUrl(html, /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9_.%-]+\/?/i)),
    facebook: usableSocial(firstUrl(html, /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.%-]+\/?/i)),
    tiktok: usableSocial(firstUrl(html, /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?/i)),
    youtube: usableSocial(firstUrl(html, /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/)[A-Za-z0-9_.%-]+\/?/i)),
    x: usableSocial(firstUrl(html, /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{2,40}\/?/i)),
  };
}

function mergeSocials(a: SocialLinks, b: SocialLinks): SocialLinks {
  return {
    instagram: a.instagram ?? b.instagram,
    linkedin: a.linkedin ?? b.linkedin,
    facebook: a.facebook ?? b.facebook,
    tiktok: a.tiktok ?? b.tiktok,
    youtube: a.youtube ?? b.youtube,
    x: a.x ?? b.x,
  };
}

function extractWhatsapp(html: string): string | null {
  const m = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{6,})/i);
  return m?.[1] ?? null;
}

function extractForms(html: string, pageUrl: string): string[] {
  if (!/<form\b/i.test(html)) return [];
  const actions = [...html.matchAll(/<form\b[^>]*action=["']([^"']+)["']/gi)]
    .map((m) => decodeHtml(m[1] ?? ""))
    .filter(Boolean);
  if (!actions.length) return [pageUrl];
  return actions.slice(0, 3).map((action) => {
    try {
      return new URL(action, pageUrl).toString();
    } catch {
      return pageUrl;
    }
  });
}

function extractBookingLinks(html: string): string[] {
  return uniq([...(decodeHtml(html).match(BOOKING_RE) ?? [])].map((u) => u.replace(/[).,;]+$/, ""))).slice(0, 8);
}

function jsonLdObjects(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const body = decodeHtml(m[1] ?? "").trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(body));
    } catch {
      continue;
    }
  }
  return out;
}

function typeIncludes(node: Record<string, unknown>, wanted: string[]) {
  const raw = node["@type"];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((t) => typeof t === "string" && wanted.includes(t.toLowerCase()));
}

function collectJsonPeople(node: unknown, pageUrl: string, out: ExtractedContact[]) {
  if (Array.isArray(node)) {
    node.forEach((v) => collectJsonPeople(v, pageUrl, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj["@graph"])) collectJsonPeople(obj["@graph"], pageUrl, out);

  if (typeIncludes(obj, ["person", "physician", "dentist", "attorney"])) {
    const name = typeof obj.name === "string" ? obj.name.trim() : null;
    if (name) {
      const sameAs = Array.isArray(obj.sameAs)
        ? obj.sameAs.filter((v): v is string => typeof v === "string")
        : typeof obj.sameAs === "string"
          ? [obj.sameAs]
          : [];
      out.push({
        name,
        role: typeof obj.jobTitle === "string" ? obj.jobTitle : null,
        email: typeof obj.email === "string" ? obj.email.toLowerCase() : null,
        phone: typeof obj.telephone === "string" ? obj.telephone : null,
        linkedinUrl: sameAs.find((u) => /linkedin\.com\/in\//i.test(u)) ?? null,
        instagram: sameAs.find((u) => /instagram\.com\//i.test(u)) ?? null,
        source: "website_crawl",
        confidence: 0.86,
        evidence: `JSON-LD person on ${pageUrl}`,
      });
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectJsonPeople(value, pageUrl, out);
  }
}

function roleTerms(contactTitles: string[]) {
  return uniq([...DEFAULT_ROLE_TERMS, ...contactTitles].map((s) => s.toLowerCase()));
}

function plausibleName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (/\b(best|contact|medical|clinic|law|spa|dental|privacy|terms|services|street|road|avenue|platz|allee)\b/i.test(name)) return false;
  if (/stra(ß|ss)e/i.test(name)) return false;
  if (/^[A-Z]{2,3}\b/.test(words[0]) || /\b(die|das|zur|zum)\b/i.test(name)) return false;
  return words.every((w) => /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]*\.?$|^(van|von|de|der|el|al)$/i.test(w));
}

function scoreTextContact(role: string | null, hasProfile: boolean, hasEmail: boolean) {
  let score = 0.5;
  if (role && /founder|owner|ceo|partner|director|inhaber|geschaft|geschaeft/i.test(role)) score += 0.18;
  if (role && /doctor|dr|dentist|attorney|lawyer|medical/i.test(role)) score += 0.1;
  if (hasProfile) score += 0.1;
  if (hasEmail) score += 0.08;
  return clamp(score, 0.45, 0.9);
}

function extractPeopleFromText(html: string, pageUrl: string, contactTitles: string[]): ExtractedContact[] {
  const text = stripHtml(html);
  const terms = roleTerms(contactTitles).map(escapeRegExp).join("|");
  const roleTerm = String.raw`\b(?:${terms})\b`;
  const name = String.raw`(?:Dr\.?\s+)?[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+(?:\s+(?:[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ.'-]+|van|von|de|der|el|al)){1,4}`;
  const out: ExtractedContact[] = [];

  const after = new RegExp(`(${name})\\s*(?:,|\\||-|:)\\s*(${roleTerm})`, "gi");
  for (const m of text.matchAll(after)) {
    const personName = (m[1] ?? "").trim();
    const role = (m[2] ?? "").trim();
    if (!plausibleName(personName)) continue;
    out.push({
      name: personName,
      role,
      email: null,
      phone: null,
      linkedinUrl: null,
      instagram: null,
      source: "website_crawl",
      confidence: scoreTextContact(role, false, false),
      evidence: `Role/name text on ${pageUrl}`,
    });
  }

  const before = new RegExp(`(${roleTerm})\\s*(?:,|\\||-|:)\\s*(${name})`, "gi");
  for (const m of text.matchAll(before)) {
    const role = (m[1] ?? "").trim();
    const personName = (m[2] ?? "").trim();
    if (!plausibleName(personName)) continue;
    out.push({
      name: personName,
      role,
      email: null,
      phone: null,
      linkedinUrl: null,
      instagram: null,
      source: "website_crawl",
      confidence: scoreTextContact(role, false, false),
      evidence: `Role/name text on ${pageUrl}`,
    });
  }

  return out;
}

function nonGenericEmail(emails: string[]): string | null {
  return emails.find((email) => {
    const prefix = email.split("@")[0]?.toLowerCase() ?? "";
    return !GENERIC_EMAIL_PREFIXES.has(prefix);
  }) ?? null;
}

function contactKey(c: ExtractedContact) {
  return [
    c.name?.toLowerCase() ?? "",
    c.email?.toLowerCase() ?? "",
    c.linkedinUrl?.toLowerCase() ?? "",
    c.role?.toLowerCase() ?? "",
  ].join("|");
}

function dedupeContacts(contacts: ExtractedContact[]): ExtractedContact[] {
  const map = new Map<string, ExtractedContact>();
  for (const c of contacts) {
    const key = contactKey(c);
    const prior = map.get(key);
    if (!prior || c.confidence > prior.confidence) map.set(key, c);
  }
  return [...map.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

export async function extractSiteContacts(
  website: string,
  opts: ContactExtractionOpts = {},
): Promise<SiteContactExtraction> {
  const maxPages = opts.maxPages ?? 8;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const rootUrl = normalizeWebsite(website);
  const root = new URL(rootUrl);

  const candidates = new Map<string, number>();
  addCandidate(candidates, rootUrl, 100, root);
  for (const path of COMMON_PATHS) addCandidate(candidates, path, 50, root);

  const seen = new Set<string>();
  const pagesScanned: string[] = [];
  const notes: string[] = [];
  let emails: string[] = [];
  let phones: string[] = [];
  let whatsapp: string | null = null;
  let socials: SocialLinks = { instagram: null, linkedin: null, facebook: null, tiktok: null, youtube: null, x: null };
  let contactForms: string[] = [];
  let bookingLinks: string[] = [];
  let people: ExtractedContact[] = [];

  while (pagesScanned.length < maxPages) {
    const next = [...candidates.entries()]
      .filter(([url]) => !seen.has(url))
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!next) break;
    seen.add(next);

    const page = await fetchHtml(next, timeoutMs);
    if (!page) {
      notes.push(`Could not fetch ${next}`);
      continue;
    }

    pagesScanned.push(page.url);
    emails = uniq([...emails, ...extractEmails(page.html)]).slice(0, 16);
    phones = uniq([...phones, ...extractPhones(page.html)]).slice(0, 16);
    whatsapp = whatsapp ?? extractWhatsapp(page.html);
    socials = mergeSocials(socials, extractSocials(page.html));
    contactForms = uniq([...contactForms, ...extractForms(page.html, page.url)]).slice(0, 8);
    bookingLinks = uniq([...bookingLinks, ...extractBookingLinks(page.html)]).slice(0, 8);

    const jsonPeople: ExtractedContact[] = [];
    for (const obj of jsonLdObjects(page.html)) collectJsonPeople(obj, page.url, jsonPeople);
    people = [...people, ...jsonPeople, ...extractPeopleFromText(page.html, page.url, opts.contactTitles ?? [])];

    for (const [href, score] of discoverLinks(page.html, root)) {
      addCandidate(candidates, href, score, root);
    }
  }

  const personalEmail = nonGenericEmail(emails);
  people = dedupeContacts(people).map((p) => ({
    ...p,
    email: p.email ?? null,
    phone: p.phone ?? null,
    confidence: scoreTextContact(p.role, !!p.linkedinUrl, !!(p.email ?? personalEmail)),
  }));

  if (socials.linkedin && /linkedin\.com\/in\//i.test(socials.linkedin)) {
    people.push({
      name: null,
      role: null,
      email: null,
      phone: null,
      linkedinUrl: socials.linkedin,
      instagram: socials.instagram,
      source: "website_crawl",
      confidence: 0.5,
      evidence: `LinkedIn profile linked from site`,
    });
  }

  if (emails.length || phones.length || socials.instagram || whatsapp || contactForms.length) {
    people.push({
      name: null,
      role: "General contact",
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
      linkedinUrl: socials.linkedin,
      instagram: socials.instagram,
      source: "website_crawl",
      confidence: 0.42,
      evidence: `Generic contact details from website crawl`,
    });
  }

  return {
    pagesScanned,
    emails,
    phones,
    whatsapp,
    socials,
    contactForms,
    bookingLinks,
    people: dedupeContacts(people),
    notes,
  };
}
