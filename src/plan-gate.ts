/**
 * Plan-aware research gate.
 *
 * Spec: docs/configurable-sources-design.md (Phase 2).
 *
 * The v1 gate (research-gate.ts) hardcodes "must have SEMrush + LinkedIn." That's
 * wrong once sources are configurable — a web-redesign plan with SEMrush off would
 * fail a gate that demands SEMrush.
 *
 * This gate demands ONLY what the plan enabled. For each enabled source, the
 * dossier must have the corresponding data OR an explicit "thin/blocked/not-found"
 * note (golden rule: a noted absence is acceptable; a silent gap is not).
 */

import type { ResearchPlan, ResearchSourceType } from "./research-plan.js";
import { activeResearchSources } from "./research-plan.js";

// Loose shape — works on the real Dossier or a partial test object.
export interface GateDossier {
  competitive?: {
    authorityScore?: unknown; organicTraffic?: unknown; thin?: boolean;
    aiVisibility?: { mentions?: unknown } | null;
    headcount?: unknown;
  } | null;
  audit?: {
    schemaTypes?: unknown; blocked?: boolean; noOwnWebsite?: boolean;
    pagespeed?: unknown;
  } | null;
  googleRating?: unknown;
  googleReviews?: unknown;
  customFindings?: unknown;
  contacts?: {
    founder?: unknown; decisionMaker2?: unknown; ownerNotPublicNote?: unknown;
  } | null;
}

const present = (v: unknown) => v != null && v !== "";

/** Is the data for one source present (or an explicit note)? */
function sourceSatisfied(d: GateDossier, type: ResearchSourceType): boolean {
  switch (type) {
    case "semrush_ai":
      return present(d.competitive?.aiVisibility?.mentions) || d.competitive?.thin === true;
    case "semrush_seo":
      return present(d.competitive?.authorityScore) || present(d.competitive?.organicTraffic) || d.competitive?.thin === true;
    case "onpage_audit":
      return present(d.audit?.schemaTypes) || d.audit?.blocked === true || d.audit?.noOwnWebsite === true;
    case "pagespeed":
      return present(d.audit?.pagespeed);
    case "google_maps":
      return present(d.googleRating) || present(d.googleReviews);
    case "linkedin_company":
      return present(d.competitive?.headcount) || present(d.contacts);
    case "custom":
      return present(d.customFindings);
    default:
      return false;
  }
}

export interface GateResult {
  complete: boolean;
  missing: string[];
}

/** Check a dossier against its plan. Returns what's missing (nothing demanded that the plan didn't enable). */
export function checkPlanComplete(d: GateDossier, plan: ResearchPlan): GateResult {
  const missing: string[] = [];

  // Only enabled research sources are demanded.
  for (const src of activeResearchSources(plan)) {
    if (!sourceSatisfied(d, src.type)) missing.push(`research:${src.type}`);
  }

  // Contact source, if enabled, needs a contact OR an explicit not-public note.
  if (plan.contactSource.enabled && plan.contactSource.type !== "manual") {
    const c = d.contacts;
    const ok = present(c?.founder) || present(c?.decisionMaker2) || present(c?.ownerNotPublicNote);
    if (!ok) missing.push(`contact:${plan.contactSource.type}`);
  }

  return { complete: missing.length === 0, missing };
}

/** Throwing variant for the persist path. */
export function assertPlanComplete(d: GateDossier, plan: ResearchPlan): void {
  const r = checkPlanComplete(d, plan);
  if (!r.complete) {
    throw new Error(
      `Research incomplete for this plan — missing: ${r.missing.join(", ")}. ` +
        `Each enabled source needs its data or an explicit thin/blocked/not-found note. ` +
        `(Disabled sources are NOT required.)`,
    );
  }
}
