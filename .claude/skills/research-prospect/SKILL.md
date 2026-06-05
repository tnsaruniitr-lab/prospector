---
name: research-prospect
description: Deep-research one prospect domain into a dossier. Runs a FIXED flow over the website (rendered AEO/SEO audit), SEMrush (competitive + AI visibility), and LinkedIn (founder + 2nd decision-maker, verified), then synthesizes top-3 problems/fixes and persists to Postgres. Trigger when asked to "research", "build a dossier for", "prospect", or "deep-research" a domain or business.
---

# Research a prospect → dossier

## Code references
Extractors: `src/browser/*.js` | Synthesis: `src/synthesis.ts` | Grading: `src/grading.ts`
Relevance: `src/relevance-v2.ts` | Storage: `src/storage.ts` | Persist: `src/record-dossier.ts`
Research Plan: `src/research-plan.ts` | Personas: `src/personas.ts` | Queue: `src/queue.ts`

Follow these stages **in order** for the given domain. Each stage has a fixed
procedure and a validation gate. The deterministic extractors live in
`src/browser/*.js`; synthesis + persistence are code in `src/`.

## Stage −1 — Read the Research Plan  (v2 — if `research-plan.json` exists)

Before anything else, check for `research-plan.json` in the project root. **If it
exists, it overrides the fixed flow** — run ONLY the sources/signals it enables:

- `researchSources[]` — for each entry with `enabled !== false`, run that source's
  browser recipe (semrush_ai, semrush_seo, onpage_audit, pagespeed, google_maps,
  linkedin_company, or `custom`). **Skip any source the plan disabled** — e.g. a
  `web_redesign` plan runs PageSpeed + audit and does NOT run the SEMrush AI module.
- `custom` source → read its `{ site, instructions }` and follow the instructions in
  the browser with judgment; record findings under `customFindings`.
- `signals[]` per source — extract exactly those facts (or note thin/blocked/not-found).
- `contactSource.type` — use `linkedin` or `apollo_browser` (logged-in session, **no
  API key**) or skip if `manual`.
- Validate with the **plan-aware gate** (`src/plan-gate.ts` → `assertPlanComplete`),
  which demands only enabled sources — NOT the hardcoded SEMrush+LinkedIn gate.
- Score relevance with `scoreRelevanceV2()` (`src/relevance-v2.ts`) using the plan's
  `sellerPersona` (`src/personas.ts`).

If there is **no** `research-plan.json`, fall back to the fixed flow below (v1 default:
SEMrush AI + LinkedIn for the AEO use case).

**Golden rule: never fabricate.** If a value isn't found, record `not found` /
`thin` / `not public` and continue. An email derived from a pattern is
`valid_domain` (domain accepts mail), NEVER `valid_mailbox`. A LinkedIn URL is
only `verified` when the profile's name AND current company match the prospect.

**Hard gate: never call a website-only result an audit for outreach.** A researched
dossier must include both browser passes:
- SEMrush browser pass: overview metrics, AI visibility split, competitors/category
  context, or an explicit thin/no-data note.
- LinkedIn browser/person pass: founder/DM2 profile evidence, or an explicit
  not-public/not-found note.
`recordDossier()` enforces this through `src/research-gate.ts`; failed gates must
be completed, not worked around.

## Flagship playbook — AI-search visibility + lead conversion (persona `ai_search_visibility`)

This curated playbook diagnoses **two wedges** and pitches the sharper one:
- **Visibility wedge:** `ai_mentions`, `ai_delta_vs_leader`, `cited_pages`, `missing_schema`
  → *"{leader} gets {delta}× more AI mentions than {prospect} ({lm} vs {pm})"*
- **Lead-conversion wedge** (capture the traffic they earn): from the on-page audit +
  PageSpeed — `has_booking_link`, `has_clear_cta`, `has_lead_capture` (form/chat/WhatsApp),
  `shows_reviews`, `performance_score`. Set `conversion_gap` = which of these are missing.
  → *"You have {reviews} reviews + {traffic} visits but no {missing} — you're leaking the
  buyers you've earned."*

