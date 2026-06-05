/**
 * Research Plan — the contract between the webpage (configurator) and the skill
 * (executor). The webpage BUILDS one of these; the bridge CARRIES it; the skill
 * READS it and runs exactly the sources/signals it names.
 *
 * Spec: docs/configurable-sources-design.md (Phase 0 — the critical path).
 *
 * NON-NEGOTIABLE: browser-only, NEVER API keys. Every source is a browser recipe
 * (the user is logged into the tool in Chrome → navigate → extract). This schema
 * carries NO secrets — there is intentionally no apiKey field anywhere.
 */

import { z } from "zod";

// ── Source types (all browser-driven) ──────────────────────────────────────
// Each maps to a browser-adapter recipe in the skill (navigate + inject + read).
export const ResearchSourceType = z.enum([
  "semrush_ai",     // SEMrush AI visibility module (mentions, delta, per-engine)
  "semrush_seo",    // SEMrush SEO (authority, traffic, keywords, backlinks)
  "onpage_audit",   // rendered on-page AEO/SEO audit (schema, words, headings)
  "pagespeed",      // PageSpeed/Lighthouse (public — no login)
  "google_maps",    // Maps listing (rating, reviews, locations)
  "linkedin_company", // company headcount / hiring signals
  "custom",         // user-supplied { site, instructions } — Claude executes with judgment
]);
export type ResearchSourceType = z.infer<typeof ResearchSourceType>;

export const ContactSourceType = z.enum([
  "linkedin",        // browser LinkedIn People page + profile verify (default)
  "apollo_browser",  // browser Apollo (logged-in session) — NOT the API, no key
  "manual",          // skip automated contact finding
]);
export type ContactSourceType = z.infer<typeof ContactSourceType>;

// ── A signal = one fact to extract from a source ───────────────────────────
export const SignalSchema = z.object({
  key: z.string(),                       // e.g. "ai_delta_vs_leader"
  meaning: z.string(),                   // human description of what it tells you
  painThreshold: z.string().optional(),  // e.g. "pain if leader > 2x their mentions"
  pitchWeight: z.number().min(0).max(10).default(5), // orders the outreach pitch
});
export type Signal = z.infer<typeof SignalSchema>;

// ── A research source = a browser adapter + the signals to pull from it ────
export const ResearchSourceSchema = z.object({
  type: ResearchSourceType,
  enabled: z.boolean().default(true),
  pinned: z.boolean().default(false),    // user-locked: AI must keep/skip it
  signals: z.array(SignalSchema).default([]),
  // Only for type === "custom" — the manual path. NO credentials, just a target + instructions.
  custom: z
    .object({
      site: z.string().url().optional(),
      instructions: z.string(),          // free-text; Claude follows with judgment
    })
    .optional(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

// ── Contact source (browser-only, no key) ──────────────────────────────────
export const ContactSourceSchema = z.object({
  type: ContactSourceType,
  enabled: z.boolean().default(true),
  // Verified-email enrichment for named contacts (founder/DM2). For AEO this is
  // apollo_browser — a mailbox-verified email, not a pattern guess. LinkedIn stays
  // the identity-verify source; Apollo supplies the confirmed email + direct phone.
  emailVerify: ContactSourceType.optional(),
});
export type ContactSource = z.infer<typeof ContactSourceSchema>;

// ── Output field = the "outcome contract": what the dossier will contain ───
// Every output field must trace back to a gathered signal (no orphan/fabricated
// fields). Group is for display (Identity / Pain / Worth-it / Contact / Pitch).
export const OutputFieldSchema = z.object({
  key: z.string(),                       // e.g. "ai_delta_vs_leader"
  label: z.string(),                     // display name
  group: z.enum(["identity", "pain", "capacity", "contact", "pitch"]),
  fromSignal: z.string(),                // the signal key this field is derived from
});
export type OutputField = z.infer<typeof OutputFieldSchema>;

// ── The full plan ───────────────────────────────────────────────────────────
export const ResearchPlanSchema = z.object({
  // identity of the run
  sellerPersona: z.string(),             // persona id (library lives in Phase 1)
  prospectVertical: z.string(),          // target type, e.g. "med_spa"
  region: z.string(),                    // "Berlin, Germany"

  // the three confirmable stacks
  researchSources: z.array(ResearchSourceSchema).min(1),
  contactSource: ContactSourceSchema,
  outputFields: z.array(OutputFieldSchema).default([]),

  // provenance: was this AI-scaffolded then user-edited? (audit trail)
  scaffoldedByAi: z.boolean().default(false),
  editedByUser: z.boolean().default(false),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

// ── Validation + helpers ────────────────────────────────────────────────────

/** Parse + validate an untrusted plan (from the webpage / bridge). Throws on invalid. */
export function parseResearchPlan(input: unknown): ResearchPlan {
  return ResearchPlanSchema.parse(input);
}

/** Safe variant — returns {success, data|error} instead of throwing. */
export function safeParseResearchPlan(input: unknown) {
  return ResearchPlanSchema.safeParse(input);
}

/** The sources the skill will actually run (enabled only), in order. */
export function activeResearchSources(plan: ResearchPlan): ResearchSource[] {
  return plan.researchSources.filter((s) => s.enabled);
}

/** Guard the golden rule at the schema layer: a key must never appear in a plan. */
export function assertNoCredentials(input: unknown): void {
  const json = JSON.stringify(input ?? {}).toLowerCase();
  for (const banned of ["apikey", "api_key", "secret", "token", "password", "bearer"]) {
    if (json.includes(banned)) {
      throw new Error(
        `Research Plan must be browser-only — found a credential-like field ("${banned}"). ` +
          `Sources use the user's logged-in Chrome sessions, never API keys.`,
      );
    }
  }
}
