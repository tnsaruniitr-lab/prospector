---
name: research-prospect
description: Deep-research one prospect domain into a dossier. Runs a FIXED flow over the website (rendered AEO/SEO audit), SEMrush (competitive + AI visibility), and LinkedIn (founder + 2nd decision-maker, verified), then synthesizes top-3 problems/fixes and persists to Postgres. Trigger when asked to "research", "build a dossier for", "prospect", or "deep-research" a domain or business.
---

# Research a prospect → dossier

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
1. From the site (Stage 1 + its About / Team / Contact / Impressum pages) capture:
   business email, phone, WhatsApp (`wa.me`), Instagram, booking link.
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
5. **Complete each** named contact: call `completeContact()` (`src/contact-complete.ts`) with
   `{ domain }` → derives the email pattern + MX-verifies the domain.
6. **Validate:** ≥2 named decision-makers, OR an explicit "owner not public" note. Never invent
   a LinkedIn URL; never mark an unverified email as confirmed.

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
Assemble the `Dossier` object (identity + contacts + audit + competitive + synthesis)
and call `recordDossier()` (`src/record-dossier.ts`) → upserts into Railway Postgres
(deduped by domain). Run `src/db-check.ts` to confirm the row + contact count.

## Stage 6 — Grade  (code)
Run `gradeDossier()` / `src/grade-all.ts` → priority score (0-100) + tier A/B/C/D
from **Value × Opportunity × Reachability**, stored in `priority` + `grade_tier`.
"Who to reach out to" = `order by priority desc`. Unreachable or tiny prospects
grade low even with a great pitch.

## Report
Prospect persisted (id) · N verified decision-makers · lead offer · the #1 problem.
Render the dossier markdown with `renderDossier()` if asked.
