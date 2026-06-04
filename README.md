# Prospect Engine

**Audit-led outbound prospecting tool.** Discovers local businesses or agencies by ICP + city using your browser (no paid discovery APIs), runs a deep AEO/SEO audit + SEMrush AI-visibility check + LinkedIn founder research, synthesises the top-3 problems/fixes into a personalised pitch, and stores everything in a Railway Postgres DB.

**Browser-first, zero API keys for data.** All discovery and research uses your authenticated SEMrush + LinkedIn sessions via the Claude in Chrome MCP — no Places API, no Apollo, no data subscriptions beyond what you already have.

---

## What it produces

Per prospect (one row in the DB, one row in the CSV):

| Layer | What you get |
|---|---|
| Identity | Name, domain, category, geo, Google rating + reviews |
| On-page audit | Schema gaps, H1/H2, words, images, chat widget — rendered (post-JS) |
| SEMrush (country DB) | Authority, organic traffic + trend, keywords, backlinks, full AI split (ChatGPT/Gemini/AI-Overview/AI-Mode), cited pages, top competitors, category AI leader |
| Contacts | Founder (name, role, LinkedIn ✅ verified, derived email MX-checked), DM2 (same), business phone/email |
| Synthesis | Top-3 AEO/SEO problems + fixes (code-generated, evidence-badged), hook, full audit gap list, **subject headline** (AI-visibility comparison vs category leader) |
| Grade | A/B/C/D from Value × Opportunity × Reachability |
| Relevance | highly_relevant / moderate / not_relevant + value prop + competitive context |

105 CSV columns total. Everything is also queryable via `pnpm relevance` (ranked worklist) and `pnpm grade` (commercial grade).

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** + **pnpm** | `npm i -g pnpm` |
| **Railway Postgres DB** | Free tier works. See setup below. |
| **Claude Code** | The CLI (`claude`) — this is how the research agent runs |
| **Claude in Chrome MCP extension** | Installed in Chrome. Links Claude to your browser tabs. |
| **SEMrush account** | Any paid plan. Must be logged in in Chrome. |
| **LinkedIn Premium** | Must be logged in in Chrome. |

You do **not** need: Google Maps API key, Apollo API key, Hunter API key, or any other data subscription.

---

## Setup (one-time)

### 1. Clone and install
```bash
git clone https://github.com/tnsaruniitr-lab/prospector.git
cd prospector
pnpm install
```

