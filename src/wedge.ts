/**
 * Wedge-Finder — turns a detected brand into a Diagnostic Spec: the sharpest
 * MEASURABLE pain that proves a prospect needs this seller, the signals that
 * prove it, the LIGHTEST sources that yield those signals, and a pitch formula.
 *
 * Spec: the productisation layer — generalises the hardcoded AEO diagnostic
 * (SEMrush AI delta → "X gets 11× more mentions") to ANY seller.
 *
 * Source ladder — prefer LIGHT (free, no login, low-risk); escalate to HEAVY
 * (login/paid) only when the wedge genuinely can't be proven otherwise.
 */

import { llmJson } from "./llm.js";

export const LIGHT_SOURCES = ["google_search", "website", "onpage_audit", "google_reviews", "google_maps", "pagespeed"];
export const HEAVY_SOURCES = ["semrush_ai", "semrush_seo", "linkedin_company", "apollo_browser"];

export interface ProvingSignal {
  signal: string;    // e.g. "google_rating"
  meaning: string;   // what it shows
  threshold: string; // what counts as the pain
  source: string;    // which source yields it
}

export interface DiagnosticSpec {
  wedge: string;                 // one-line measurable pain
  provingSignals: ProvingSignal[];
  sources: string[];             // lightest-sufficient, ranked
  sourceTier: "light" | "mixed" | "heavy"; // light = all free/no-login
  pitchFormula: string;          // template with {slots}
  confidence: number;            // 0-1
  reasoning: string;
}

export interface BrandForWedge {
  offer?: string;
  value_prop?: string;
  fixes?: string;
  icp?: string;
  customer_types?: string[];
  vertical?: string;
}

export function buildWedgePrompt(brand: BrandForWedge): string {
  return [
    "You are a B2B sales strategist. Find this seller's sharpest WEDGE: the single most",
    "MEASURABLE, urgent pain that proves a prospect needs them — provable with a NUMBER",
    "and turnable into a compelling cold pitch (like 'you get 11x fewer AI mentions than X').",
    "",
    `What they sell: ${brand.offer || ""}`,
    `Pain they fix: ${brand.value_prop || ""}`,
    `What they do: ${brand.fixes || ""}`,
    `Ideal customer: ${brand.icp || ""}`,
    `Customer types: ${(brand.customer_types || []).join(", ")}`,
    "",
    "Pick the LIGHTEST sources that can prove the wedge. Source ladder (prefer the top):",
    "  LIGHT (free, no login): google_search, website, onpage_audit, google_reviews, google_maps, pagespeed",
    "  HEAVY (login/paid): semrush_ai, semrush_seo, linkedin_company, apollo_browser",
    "Use a HEAVY source ONLY if the wedge genuinely cannot be proven with light ones.",
    "",
    "Return ONLY raw JSON (no markdown, no backticks):",
    '{"wedge":"<one line: the measurable pain that proves they need this seller>",',
    ' "provingSignals":[{"signal":"<key>","meaning":"<what it shows>","threshold":"<what counts as pain>","source":"<from the ladder>"}],',
    ' "sources":["<lightest sources that yield the signals, ranked>"],',
    ' "pitchFormula":"<frame the signal as urgency, with {slots} for the numbers>",',
    ' "confidence":<0..1>, "reasoning":"<one line>"}',
    "",
    "Rules: sources must come from the ladder; PREFER light. The wedge must be measurable (a number), not a vibe. The pitch formula must reference a proving signal.",
  ].join("\n");
}

export function normalizeWedge(obj: Record<string, unknown>): DiagnosticSpec {
  const sources = Array.isArray(obj.sources) ? obj.sources.map(String) : [];
  const usesHeavy = sources.some((s) => HEAVY_SOURCES.includes(s));
  const usesLight = sources.some((s) => LIGHT_SOURCES.includes(s));
  const sourceTier: DiagnosticSpec["sourceTier"] = usesHeavy ? (usesLight ? "mixed" : "heavy") : "light";
  const signals = Array.isArray(obj.provingSignals) ? obj.provingSignals : [];
  return {
    wedge: String(obj.wedge ?? ""),
    provingSignals: signals.map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { signal: String(o.signal ?? ""), meaning: String(o.meaning ?? ""), threshold: String(o.threshold ?? ""), source: String(o.source ?? "") };
    }),
    sources,
    sourceTier,
    pitchFormula: String(obj.pitchFormula ?? ""),
    confidence: typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0,
    reasoning: String(obj.reasoning ?? ""),
  };
}

export function parseWedge(raw: string): DiagnosticSpec | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) return null;
  try { return normalizeWedge(JSON.parse(s.slice(a, b + 1))); } catch { return null; }
}

/** Server-side wedge generation — runs ONLY if ANTHROPIC_API_KEY is set (null otherwise). */
export async function findWedgeLlm(brand: BrandForWedge): Promise<DiagnosticSpec | null> {
  const obj = await llmJson<Record<string, unknown>>(buildWedgePrompt(brand), { maxTokens: 800 });
  if (!obj) return null;
  return normalizeWedge(obj);
}
