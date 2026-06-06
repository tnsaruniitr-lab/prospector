import type { Dossier, DossierContact } from "./dossier.js";

function text(d: Dossier) {
  const people = [d.contacts.founder, d.contacts.decisionMaker2, ...(d.contacts.others ?? [])]
    .filter(Boolean)
    .map((p) => `${p?.name ?? ""} ${p?.role ?? ""} ${p?.linkedin ?? ""} ${p?.source ?? ""}`)
    .join(" ");
  return `${d.notes ?? ""} ${d.researchedNote ?? ""} ${people}`.toLowerCase();
}

function filled(v: unknown) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function people(d: Dossier): DossierContact[] {
  return [d.contacts.founder, d.contacts.decisionMaker2, ...(d.contacts.others ?? [])]
    .filter((p): p is DossierContact => !!p);
}

/**
 * A prospect is not "researched" unless the browser pass happened.
 * The website audit alone is intentionally insufficient for outreach data.
 */
export function deepResearchGateIssues(d: Dossier): string[] {
  const issues: string[] = [];
  const notes = text(d);
  const cv = d.competitive;
  const ai = cv.aiVisibility;

  if (!filled(cv.primaryCountry) || !filled(cv.semrushDatabase)) {
    issues.push("missing primary-country SEMrush context: primaryCountry and semrushDatabase are required");
  }

  const hasSemrushMetrics =
    filled(cv.authorityScore) ||
    filled(cv.organicTraffic) ||
    filled(cv.organicKeywords) ||
    filled(cv.backlinks) ||
    filled(cv.refDomains) ||
    filled(ai?.mentions) ||
    filled(ai?.citedPages);
  const hasSemrushSource = /semrush/.test(notes);
  if (!hasSemrushMetrics || !hasSemrushSource) {
    issues.push("missing SEMrush browser pass: overview metrics and source note are required");
  }

  const hasCompetitivePass =
    (cv.competitors?.length ?? 0) > 0 ||
    !!cv.categoryAiLeader ||
    /competitor|competitive set thin|no data|thin/.test(notes);
  if (!hasCompetitivePass) {
    issues.push("missing SEMrush competitive pass: competitors, category AI leader, or explicit thin/no-data note required");
  }

  const ps = people(d);
  const explicitNotPublic =
    /owner not public|founder not public|not publicly findable|no public linkedin|linkedin genuinely not found|verified absent|0 linkedin|not found/.test(notes);
  const hasLinkedInEvidence =
    ps.some((p) => filled(p.linkedin)) ||
    /linkedin/.test(notes);
  if (!ps.length && !explicitNotPublic) {
    issues.push("missing LinkedIn/person pass: founder or DM2 required, or explicit owner-not-public note");
  }
  if (!hasLinkedInEvidence && !explicitNotPublic) {
    issues.push("missing LinkedIn browser pass: profile URL/evidence or explicit not-found result required");
  }

  // 2nd decision-maker (DM2) must be attempted, not silently skipped: require either
  // a second named contact, or an explicit "only the founder/owner is public" note.
  const secondNotAvailable =
    /only (the )?(founder|owner|one)|owner[- ]operated|solo (founder|owner|practitioner)|single (founder|owner|practitioner|contact)|no (second|2nd|other) (decision|contact|public|named)|2nd (decision-maker|contact) not|dm2 not|owner not|founder not/.test(notes);
  if (people(d).length < 2 && !secondNotAvailable && !explicitNotPublic) {
    issues.push("missing 2nd decision-maker: add a second named/verified contact (run the LinkedIn company People page), or an explicit 'only founder/owner public' note");
  }

  // ── CORRECTNESS checks (not just presence) ─────────────────────────────────
  // 1) A "verified" LinkedIn must carry company-confirming evidence in `source`
  //    (the company name, or the word confirmed/verified) — stops over-claiming.
  const companyToken = (d.name || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4)[0] || "";
  for (const p of people(d)) {
    if (p.linkedinVerified && filled(p.linkedin)) {
      const src = (p.source || "").toLowerCase();
      const confirmed = /confirm|verified|impressum|handelsregister/.test(src) || (companyToken && src.includes(companyToken));
      if (!confirmed) {
        issues.push(`correctness: ${p.name} is linkedinVerified=true but source shows no company-confirming evidence — set verified=false or confirm the profile names "${d.name}"`);
      }
    }
  }
  // 2) A categoryAiLeader claim needs ≥2 AI-checked competitors (rigor), or an
  //    explicit "category thin/wide-open" note — stops declaring a leader off one check.
  const aiCompChecked = cv.aiCompetitors?.length ?? 0;
  const categoryThin = /thin|wide open|wide-open|near-?(empty|absent)|category (is )?(empty|absent)|few competitors|nobody (is )?visible/.test(notes);
  if (cv.categoryAiLeader && aiCompChecked < 2 && !categoryThin) {
    issues.push("correctness: categoryAiLeader claim under-evidenced — AI-check ≥2 competitors (aiCompetitors) or add an explicit 'category thin/wide-open' note");
  }

  return issues;
}

export function assertDeepResearchComplete(d: Dossier) {
  const issues = deepResearchGateIssues(d);
  if (issues.length) {
    throw new Error(
      `Deep research gate failed for ${d.domain}: ${issues.join("; ")}. ` +
      "Do the browser SEMrush + LinkedIn pass before recording a researched dossier.",
    );
  }
}
