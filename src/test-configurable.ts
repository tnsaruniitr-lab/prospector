/**
 * Accuracy test suite for the configurable engine.
 * Run: npx tsx src/test-configurable.ts
 *
 * Clear, named test cases auditing:
 *   - Phase 0 schema (validation + no-keys guard)
 *   - Phase 1 scaffolding (persona → correct sources, generalization)
 *   - Relevance v2 (sweet-spot scale, composite capacity, disqualifiers,
 *     timing, persona weighting, reachability, tiers, rationale)
 *
 * Maps to the UATs in docs/configurable-sources-design.md.
 */

import { parseResearchPlan, safeParseResearchPlan, assertNoCredentials, ResearchPlanSchema } from "./research-plan.js";
import { scaffoldPlan, getPersona, PERSONAS } from "./personas.js";
import { scoreRelevanceV2, type RelevanceInput } from "./relevance-v2.js";

let passed = 0, failed = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ❌ ${name}  ${detail}`); }
}
function section(s: string) { console.log(`\n── ${s} ──`); }

const ai = getPersona("ai_search_visibility")!;
const web = getPersona("web_redesign")!;
const rec = getPersona("recruiting")!;

// ═══ PHASE 0 — schema ════════════════════════════════════════════════════════
section("Phase 0 — Research Plan schema");
{
  const plan = scaffoldPlan("ai_search_visibility", "med_spa", "Berlin");
  const v = safeParseResearchPlan(plan);
  check("scaffolded plan validates against schema", v.success, v.success ? "" : JSON.stringify(v.error.issues));

  let threw = false;
  try { assertNoCredentials({ sellerPersona: "x", apiKey: "sk-123" }); } catch { threw = true; }
  check("no-credentials guard throws on apiKey", threw);

  const empty = safeParseResearchPlan({ sellerPersona: "x", prospectVertical: "y", region: "z", researchSources: [], contactSource: { type: "linkedin" } });
  check("empty researchSources rejected", !empty.success);
}

// ═══ PHASE 1 — scaffolding + generalization ══════════════════════════════════
section("Phase 1 — Scaffolding (persona → sources)");
{
  const aiPlan = scaffoldPlan("ai_search_visibility", "med_spa", "Berlin");
  const aiTypes = aiPlan.researchSources.map(s => s.type);
  check("T1.1 AI-search → semrush_ai + onpage_audit + google_maps",
    aiTypes.includes("semrush_ai") && aiTypes.includes("onpage_audit") && aiTypes.includes("google_maps"),
    aiTypes.join(","));

  const webPlan = scaffoldPlan("web_redesign", "med_spa", "Berlin");
  const webTypes = webPlan.researchSources.map(s => s.type);
  check("T1.2 web_redesign → pagespeed + onpage_audit, NO semrush_ai (generalization)",
    webTypes.includes("pagespeed") && !webTypes.includes("semrush_ai"),
    webTypes.join(","));

  const recPlan = scaffoldPlan("recruiting", "med_spa", "Berlin");
  const recTypes = recPlan.researchSources.map(s => s.type);
  check("T1.3 recruiting → linkedin_company, NO semrush at all",
    recTypes.includes("linkedin_company") && !recTypes.some(t => t.startsWith("semrush")),
    recTypes.join(","));

  check("T1.4 same input, different persona → different source sets",
    JSON.stringify(aiTypes) !== JSON.stringify(webTypes));

  const fields = aiPlan.outputFields;
  check("T1.5 output fields derived + every field traces to a signal/identity/contact/synthesis",
    fields.length > 0 && fields.every(f => f.fromSignal && f.group));

  let threw = false;
  try { scaffoldPlan("nonexistent_persona", "x", "y"); } catch { threw = true; }
  check("T1.6 unknown persona throws", threw);
}

// ═══ RELEVANCE V2 — accuracy ═════════════════════════════════════════════════
section("Relevance v2 — accuracy");
{
  // T2.1 SWEET SPOT — ideal size scores higher on `scale` than too-big
  const idealSize: RelevanceInput = { vertical: "med_spa", hasWebsite: true, painGaps: 3, reviewCount: 200 };
  const tooBig: RelevanceInput = { vertical: "med_spa", hasWebsite: true, painGaps: 3, reviewCount: 100000 };
  const rIdeal = scoreRelevanceV2(idealSize, ai);
  const rBig = scoreRelevanceV2(tooBig, ai);
  check("T2.1 sweet-spot: ideal size scale > too-big scale (NOT bigger=better)",
    rIdeal.scale > rBig.scale, `ideal=${rIdeal.scale} big=${rBig.scale}`);

  // T2.2 COMPOSITE CAPACITY — richer proxies beat reviews alone
  const base: RelevanceInput = { vertical: "med_spa", hasWebsite: true, painGaps: 2, reviewCount: 100 };
  const rich: RelevanceInput = { ...base, runningAds: true, pricingTier: "premium", funding: "funded" };
  const rBase = scoreRelevanceV2(base, ai);
  const rRich = scoreRelevanceV2(rich, ai);
  check("T2.2 composite capacity: ads+premium+funded > reviews alone",
    rRich.capacity > rBase.capacity, `base=${rBase.capacity} rich=${rRich.capacity}`);

  // T2.3 DISQUALIFIER — no website kills it regardless of strong signals
  const noSite: RelevanceInput = { vertical: "med_spa", hasWebsite: false, painGaps: 4, reviewCount: 5000, verifiedFounder: true, founderEmail: true, runningAds: true };
  const rNoSite = scoreRelevanceV2(noSite, web);
  check("T2.3 disqualifier: no_website → not_relevant + score≤20 despite strong signals",
    rNoSite.tier === "not_relevant" && rNoSite.disqualified && rNoSite.score <= 20,
    `tier=${rNoSite.tier} score=${rNoSite.score}`);

  // T2.4 TIMING — triggers raise the score
  const noTrigger: RelevanceInput = { vertical: "med_spa", hasWebsite: true, painGaps: 2, reviewCount: 200, verifiedFounder: true };
  const withTrigger: RelevanceInput = { ...noTrigger, trafficDeclining: true, competitorDelta: 3 };
  const rNo = scoreRelevanceV2(noTrigger, ai);
  const rYes = scoreRelevanceV2(withTrigger, ai);
  check("T2.4 timing: 'why now' triggers raise timing AND total score",
    rYes.timing > rNo.timing && rYes.score > rNo.score,
    `timing ${rNo.timing}→${rYes.timing}, score ${rNo.score}→${rYes.score}`);

  // T2.5 PERSONA WEIGHTING — same input, different persona → different score
  const shared: RelevanceInput = { vertical: "med_spa", hasWebsite: true, painGaps: 3, reviewCount: 200, headcount: 50, hiring: true, verifiedFounder: true, founderEmail: true };
  const sAi = scoreRelevanceV2(shared, ai);
  const sRec = scoreRelevanceV2(shared, rec);
  check("T2.5 persona weighting: identical input → different score per persona",
    sAi.score !== sRec.score, `ai=${sAi.score} rec=${sRec.score}`);

  // T2.6 REACHABILITY — verified founder+email vs nothing
  const reachable = scoreRelevanceV2({ vertical: "med_spa", hasWebsite: true, painGaps: 2, verifiedFounder: true, founderEmail: true }, ai);
  const unreachable = scoreRelevanceV2({ vertical: "med_spa", hasWebsite: true, painGaps: 2 }, ai);
  check("T2.6 reachability: founder+email=100, none=10",
    reachable.reachable === 100 && unreachable.reachable === 10,
    `reach=${reachable.reachable} none=${unreachable.reachable}`);

  // T2.7 TIERS — strong → highly, weak → not, middling → moderate
  const strong = scoreRelevanceV2({ vertical: "med_spa", hasWebsite: true, painGaps: 4, reviewCount: 400, runningAds: true, pricingTier: "premium", verifiedFounder: true, founderEmail: true, trafficDeclining: true, competitorDelta: 3 }, ai);
  const weak = scoreRelevanceV2({ vertical: "med_spa", hasWebsite: true, painGaps: 0, reviewCount: 3 }, ai);
  check("T2.7a strong all-round prospect → highly_relevant", strong.tier === "highly_relevant", `score=${strong.score}`);
  check("T2.7b weak prospect → not_relevant", weak.tier === "not_relevant", `score=${weak.score}`);

  // T2.8 RATIONALE — non-empty, reflects tier
  check("T2.8 rationale present + names the tier",
    strong.rationale.includes("HIGHLY") && rNoSite.rationale.toLowerCase().includes("disqualified"),
    `"${strong.rationale}"`);

  // T2.9 already-dominant disqualifier
  const dominant = scoreRelevanceV2({ vertical: "med_spa", hasWebsite: true, painGaps: 1, reviewCount: 500, alreadyDominant: true }, ai);
  check("T2.9 already_ai_dominant → not_relevant (the thing you'd sell is done)",
    dominant.tier === "not_relevant" && dominant.disqualified);
}

// ═══ summary ═════════════════════════════════════════════════════════════════
// ═══ PHASE 2 — plan-aware gate ═══
section("Phase 2 — Plan-aware gate");
{
  const { checkPlanComplete } = await import("./plan-gate.js");

  // U2 — web_redesign plan (no SEMrush AI): dossier with audit+pagespeed + thin SEO note → PASSES
  const webPlan = scaffoldPlan("web_redesign", "med_spa", "Berlin");
  const webDossier = {
    audit: { schemaTypes: ["WebSite"], pagespeed: { performance_score: 38 } },
    competitive: { thin: true },
    contacts: { founder: { name: "x" } },
  };
  const gWeb = checkPlanComplete(webDossier, webPlan);
  check("T3.1 (U2) web plan, no SEMrush AI module → gate PASSES (demands only enabled)",
    gWeb.complete, `missing=${gWeb.missing.join(",")}`);

  // Gate FAILS when an enabled source is silently missing
  const aiPlan = scaffoldPlan("ai_search_visibility", "med_spa", "Berlin");
  const incomplete = { audit: { schemaTypes: ["WebSite"] }, competitive: null, contacts: { founder: { name: "x" } } };
  const gBad = checkPlanComplete(incomplete, aiPlan);
  check("T3.2 gate FAILS when enabled source (semrush_ai) silently missing",
    !gBad.complete && gBad.missing.some(m => m.includes("semrush_ai")), gBad.missing.join(","));

  // Noted absence (thin) accepted — golden rule
  const noted = { audit: { schemaTypes: ["WebSite"] }, competitive: { thin: true }, googleRating: 4.8, contacts: { founder: { name: "x" } } };
  check("T3.3 noted absence (competitive.thin) accepted (golden rule)",
    checkPlanComplete(noted, aiPlan).complete);

  // Contact: missing+no note → fail; explicit note → pass
  const noContact = { audit: { schemaTypes: ["x"] }, competitive: { thin: true }, googleRating: 4.8, contacts: null };
  check("T3.4 enabled contact missing + no note → gate FAILS", !checkPlanComplete(noContact, aiPlan).complete);
  const notedContact = { ...noContact, contacts: { ownerNotPublicNote: "no public owner" } };
  check("T3.5 explicit 'owner not public' note → gate PASSES", checkPlanComplete(notedContact, aiPlan).complete);

  // Disabled source NOT demanded
  const planDisabled = { ...aiPlan, researchSources: aiPlan.researchSources.map(s => s.type === "semrush_ai" ? { ...s, enabled: false } : s) };
  check("T3.6 disabled source NOT demanded by the gate",
    !checkPlanComplete(incomplete, planDisabled).missing.some(m => m.includes("semrush_ai")));
}

// ═══ Website-first onboarding — inference ════════════════════════════════════
section("Onboarding — infer persona from site text");
{
  const { inferPersonaFromText, extractSiteText } = await import("./brand-infer.js");

  const aeoSite = "We help clinics get cited by ChatGPT and Gemini — AEO and AI search visibility for service businesses.";
  check("T4.1 AEO copy → ai_search_visibility",
    inferPersonaFromText(aeoSite).personaId === "ai_search_visibility", inferPersonaFromText(aeoSite).personaId || "null");

  const webSite = "Award-winning website redesign and web development. Modern Webflow & WordPress sites that convert.";
  check("T4.2 web-design copy → web_redesign",
    inferPersonaFromText(webSite).personaId === "web_redesign", inferPersonaFromText(webSite).personaId || "null");

  const seoSite = "We grow your organic traffic — SEO, rankings, backlinks and link building that lasts.";
  check("T4.3 SEO copy → seo_services",
    inferPersonaFromText(seoSite).personaId === "seo_services", inferPersonaFromText(seoSite).personaId || "null");

  const recSite = "Talent acquisition and recruitment — we fill your open roles with vetted candidates fast.";
  check("T4.4 recruiting copy → recruiting",
    inferPersonaFromText(recSite).personaId === "recruiting", inferPersonaFromText(recSite).personaId || "null");

  const vague = "We help businesses grow and reach their full potential with our solutions.";
  const v = inferPersonaFromText(vague);
  check("T4.5 vague copy → null persona + low confidence (manual fallback)",
    v.personaId === null && v.confidence === 0, `persona=${v.personaId} conf=${v.confidence}`);

  const decisive = inferPersonaFromText(aeoSite);
  check("T4.6 decisive match → confidence > 0.5", decisive.confidence > 0.5, `conf=${decisive.confidence}`);

  const ex = extractSiteText("<title>AEO Studio</title><meta name='description' content='AI search visibility'><body>chatgpt gemini aeo</body>");
  check("T4.7 extractSiteText pulls title + description",
    ex.title === "AEO Studio" && ex.description === "AI search visibility");

  // word-boundary: "seo" must not match "seoul"
  check("T4.8 keyword boundary: 'Seoul travel agency' does NOT match seo_services",
    inferPersonaFromText("Seoul travel agency tours and holidays").personaId !== "seo_services");

  // CONFIDENCE GATE (the pemo.io bug): a single stray keyword must NOT auto-apply
  const fintech = inferPersonaFromText("Smart corporate cards & expense tracking in Dubai. We're hiring!");
  check("T4.9 single stray keyword ('hiring' on a fintech) → confident=false (no clobber)",
    fintech.confident === false, `persona=${fintech.personaId} top=${fintech.topScore} confident=${fintech.confident}`);
  check("T4.10 decisive multi-keyword match → confident=true",
    inferPersonaFromText(aeoSite).confident === true);

  // HTML entity decode
  const ent = extractSiteText("<title>Cards &amp; Expenses</title><meta name='description' content='spend &amp; track'>");
  check("T4.11 HTML entities decoded (&amp; → &)",
    ent.title === "Cards & Expenses" && ent.description === "spend & track", ent.title);
}

// ═══ LLM path (no-key) — prompt builder + tolerant parser ════════════════════
section("LLM path — extract prompt + parser");
{
  const { buildBrandExtractPrompt, parseBrandExtract } = await import("./brand-infer.js");

  const prompt = buildBrandExtractPrompt("pemo.io", { title: "Pemo", description: "corporate cards", text: "smart corporate cards and expense tracking" });
  check("T5.1 prompt grounds in scraped text + lists personas + forbids invention",
    prompt.includes("smart corporate cards") && prompt.includes("ai_search_visibility") && /never invent/i.test(prompt));
  check("T5.2 prompt has NO hardcoded vertical checklist (avoids priming)",
    !/nurse at home|IV drip|physiotherapy at home/i.test(prompt));

  // tolerant parsing
  const clean = parseBrandExtract('{"personaId":"seo_services","offer":"SEO","services":["seo","links"],"customerTypes":["smb"],"vertical":"agency","confidence":0.8,"reasoning":"x"}');
  check("T5.3 parses clean JSON + valid persona", clean?.personaId === "seo_services" && clean?.services.length === 2);

  const backticked = parseBrandExtract('```json\n{"personaId":"web_redesign","offer":"sites","services":[],"customerTypes":[],"vertical":"x","confidence":0.7,"reasoning":"y"}\n```');
  check("T5.4 strips ```json backticks", backticked?.personaId === "web_redesign");

  const prose = parseBrandExtract('Here is the result:\n{"personaId":null,"offer":"corporate cards","services":[],"customerTypes":[],"vertical":"fintech","confidence":0.2,"reasoning":"fits none"}\nHope that helps!');
  check("T5.5 extracts JSON from surrounding prose + null persona (pemo case)",
    prose?.personaId === null && prose?.vertical === "fintech");

  const badPersona = parseBrandExtract('{"personaId":"not_a_real_persona","offer":"x","confidence":0.9}');
  check("T5.6 invalid personaId → null (must be a real library persona)", badPersona?.personaId === null);

  check("T5.7 garbage → null", parseBrandExtract("not json at all") === null);
}

// ═══ summary ═══
console.log(`\n${"═".repeat(50)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed) { console.log(`FAILED: ${fails.join(", ")}`); process.exit(1); }
console.log("All accuracy checks passed ✅");