Draft BOTH, lead with the sharper per prospect; record both in the dossier. The combined
hook: *"invisible where buyers now search (AI) AND not converting the visitors you get."*

**AEO scaffold sources (what `scaffoldPlan("ai_search_visibility", …)` emits):**
- **Research:** `semrush_ai` (AI visibility + competitors/category leader), `onpage_audit`, `google_maps`, `pagespeed`.
- **Contacts — identity:** `linkedin` (verify founder + DM2; `contactSource.type`).
- **Contacts — verified email + direct phone:** **`apollo_browser`** (`contactSource.emailVerify`). Apollo
  (logged-in, no key) supplies a **mailbox-verified** founder/DM2 email + direct/mobile phone — the
  accurate path. Bare `first.last@` patterns are a labeled last resort (`emailStatus = valid_domain_guess`),
  never the default. Business email still comes free from the site crawl (`find-contacts`, Stage 3.1).

## Input
A domain (e.g. `altaderma.com`), optionally a business name + city.

## Stage 0 — Discovery  (only when given a CATEGORY + CITY, not a domain)
Produce the candidate list, then run Stages 1–5 per prospect. **Browser-first, no API key** —
uses your authenticated session, no `GOOGLE_MAPS_API_KEY`.
1. `navigate` to `https://www.google.com/maps/search/{category}+in+{city}`.
2. Inject `src/browser/maps-extract.js` → names + ratings + review counts. Maps does **not**
   expose websites in the list cards — that's expected; the website is resolved later, at
   research time (Stage 1.0), with a one-shot name search. Reviews alone rank the queue.
3. Store with `recordCandidates()` (`src/record-candidates.ts`) → `pending` prospects (the
   research queue), deduped by name+city. `gradeCandidate()` value-ranks them (reviews); work
   the high-value ones first. Process each pending row through Stages 1–5.
- *Optional headless fallback (only if a key is already set):* Google Places API
  (`src/places.ts`) returns websites inline. **Not required, not the default** — the browser
  path above is fully keyless and is the canonical flow.

## Stage 1 — On-page AEO/SEO audit  (browser)
0. **Resolve the website if unknown** (discovery seeds it `null`). Search `{name} {city}` and
   take the first *real business* domain — skip aggregators/directories (google, maps, facebook,
   instagram, tripadvisor, fresha, yelp, booking). Record it on the prospect. If there is no
   standalone site (only a directory/booking/hotel listing), set `audit.noOwnWebsite = true` and
   note it — that is itself a strong AEO/SEO finding, not a dead end.
1. `navigate` to `https://{domain}`.
2. Inject `src/browser/audit.js` with the javascript tool; capture the JSON.
3. **Validate:** if `title` is "Just a moment…" or `renderedWords < 120`, the page is
   challenge/SPA-walled — set `audit.blocked = true`, note it, continue.

Captures: hasLocalBusiness, hasPerson, hasFAQ, hasAggregateRating, schemaTypes,
renderedWords, images/imagesNoAlt, hasChatWidget, hasWhatsApp, hreflang, h1/h2,
title, metaDescLen.

## Stage 2 — SEMrush competitive + AI visibility  (browser — be logged into SEMrush)
**Required at full depth — do not skip the per-engine AI split or the competitors page.**
0. Determine the prospect's **primary country** from the business market (city/country,
   service area, or site country). Pick the country database (`us`, `de`, `ae`, `sa`,
   `tr`, etc.) and record both `competitive.primaryCountry` and
   `competitive.semrushDatabase`. Do not use Worldwide/default if primary-country data
   exists.
1. `navigate` to `https://www.semrush.com/analytics/overview/?db={database}&q={domain}&searchType=domain`.
2. Inject `src/browser/semrush-extract.js` (it self-waits for the SPA). One read returns
   the whole overview, including the **full AI Visibility split which lives on this page**:
   - **SEO:** `authority` (→ authorityScore) · organicTraffic (+ organicTrafficTrend %) · organicKeywords · backlinks · refDomains
   - **AI Visibility:** aiVisibilityScore · aiMentions · aiCitedPages · **aiChatgpt · aiOverview · aiMode · aiGemini** (per-engine mentions; they sum to aiMentions — a built-in sanity check).
