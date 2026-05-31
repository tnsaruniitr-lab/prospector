# prospect-engine

Audit-led outbound for local-service ICPs. It **discovers** businesses by ICP + city (Google Places), **cheap-audits** each one's website for SEO/AEO pain using the existing `aeo-seo-auditor`, **qualifies** them (skip the no-budget bottom and the no-pain top), and emits a ranked, **hand-workable worklist** — every prospect pre-loaded with the audit-derived hook and a suggested opener.

This is the **Week-1 MVP**: source → deep browser research → dossier → rank. Outreach is high-touch and manual by design — the goal is to validate that *the audit is a hook that gets replies* before building any automation. Sending/sequence tracking can come after the lead/contact quality is proven.

**Non-negotiable quality gate:** no prospect is outreach-ready from a website audit alone. Every researched dossier must include the browser SEMrush pass (primary-country database, overview + AI visibility + competitor/category context) and the browser LinkedIn/person pass (founder/DM2 verified, or an explicit not-public/not-found note). `recordDossier()` enforces this.

## Pipeline

```
source     Places (category × city)          → prospect.prospects
audit      low-level quick audit only         → blocked by default; debugging only
enrich     low-level site crawl only          → not outreach-ready without browser pass
worklist   legacy quick worklist              → not final outreach data
dossier    browser research + SEMrush + LI    → outputs/prospect-dossier*.csv + markdown briefs
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
pnpm dossier:csv --input outputs/medspa-sample-10-enriched.csv \
  --output outputs/medspa-sample-10-dossier.csv
pnpm db:export                                         # export researched dossiers from DB

pnpm playbooks                                          # list ICP playbooks
```

Flags: `--seed "<query>"` (override search seeds), `--max-pages N` (≤3, 20 results each), `--limit N`, `--force` for re-enrichment.

## First vertical/cities

Recommended first pass: discover candidates by geo/category, then work the highest-value
rows through the browser dossier flow one by one. Do not use the legacy quick pipeline for
outreach data.

The quick CSV export includes priority, AEO/SEO issue scores, website/social/contact-form channels, best contact, LinkedIn profile URL when found, source/confidence, and the top audit hook. It is blocked by default for normal runs because it is not browser Semrush + LinkedIn complete; pass `--allow-quick` only for debugging.

The dossier export is the richer contract for outreach research: 80+ columns covering identity, contacts, founder/DM2, rendered audit fields, primary-country SEMrush SEO + AI visibility, strongest AI competitor/category leader, a second comparison competitor, top AEO problems/fixes, hook, pitch, priority note, status, and sources. `pnpm dossier:csv` converts a quick enriched CSV into that shape and marks rows `partial`; `pnpm db:export` exports fully researched Postgres dossiers as `outputs/prospect-dossier-from-db.csv`.

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
