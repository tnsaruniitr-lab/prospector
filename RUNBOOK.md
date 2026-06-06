# Runbook — run the deterministic prospecting flow

Produce gold-dense AEO dossiers (AI-search visibility + lead conversion) for any
**business type + city**, in a fresh Claude Code session. **Browser-first, no API keys.**

## One-time setup
1. Clone this repo and open it in **Claude Code**.
2. `pnpm install`
3. Chrome: install the **Claude-in-Chrome** extension, connect your desktop browser,
   and stay **logged into SEMrush + LinkedIn** (the research reads these on-screen).
4. `.env`: set `DATABASE_URL=…` (Railway) to persist to the DB, **or** skip it and
   set `STORAGE=local` to write only to `outputs/`.

## To run a batch (this is all you do, every new chat)
In Claude Code, say:

> **research \<business type\> in \<city\> — \<count\>**

e.g. `research med spas in Dubai — 5`

The `research-prospect` skill (in `.claude/`) makes the agent run the **deterministic
orchestrator** — it does NOT improvise:

1. `npx tsx src/research-run.ts plan "<type>" "<city>" <count>` → the fixed recipe
   (vertical, SEMrush db, Maps URL, per-prospect steps, gate-enforced definition of done).
2. Execute it, **injecting the codified extractors** (`src/browser/*.js`) — never ad-hoc JS:
   Maps discovery → `audit.js` → SEMrush overview + AI suite → competitors (**AI-check ≥2**)
   → `find-contacts` → LinkedIn founder + DM2 (**company-confirmed**).
3. Per prospect: `npx tsx src/research-run.ts finalize <dossier.json>` — runs the **GATE**
   (`assertDeepResearchComplete`). A prospect **cannot save** until SEMrush + a competitive
   pass + 2 decision-makers (or an explicit not-public note) are present **and correct**.
   **Never `saveProspect` directly.**
4. `npx tsx src/db-export.ts` → refreshes `outputs/prospect-dossier-from-db-final.csv` + `.xlsx`.

The only times the agent needs you: **approve the candidate list** and **resolve an
ambiguous founder**. Everything else is gate-enforced.

## Where the output lands
- `outputs/prospect-dossier-from-db-final.csv` + `.xlsx` (105+ columns)
- per-prospect JSON in `outputs/dossiers/`
- Railway DB `prospect.prospects` (if `DATABASE_URL` is set)

## Deterministic vs. agent (be honest about it)
- **Code (deterministic):** the recipe, the gate, synthesis (`synthesizeDiagnosis`),
  relevance scoring, CSV/XLSX export, discovery + contact crawlers.
- **Agent (browser-first, in-session):** reads the SEMrush/LinkedIn pages, picks the
  candidate list, resolves ambiguous founders.
- **Pacing:** space SEMrush page-loads (a few seconds apart) so it doesn't rate-limit.
  If a read stalls, the gate **blocks** that prospect rather than save a thin row — so
  you never get a half-done dossier. Re-run that one when SEMrush un-throttles.

## Handy commands
| Command | What |
|---|---|
| `npx tsx src/research-run.ts plan "<type>" "<city>" <n>` | print the recipe |
| `npx tsx src/research-run.ts finalize <dossier.json>` | gate + persist one prospect |
| `npx tsx src/research-run.ts gate <domain>` | check whether a saved row passes the gate |
| `npx tsx src/find-contacts.ts <domain>` | business email + people from the site crawl |
| `npx tsx src/db-export.ts` | rebuild the CSV/XLSX from the DB |
