/**
 * Website-first onboarding — infer the seller's persona from their own site.
 *
 * Spec: docs/configurable-sources-design.md (URL-based onboarding).
 *
 * Reads the seller's website (plain fetch — a public page, no API key) and maps
 * it to the VALIDATED persona library (personas.ts). Mapping-to-library, not
 * invent-from-scratch, so we keep the tested signal maps + relevance weights.
 *
 * Deterministic + testable. A richer Claude-driven inference can layer on top,
 * but this keyword mapper is the reliable backbone (and accurate for mapping to
 * a known set of personas).
 */

import { getPersona, listPersonas } from "./personas.js";

// Keyword signatures per persona (lowercased, matched against site text).
export const PERSONA_KEYWORDS: Record<string, string[]> = {
  ai_search_visibility: [
    "ai search", "aeo", "geo", "answer engine", "generative engine", "chatgpt",
    "gemini", "ai overview", "ai overviews", "llm visibility", "ai visibility",
    "cited by ai", "perplexity", "answer engine optimization", "ai-search",
  ],
  web_redesign: [
    "web design", "website redesign", "redesign", "web development", "ui design",
    "ux design", "landing page", "wordpress", "webflow", "website build",
    "web designer", "rebuild your website", "modern website",
  ],
  seo_services: [
    "seo", "search engine optimization", "rankings", "ranking", "backlinks",
    "backlink", "organic traffic", "keyword", "keywords", "serp", "link building",
    "on-page seo", "technical seo",
  ],
  recruiting: [
    "recruiting", "recruitment", "talent", "hiring", "staffing", "headhunt",
    "headhunting", "candidates", "placement", "talent acquisition", "recruiter",
    "executive search",
  ],
};

export interface InferResult {
  personaId: string | null;
  confidence: number; // 0-1
  confident: boolean; // true only when the match is decisive enough to auto-apply
  topScore: number; // # keyword hits for the winning persona
  scores: Record<string, number>;
  matched: string[];
  title: string;
  description: string;
  suggestedOffer: string;
}

// Decode the common HTML entities so "cards &amp; expenses" → "cards & expenses".
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#0*39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── HTML → text (title + meta description + visible body text) ───────────────
export function extractSiteText(html: string): { title: string; description: string; text: string } {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descM =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const title = decodeEntities((titleM?.[1] || "").replace(/\s+/g, " ").trim());
  const description = decodeEntities((descM?.[1] || "").replace(/\s+/g, " ").trim());
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title, description, text: `${title} ${description} ${body}`.toLowerCase() };
}

// ── Map text → persona (keyword scoring over the validated library) ─────────
export function inferPersonaFromText(text: string): InferResult {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};
  const matched: string[] = [];

  for (const persona of listPersonas()) {
    const kws = PERSONA_KEYWORDS[persona.id] ?? [];
    let s = 0;
    for (const kw of kws) {
      // word-ish boundary so "seo" doesn't match "seoul"
      const re = new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
      if (re.test(lower)) { s++; matched.push(kw); }
    }
    scores[persona.id] = s;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topId, topScore] = ranked[0] ?? [null, 0];
  const secondScore = ranked[1]?.[1] ?? 0;

  const personaId = topScore > 0 ? topId : null;
  // confidence: how decisively the top persona beats the runner-up
  const confidence = topScore === 0 ? 0 : Math.min(1, topScore / (topScore + secondScore + 1) + (topScore >= 2 ? 0.15 : 0));
  // Only auto-apply a DECISIVE match: ≥2 keyword hits AND a clear margin.
  // A single stray keyword (e.g. a fintech's "hiring" careers link) must NOT
  // clobber the user's brand — it falls back to manual.
  const confident = topScore >= 2 && confidence >= 0.55;

  const persona = personaId ? getPersona(personaId) : null;
  return {
    personaId,
    confidence: Math.round(confidence * 100) / 100,
    confident,
    topScore,
    scores,
    matched: Array.from(new Set(matched)),
    title: "",
    description: "",
    suggestedOffer: persona?.offer ?? "",
  };
}

// ── Fetch a URL → scraped text (plain code, no AI, no key) ──────────────────
export async function fetchAndExtract(rawUrl: string): Promise<{ title: string; description: string; text: string }> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http/https URLs are supported");
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) {
    throw new Error("Refusing to fetch a local/private address");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  let html = "";
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; ProspectEngine/1.0; brand-onboarding)" },
    });
    html = await res.text();
  } finally {
    clearTimeout(t);
  }
  return extractSiteText(html);
}

// ── Keyword inference from a URL (server uses this — instant, no key) ─────────
export async function inferFromUrl(rawUrl: string): Promise<InferResult> {
  const { title, description, text } = await fetchAndExtract(rawUrl);
  const inferred = inferPersonaFromText(text);
  return { ...inferred, title, description, suggestedOffer: description || inferred.suggestedOffer };
}

// ── LLM path (no key — runs in the user's Claude Code via the agent) ─────────

export interface BrandExtract {
  personaId: string | null; // mapped to the library, or null if none fit
  offer: string;
  services: string[];
  customerTypes: string[];
  vertical: string;
  confidence: number; // 0-1, Claude's own
  reasoning: string;
}

/**
 * Build the extraction prompt. Grounds Claude in the SCRAPED TEXT (anti-
 * hallucination), maps to the validated persona library (or null), and — unlike
 * the AnswerMonk version — uses NO hardcoded per-vertical checklists (which prime
 * the model into over-reporting). Claude judges prominence itself.
 */
export function buildBrandExtractPrompt(domain: string, scraped: { title: string; description: string; text: string }): string {
  const personaList = listPersonas()
    .map((p) => `- ${p.id}: ${p.name} — ${p.offer}`)
    .join("\n");
  return [
    "You are a business analyst. Identify what THIS company sells, grounded ONLY in the homepage text below.",
    "Do NOT use outside knowledge or guess from the name — if the text is unclear, say so via low confidence.",
    "",
    `Domain: ${domain}`,
    "Homepage (scraped):",
    "---",
    `Title: ${scraped.title}`,
    `Description: ${scraped.description}`,
    `Text: ${scraped.text.slice(0, 4000)}`,
    "---",
    "",
    "Map them to the CLOSEST seller persona from this list, or null if none genuinely fit:",
    personaList,
    "",
    "Return ONLY raw JSON (no markdown, no backticks):",
    '{"personaId": "<one of the ids above or null>", "offer": "<one sentence, what they sell>",',
    ' "services": ["<service>", ...], "customerTypes": ["<segment>", ...], "vertical": "<short category>",',
    ' "confidence": <0..1>, "reasoning": "<one line>"}',
    "",
    "Rules: personaId must be from the list or null. List every service the text mentions, ranked by prominence — never invent one not in the text. Set confidence < 0.5 if the text is vague or fits no persona.",
  ].join("\n");
}

/** Tolerant parser — strips backticks/prose, validates personaId against the library. */
export function parseBrandExtract(raw: string): BrandExtract | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  s = s.slice(start, end + 1);
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(s); } catch { return null; }

  let personaId = typeof obj.personaId === "string" ? obj.personaId : null;
  if (personaId && !getPersona(personaId)) personaId = null; // must be a real library persona
  return {
    personaId,
    offer: String(obj.offer ?? ""),
    services: Array.isArray(obj.services) ? obj.services.map(String) : [],
    customerTypes: Array.isArray(obj.customerTypes) ? obj.customerTypes.map(String) : [],
    vertical: String(obj.vertical ?? ""),
    confidence: typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0,
    reasoning: String(obj.reasoning ?? ""),
  };
}
