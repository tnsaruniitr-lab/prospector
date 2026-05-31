---
name: research-prospect
description: Deep-research one prospect domain into a dossier. Runs a FIXED flow over the website (rendered AEO/SEO audit), SEMrush (competitive + AI visibility), and LinkedIn (founder + 2nd decision-maker, verified), then synthesizes top-3 problems/fixes and persists to Postgres. Trigger when asked to "research", "build a dossier for", "prospect", or "deep-research" a domain or business.
---

# Research a prospect → dossier

Follow these stages **in order** for the given domain. Each stage has a fixed
procedure and a validation gate. The deterministic extractors live in
`src/browser/*.js`; synthesis + persistence are code in `src/`.

**Golden rule: never fabricate.** If a value isn't found, record `not found` /
`thin` / `not public` and continue. An email derived from a pattern is
`valid_domain` (domain accepts mail), NEVER `valid_mailbox`. A LinkedIn URL is
only `verified` when the profile's name AND current company match the prospect.

## Input
A domain (e.g. `altaderma.com`), optionally a business name + city.

## Stage 0 — Discovery  (only when given a CATEGORY + CITY, not a domain)
Produce the candidate list, then run Stages 1–5 per prospect.
- **Preferred (headless, reliable):** Google Places API (`src/places.ts`) → name · website · rating · review_count. Needs `GOOGLE_MAPS_API_KEY`.
- **No-key (browser):** `navigate` to `https://www.google.com/maps/search/{category}+in+{city}`; inject `src/browser/maps-extract.js` → names + ratings + reviews (websites need a per-card click or a Google search per name).
- Store with `recordCandidates()` (`src/record-candidates.ts`) → `pending` prospects (the research queue). Process each pending row through Stages 1–5.

## Stage 1 — On-page AEO/SEO audit  (browser)
1. `navigate` to `https://{domain}`.
2. Inject `src/browser/audit.js` with the javascript tool; capture the JSON.
3. **Validate:** if `title` is "Just a moment…" or `renderedWords < 120`, the page is
   challenge/SPA-walled — set `audit.blocked = true`, note it, continue.

Captures: hasLocalBusiness, hasPerson, hasFAQ, hasAggregateRating, schemaTypes,
renderedWords, images/imagesNoAlt, hasChatWidget, hasWhatsApp, hreflang, h1/h2,
title, metaDescLen.

## Stage 2 — SEMrush competitive + AI visibility  (browser — be logged into SEMrush)
1. `navigate` to `https://www.semrush.com/analytics/overview/?q={domain}&searchType=domain`.
   Wait ~3s for the SPA, then `get_page_text` (or inject `src/browser/semrush-extract.js`).
2. Extract **by label** (the number follows the label on the next line):
   - **SEO:** Authority Score · Organic Traffic (+ trend %) · Organic Keywords · Backlinks · Ref. Domains
   - **AI Visibility:** Mentions · Cited Pages · ChatGPT · AI Overview · AI Mode · Gemini
3. `navigate` to `https://www.semrush.com/analytics/organic/competitors/?q={domain}&searchType=domain`;
   extract the top 5 organic competitors (domain · Com.Level % · # keywords).
4. **Category AI leader:** repeat steps 1–2 for the top 2–3 competitor domains; record the
   one with the highest AI **Mentions** as `categoryLeader { domain, mentions, citedPages }`.
5. **Validate:** every number must come from a labelled value on the page. If the overview
   shows "no data"/blank, set `competitive.thin = true` and note it — do not guess.

## Stage 3 — Contacts: founder + 2nd decision-maker  (browser — logged into LinkedIn Premium)
1. From the site (Stage 1 + its About / Team / Contact / Impressum pages) capture:
   business email, phone, WhatsApp (`wa.me`), Instagram, booking link.
2. **Company People page:** `navigate` to `https://www.linkedin.com/company/{slug}/people/`
   (slug from the site's LinkedIn link, or a business-name search). Inject
   `src/browser/linkedin-extract.js` → each person's name + `/in/` URL.
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
Call `synthesizeDiagnosis()` (`src/synthesis.ts`) with the Stage-1/2 signals →
top-3 problems (each badged hard / measured / comparative) + top-3 fixes + the hook.

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