3. `navigate` to `https://www.semrush.com/analytics/organic/competitors/?db={database}&q={domain}&searchType=domain`;
   inject `src/browser/semrush-competitors.js` → top 5 organic competitors (domain · Com.Level % · # keywords) → `competitive.competitors`.
4. **Category AI leader:** run step 1–2 for the top 2–3 competitor domains; record the one with
   the highest `aiVisibilityScore` (fallback: `aiMentions`) as
   `competitive.categoryAiLeader { domain, visibility, mentions, citedPages, aiChatgpt, aiOverview, aiMode, aiGemini }`.
   This powers the comparative hook and the CSV columns for strongest competitor + 1-2 comparisons.
5. **Validate:** every number must come from a labelled value on the page; if the per-engine
   split doesn't sum to aiMentions, re-read. If the overview shows "no data"/blank, set
   `competitive.thin = true` and note it — never guess.

## Stage 3 — Contacts: founder + 2nd decision-maker  (browser — logged into LinkedIn Premium)

**Honor the plan's contact requirements (v2).** If `research-plan.json` has
`contactChannels` / `requiredContacts`, capture channels in that ranked order and
treat `requiredContacts` as must-haves for the gate (the rest are nice-to-have).
Channels: founder_linkedin, founder_email, founder_phone, dm2, dm2_email,
dm2_phone, business_email, business_phone, instagram, whatsapp, booking_link.
- **founder_phone / dm2_phone** = direct/mobile → usually only via **Apollo (paid
  phone-reveal)**. If Apollo paid isn't available, record `not_public` honestly —
  never fabricate a number. Business phone (from the site) is free.
- Source order per channel: LinkedIn → Apollo (logged-in) → the plan's `custom`
  directory (if any) → site/Impressum. Stop once required channels are filled.
- A required channel that can't be found → explicit `not_public` note (gate-safe).

1. **Business email + site contacts — do NOT skip (this column was historically sparse).**
   Run `npx tsx src/find-contacts.ts <domain>` — it crawls /contact, /kontakt, **/impressum**,
   /about, /team and parses `mailto:` links + visible text, returning business_email,
   founder_email_candidate, phone, WhatsApp, socials, booking link, and people. Use its
   `business_email` for the `business_email` column and `founder_email_candidate` to seed the
   founder. If it returns no email, open the site's Impressum/Kontakt/Contact page in the browser
   and read the footer `mailto:` (deobfuscate `info [at] domain`). Last resort: the Google
   Business Profile listing. Only set business_email = null after all three fail (with a note) —
   never fabricate. Also capture WhatsApp (`wa.me`), Instagram, booking link here.
2. **Company People page:** `navigate` to `https://www.linkedin.com/company/{slug}/people/`
   (slug from the site's LinkedIn link, or a business-name search). Inject
   `src/browser/linkedin-people.js` → each employee's name + role + **`/in/` URL** (the URL
   is what lets `founder_linkedin`/`dm2_linkedin` populate — always capture it, not just the name).
   **Confirm it's the RIGHT company** — slugs collide across countries (e.g. a Berlin agency's
   guessed slug can resolve to an unrelated foreign company); match people's location/role to the
   prospect. If there's no valid company page, find each decision-maker by individual search.
   When a founder has no LinkedIn at all, the Impressum / Handelsregister / Creditreform is a valid
   verification source — record it in `source` (don't force a LinkedIn URL).
3. Identify:
   - **Founder / owner** — titles: founder, owner, CEO, medical/clinic director, managing partner, principal.
   - **DM2 (next-in-command)** — manager, operations, marketing director, co-founder, partner.
4. **Verify each:** `navigate` to the profile, `get_page_text`, confirm **name AND current
   company** match the prospect → set `linkedinVerified = true` only then. If a name has no
   company-page profile, search Google `"{name}" {business} {city}` → first `linkedin.com/in/`
   → verify the same way.
5. **Email for each named contact — accuracy ladder; set `emailStatus` honestly (never disguise a guess):**
   a. **Published** — if `find-contacts` (Stage 3.1) returned a personal address for this name
      (e.g. `vorname.nachname@firma.de` on the Impressum/team page), use it → `emailStatus = "published"`.
   b. **Apollo — verified (the AEO default; plan `contactSource.emailVerify = apollo_browser`).**
      Open Apollo in the logged-in browser (no key): `https://app.apollo.io/#/people` → search the
      person by name + company, or filter the company by domain → People tab. Read Apollo's email and
      its **email_status**: set `email` + `emailStatus = "apollo_verified"` (Apollo "Verified") or
      `"apollo_likely"` (Apollo "Guessed/Likely"). Apollo also reveals the **direct/mobile phone**
      on paid plans → `founder_phone` / `dm2_phone`.
   c. **Pattern guess — last resort only.** If a + b fail, call `completeContact({ domain })`; it
      derives the pattern, MX-verifies the domain, and labels it `emailStatus = "valid_domain_guess"`
      (kept in `emailCandidates`). The main `*_email` column must prefer a/b; **never relabel a guess
      as verified.**
6. **Validate:** ≥2 named decision-makers, OR an explicit "owner not public" note. Never invent a
   LinkedIn URL. `founder_email_status` / `dm2_email_status` MUST reflect reality —
   `published`/`apollo_verified` = safe to email; `valid_domain_guess` = unconfirmed, treat as a lead not a fact.

## Stage 4 — Synthesis  (code, deterministic — do NOT hand-write)
Call `synthesizeDiagnosis()` (`src/synthesis.ts`) with the Stage-1/2 signals. **Pass
`vertical`** (the playbook id: `med_spa`, `marketing_agency`, …) so the schema/role/FAQ
wording matches the industry (agency → Organization/ProfessionalService + founder/principal,
not MedicalBusiness/doctor). Derive `hasLocalBusiness` per vertical with
`hasBusinessSchema(schemaTypes, vertical)`. Pass the SEO-hygiene signals too
(`titleLen, metaDescLen, h1Count, noindex, hasCanonical, hasViewport`) so the SEO rules
fire, not just schema/AEO. Returns:
- `problems`/`fixes` — top-3 (the pitch), each badged hard / measured / comparative
- `weakPoints` — the FULL ranked AEO+SEO issue list (nothing detected is dropped)
- `hook` — the narrative opener
- **`subjectHeadline`** — the AI-visibility comparison (brand `aiMentions` vs the
  `categoryLeader`'s, both SEMrush-extracted) as an outreach subject line.

## Stage 5 — Persist  (code)
Assemble the `Dossier` object (identity + contacts + audit + competitive + synthesis).

Storage is configurable via the `STORAGE` env var:
- `STORAGE=local` (default, zero-setup): writes to `outputs/dossiers/<domain>.json` + `outputs/prospects.csv`
- `STORAGE=db`: persists to Railway Postgres (requires `DATABASE_URL`)
- `STORAGE=both`: both simultaneously

The skill calls `recordDossier()` (`src/record-dossier.ts`) which dispatches to the active adapter(s) automatically. Run `src/db-check.ts` only when `STORAGE=db` or `STORAGE=both`.

## Stage 6 — Grade  (code)
Run `gradeDossier()` / `src/grade-all.ts` → priority score (0-100) + tier A/B/C/D
from **Value × Opportunity × Reachability**, stored in `priority` + `grade_tier`.
"Who to reach out to" = `order by priority desc`. Unreachable or tiny prospects
grade low even with a great pitch.

## Report
Prospect persisted (id) · N verified decision-makers · lead offer · the #1 problem.
Render the dossier markdown with `renderDossier()` if asked.
