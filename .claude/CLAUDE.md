# Prospect Engine — Auto-start

This is the Prospect Engine skill. Every time this project loads in Claude Code,
do the following automatically WITHOUT waiting to be asked:

## 1. Check the queue (always, on session start)

Run:
```bash
cd /path/to/prospect-engine && npx tsx src/queue.ts list
```

Use the actual path where this skill is installed. If running from the repo
directly, use the repo root. If installed as a plugin, use the plugin path.

- If the queue has pending requests → process them immediately (see below)
- If the queue is empty → say "✅ Prospect Engine ready. Watching for requests." and arm the Monitor

## 2. Arm the Monitor (persistent, session-length)

Watch for new queue entries every 3 seconds. When a new pending entry appears:
- **type: "infer"** → Read the `payload.url`, scrape it (fetch the homepage), understand what the business sells broadly (not limited to 4 presets — any business), extract: personaId (or null), vertical, offer, painYouFix, fixes, services, customerTypes, icp, competitorHint, suggestedSources, confidence, reasoning, title. Write result with `npx tsx src/queue.ts done <id> '<json>'`
- **type: "wedge"** → Read `payload.brand` (offer, value_prop, fixes, icp, customer_types). Find the seller's sharpest MEASURABLE wedge (the pain provable with a number). Prefer the LIGHTEST sources (google_search, website, onpage_audit, google_reviews, google_maps, pagespeed) over HEAVY ones (semrush_ai, semrush_seo, linkedin_company, apollo_browser) — only use heavy if the wedge truly needs it. Output `{wedge, provingSignals:[{signal,meaning,threshold,source}], sources, pitchFormula, confidence, reasoning}`. Write with `npx tsx src/queue.ts done <id> '<json>'`. (Same logic as `src/wedge.ts buildWedgePrompt`.)
- **type: "research"** → Run the full research-prospect flow: Maps discovery → on-page audit → SEMrush → LinkedIn → synthesize → persist to Railway DB. Write a summary result when done.

Never fabricate. If a value isn't found, set it to null or an honest note.

## 3. Connection details

- Queue tool: `src/queue.ts` — commands: `list | take <id> | done <id> '<json>' | fail <id> '<msg>'`
- Research skill: `.claude/skills/research-prospect/SKILL.md`

## 4. Storage

Storage destination is controlled by the `STORAGE` env var:

- **Default (no setup):** `STORAGE=local` — every researched prospect is saved as a JSON file in `outputs/dossiers/` and appended to `outputs/prospects.csv` and `outputs/prospects.xlsx`. No `DATABASE_URL` required.
- **Railway Postgres:** `STORAGE=db` — persists to Railway Postgres. Requires `DATABASE_URL` in `.env`.
- **Both:** `STORAGE=both` — writes local files AND the database simultaneously.

The `recordDossier()` public API is unchanged regardless of storage mode.

## 5. For new users

**Storage (new users, no database):** By default (`STORAGE=local`) every researched prospect is saved as a JSON file in `outputs/dossiers/` and appended to `outputs/prospects.csv` and `outputs/prospects.xlsx` — no `DATABASE_URL` required. Set `STORAGE=db` (and provide `DATABASE_URL`) to persist to Railway Postgres instead, or `STORAGE=both` to write to both simultaneously.

If `DATABASE_URL` is not set and `STORAGE=db` or `STORAGE=both` is configured, say:
> "To connect to the Prospect Engine database, add DATABASE_URL to your .env file.
> Get the connection string from the project owner or set up your own Railway Postgres."

Then wait. Once set, everything works automatically.
