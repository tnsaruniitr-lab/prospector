import type { ExtractedContact } from "./types.js";
import { llmJson } from "./llm.js";

// LLM founder-extraction rung. Self-contained (own fetch) so it stays out of the
// deterministic contact-extract.ts. Fetches homepage + about/team/Impressum/
// contact pages and asks Claude to name the owner(s). Returns [] when there's no
// ANTHROPIC_API_KEY or no named owner — purely additive over the deterministic pass.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAGE_RE =
  /about|team|kontakt|contact|impressum|imprint|doctor|provider|attorney|lawyer|meet|staff|leadership|founder|owner|practice|praxis|ueber|uber|über/i;

async function fetchRaw(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/text\/html|xhtml/i.test(ct)) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function discoverPages(html: string, base: string): string[] {
  const origin = new URL(base).origin;
  const urls = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const href = m[1].trim();
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let abs: URL;
    try { abs = new URL(href, base); } catch { continue; }
    if (abs.origin !== origin) continue;
    if (PAGE_RE.test(abs.pathname)) urls.add(abs.href.split("#")[0]);
  }
  return [...urls].slice(0, 4);
}

interface LlmPerson { name?: string; role?: string | null; email?: string | null; linkedin?: string | null; isOwner?: boolean }

export async function llmExtractOwners(
  website: string,
  businessName: string,
  contactTitles: string[],
): Promise<ExtractedContact[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const base = website.startsWith("http") ? website : `https://${website}`;

  const home = await fetchRaw(base);
  if (!home) return [];

  const texts = [`## ${base}\n${stripHtml(home).slice(0, 4500)}`];
  for (const u of discoverPages(home, base)) {
    const h = await fetchRaw(u);
    if (h) texts.push(`## ${u}\n${stripHtml(h).slice(0, 5000)}`);
  }
  const combined = texts.join("\n\n").slice(0, 15000);

  const titles = [...new Set([
    ...contactTitles, "owner", "founder", "co-founder", "medical director",
    "managing partner", "principal", "geschäftsführer", "inhaber",
  ])].join(", ");

  const prompt =
    `Identify the OWNER(S)/FOUNDER(S)/principal of this business from its website text. ` +
    `Business: "${businessName}". Owner-level roles include: ${titles}. ` +
    `For a GmbH/Ltd with a named Geschäftsführer/managing director in the Impressum, include them as isOwner:true. ` +
    `Return STRICT JSON: an array of {"name","role","email","linkedin","isOwner"}. ` +
    `Include ONLY real individuals explicitly named in the text. Never invent. If none, return [].\n\n` +
    `WEBSITE TEXT:\n${combined}`;

  const arr = await llmJson<LlmPerson[]>(prompt, { maxTokens: 1000 });
  if (!Array.isArray(arr)) return [];

  return arr.filter((p) => p && p.name).slice(0, 6).map((p) => ({
    name: String(p.name).trim(),
    role: p.role ? String(p.role) : null,
    email: p.email && /@/.test(p.email) ? String(p.email).toLowerCase() : null,
    phone: null,
    linkedinUrl: p.linkedin && /linkedin\.com/i.test(p.linkedin) ? String(p.linkedin) : null,
    instagram: null,
    source: "website_crawl" as const,
    confidence: p.isOwner ? 0.82 : 0.55,
    evidence: "LLM-extracted from site about/team/impressum",
  }));
}