### 2. Create the Railway database
1. Go to [railway.app](https://railway.app) → New Project → **Add PostgreSQL**
2. Click the Postgres service → **Connect** tab
3. Copy the **Public** connection URL (format: `postgresql://postgres:PASSWORD@xxx.proxy.rlwy.net:PORT/railway`)

### 3. Create your .env
```bash
cp .env.example .env          # if .env.example exists, otherwise:
echo 'DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@xxx.proxy.rlwy.net:PORT/railway' > .env
```

### 4. Run migrations (creates all tables)
```bash
pnpm migrate
```

This creates the `prospect` schema with tables: `prospects`, `contacts`, `audits`, `campaigns`, `outreach`.

### 5. Verify Railway connection
```bash
npx tsx src/db-check.ts
```
Should print "ALL PROSPECTS" (empty table is fine).

### 6. Install Claude in Chrome MCP
Follow the instructions at [claude.ai/chrome-extension](https://claude.ai/chrome-extension) to install the browser MCP extension. Once installed, open Chrome and click **Connect** in the extension — you should see it pair with Claude Code.

> **Important:** Make sure SEMrush and LinkedIn are open and logged in as separate tabs in the same Chrome window before running research.

---

## How to run research (the full flow)

Everything runs through **Claude Code** using the codified `research-prospect` skill. The skill drives your browser automatically.

### Option A — Research a specific domain you already know
```
/research-prospect altaderma.com, Dubai
```

### Option B — Discover + research a category in a city
```
/research-prospect category: med spa, city: Miami, FL
```
or
```
/research-prospect category: marketing agency, city: Berlin, Germany
```

Claude will:
1. **Stage 0** — Navigate Google Maps, extract candidates by name + reviews, queue them in the DB
2. **Stage 1** — Open each prospect's website, run the rendered AEO/SEO audit
3. **Stage 2** — Open SEMrush in your browser (`db=` set to the correct country), extract full AI visibility + competitors
4. **Stage 3** — Open LinkedIn, find founder + DM2 (People page), verify each profile, derive emails
5. **Stage 4** — Run `synthesizeDiagnosis()` in code (deterministic, no LLM per prospect)
6. **Stage 5** — Persist to your Railway DB via `recordDossier()`
7. **Stage 6** — Grade + relevance score

> **Research gate:** `recordDossier()` will throw if the SEMrush pass OR LinkedIn pass is missing. Every stored dossier is guaranteed to have both.

---

## See your results

### Quick ranked worklist (terminal)
```bash
pnpm relevance
```
Shows all researched prospects ordered by **highly_relevant → moderate → not_relevant**, then by commercial grade (A/B/C/D), with the verdict, value prop, and competitive context per prospect.

### Full 105-column CSV
```bash
pnpm db:export          # regenerates outputs/prospect-dossier-from-db.csv from Railway
```
Open in Excel / Numbers / Google Sheets.

### Railway Data tab
1. Open your Railway project → **Data** tab
2. **Switch the schema selector from `public` to `prospect`**
3. Click the `prospects` table

> Note: The flat columns show the queryable subset. The full data (all 105 fields) is in the `dossier` JSONB column — click any row to expand it.

### Grade all prospects
```bash
pnpm grade
```
Fills `grade_tier` (A/B/C/D) and `priority` (0–100) for every researched prospect.

---

## Playbooks (ICP verticals)

`src/playbooks.ts` defines the search seeds and qualify thresholds per vertical:

| ID | Label | Search seeds |
|---|---|---|
| `med_spa` | Med spas / Cosmetic clinics | med spa, botox, medical aesthetics clinic |
| `marketing_agency` | Marketing agencies | marketing agency, digital marketing agency, advertising agency |
| `dental_implants` | Dental implants / Orthodontics | dental implants, orthodontist, cosmetic dentist |
| `law_firm` | Law firms | personal injury lawyer, immigration lawyer, law firm |
| `private_clinic` | Private clinics / Cosmetic | private clinic, cosmetic clinic, chiropractor |
| `roofing` | Roofing / HVAC / Plumbing | roofing contractor, HVAC contractor, plumber |

---

## Two ways to store data

### 1. Railway DB (recommended, shared)
- Default — `recordDossier()` writes to the `DATABASE_URL` in your `.env`
- All teammates pointing at the same `DATABASE_URL` share the same prospect pool
- Railway free tier: 500MB, plenty for hundreds of prospects

### 2. Local Postgres (alternative)
Install Postgres locally:
```bash
brew install postgresql@16
brew services start postgresql@16
createdb prospect_engine
```
Then in `.env`:
```
DATABASE_URL=postgresql://localhost/prospect_engine
```
Run `pnpm migrate` and everything works the same — data stays on your machine.

---

## Tuning the relevance engine

`src/relevance.ts` exports `DEFAULT_ICP` — edit these fields to match your offer:

```ts
export const DEFAULT_ICP: IcpProfile = {
  sellerName: "your studio name",
  offer: "AEO / AI-search visibility ...",
  valueProp: "convert an established reputation into AI-search visibility",
  fixes: "add schema + Person markup + FAQ hub",
  targetVerticals: ["med_spa", "marketing_agency", "law_firm"],
  minReviews: 25,
};
```

A full brand-onboarding service (for any seller type, not just AEO) is designed and documented at `docs/brand-onboarding-design.md`.

---

## Key scripts

```bash
pnpm migrate          # create/update DB tables (safe to re-run)
pnpm relevance        # ranked outreach worklist (highly_relevant first)
pnpm grade            # grade all researched prospects A/B/C/D
pnpm db:export        # export full 105-col CSV from Railway
npx tsx src/db-check.ts    # quick DB health check (all prospects, status, grades)
```

---

## Repository structure

```
src/
  browser/           # In-page extractors (injected via Claude in Chrome)
    audit.js         # On-page AEO/SEO audit
    semrush-extract.js   # SEMrush overview + per-engine AI split
    semrush-competitors.js  # SEMrush competitors page
    linkedin-people.js   # LinkedIn company People page → /in/ URLs
    maps-extract.js  # Google Maps search results → names + ratings
  synthesis.ts       # Deterministic AEO+SEO diagnosis (vertical-aware)
  grading.ts         # Value × Opportunity × Reachability → A/B/C/D
  relevance.ts       # ICP-fit verdict (highly_relevant/moderate/not_relevant)
  record-dossier.ts  # Persist to Railway (upsert by domain)
  research-gate.ts   # Gate: enforces SEMrush + LinkedIn passes before persist
  contact-complete.ts  # Email derivation + MX-verify (keyless)
  dossier.ts         # Dossier type + renderDossier() + flattenDossier() (105 cols)
  playbooks.ts       # ICP vertical configs
  migrate.ts         # DB migrations (idempotent)

.claude/skills/research-prospect/SKILL.md   # Codified per-prospect SOP
docs/brand-onboarding-design.md             # Brand onboarding architecture design
```

---

## Data privacy

- `.env` is **gitignored** — your `DATABASE_URL` never reaches GitHub
- `outputs/` is **gitignored** — CSVs with real prospect/contact data stay local
- Derived emails are marked `valid_domain` (MX-confirmed pattern), never `valid_mailbox` — no confirmed inboxes are stored
- LinkedIn profile URLs are only stored when name AND current company are verified on-profile
