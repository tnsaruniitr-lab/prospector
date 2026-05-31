# prospect-engine

Audit-led outbound for local-service ICPs. It **discovers** businesses by ICP + city (Google Places), **cheap-audits** each one's website for SEO/AEO pain using the existing `aeo-seo-auditor`, **qualifies** them (skip the no-budget bottom and the no-pain top), and emits a ranked, **hand-workable worklist** — every prospect pre-loaded with the audit-derived hook and a suggested opener.

This is the **Week-1 MVP**: source → audit → enrich contacts → rank → worklist. Outreach is high-touch and manual by design — the goal is to validate that *the audit is a hook that gets replies* before building any automation. Sending/sequence tracking can come after the lead/contact quality is proven.

## Pipeline

```
source     Places (category × city)          → prospect.prospects
audit      aeo-seo-auditor (cheap, batched)  → prospect.audits + qual_status
enrich     site crawl + optional Apollo       → prospect.contacts + channel fields
worklist   priority + contacts + audit hook   → outputs/<playbook>-<city>-worklist.{md,csv}
```

## Stack

TypeScript (ESM, `tsx`) · **Railway Postgres** via the `pg` driver · a dedicated `prospect` schema · Google Places API (New) · optional Apollo People API · the sibling `aeo-seo-auditor/` (Python/bash) as the audit engine.

## Setup

1. **Provision the database** — in Railway: **New → Database → PostgreSQL**. Open the Postgres service → *Connect* → copy the **public** connection URL (`…proxy.rlwy.net`).
2. **Configure + install:**
   ```bash
   cd prospect-engine
   pnpm install
   cp .env.example .env          # paste DATABASE_URL + GOOGLE_MAPS_API_KEY
   ```
3. **Create the tables:**
   ```bash
   pnpm migrate                  # applies all idempotent migrations to Railway
   ```

Requirements: Node 20+, `python3` and `curl` (used by the auditor), and the sibling `aeo-seo-auditor/` checkout (auto-detected; override with `AUDITOR_SCRIPT`).

## Usage

```bash
pnpm source   --playbook roofing --city "Austin, TX"   # discover + store
pnpm audit    --playbook roofing                       # cheap-audit + qualify
pnpm enrich   --playbook roofing --city "Austin, TX"   # site crawl + optional Apollo
pnpm worklist --playbook roofing --city "Austin, TX"   # export ranked worklist
pnpm pipeline --playbook med_spa --cities "Berlin, Germany;New York, NY"

pnpm playbooks                                          # list ICP playbooks
```

Flags: `--seed "<query>"` (override search seeds), `--max-pages N` (≤3, 20 results each), `--limit N`, `--force` for re-enrichment.

## First vertical/cities

Recommended first pass:

```bash
pnpm pipeline --playbook med_spa \
  --cities "Berlin, Germany;New York, NY;Dubai, UAE;Riyadh, Saudi Arabia;Miami, FL" \
  --limit 500
```

The CSV export includes priority, AEO/SEO issue scores, website/social/contact-form channels, best contact, LinkedIn profile URL when found, source/confidence, and the top audit hook.

## How qualification works

A prospect is **qualified** only if it has a website, has enough reviews to look active (per-playbook `minReviews`), and scores above `minPain`. That deliberately drops:

- **no website / too few reviews** → no budget, can't act (web motion); no-website businesses are tagged `no_website` for a separate phone/walk-in motion.
- **pain below threshold** → the site is too clean to have a wedge.

`pain_score` (0–100) weights audit **fails** heavily, **warns** lightly, adds **critical issues**, and penalizes **client-side-rendered** sites (invisible to crawlers + AI assistants).

## Playbooks

Vertical config lives in `src/playbooks.ts` — search seeds, qualify thresholds, channel priority, owner-discovery sources, Apollo/contact title terms, and the opener template. Ships with `roofing`, `dental_implants`, `med_spa`, `law_firm`, and `private_clinic`.

## Data model (`prospect` schema)

`campaigns` (a sourcing run) · `prospects` (businesses + discovered channels) · `audits` (cheap/deep results + pain + hook) · `contacts` (people/contact enrichment) · `outreach` (touches, next phase).

## Not in the MVP (next phases)

- **Outreach**: email sequencer (compliant, separate domain) + LinkedIn/IG as queued *human* tasks (never auto-DM — ToS/ban risk) → `prospect.outreach`.
- **Deep audit**: run the 97-check `website-seo-aeo-auditor` skill on the top of the worklist before contact.
- **Deploy**: the CLI can run as a Railway cron/worker in the same project once you want it scheduled.
