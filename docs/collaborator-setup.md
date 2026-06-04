# Collaborator Setup — Join an Existing Railway DB

This guide is for a collaborator who wants to run research locally and push results into a shared Railway Postgres database. Takes ~15 minutes.

You will run the research on your own machine (using your own browser, SEMrush, and LinkedIn). Every prospect you research gets stored in the same shared Railway DB — so you and your teammate see each other's work in real time.

---

## What you need from your teammate (ask them once)

Just one thing: **the `DATABASE_URL`** from their `.env` file.

It looks like:
```
postgresql://postgres:SOME_PASSWORD@zephyr.proxy.rlwy.net:59654/railway
```

---

## Step 1 — Prerequisites

Install these on your machine:

| Tool | How |
|---|---|
| **Node.js 20+** | [nodejs.org](https://nodejs.org) — download the LTS installer |
| **pnpm** | `npm install -g pnpm` |
| **Claude Code** | `npm install -g @anthropic/claude-code` then `claude` to authenticate |

---

## Step 2 — Clone the repo

```bash
git clone https://github.com/tnsaruniitr-lab/prospector.git
cd prospector
pnpm install
```

---

## Step 3 — Connect to the shared Railway DB

Create a `.env` file in the project root:

```bash
# On Mac/Linux:
echo 'DATABASE_URL=postgresql://postgres:PASSWORD@zephyr.proxy.rlwy.net:59654/railway' > .env

# Or just create the file manually — paste this inside:
# DATABASE_URL=postgresql://postgres:PASSWORD@...
```

Replace the full connection string with the one your teammate gave you.

**Verify it works:**
```bash
npx tsx src/db-check.ts
```

You should see a table of all existing prospects (everything your teammate has already researched). If it errors, double-check the `DATABASE_URL`.

---

## Step 4 — Install Claude in Chrome

1. Open **Chrome** (must be Chrome, not Safari/Firefox)
2. Go to [claude.ai/chrome-extension](https://claude.ai/chrome-extension) and install the extension
3. Click the Claude icon in your toolbar → **Connect**
4. You should see "Connected" — this links Claude Code to your browser

---

## Step 5 — Log into your research accounts in Chrome

Open Chrome and log in to both of these (stay logged in):
- **SEMrush** — [semrush.com](https://semrush.com) (any paid plan)
- **LinkedIn Premium** — [linkedin.com](https://linkedin.com)

These are the only two accounts the tool uses for data. No other logins needed.

---

## Step 6 — Choose your mode

### Mode A — Fully local (everything on your machine)
```bash
pnpm start:local
# Starts server + agent together, opens localhost:3000/app automatically
# No BRIDGE_URL or AGENT_TOKEN needed
```

### Mode B — Connect to a shared hosted server
```bash
BRIDGE_URL=wss://your-railway-url/ws AGENT_TOKEN=your-token pnpm connect
# Agent connects to the hosted server, web UI at the Railway URL
# Multiple people can share the same hosted server + DB
```

## Step 7 — Run your first prospect

Open Claude Code in the project folder:
```bash
cd prospector
claude
```

Then type a research request:

```
research med spa in Miami, FL — 1 prospect, full flow
```

or a specific domain:
```
research prospect altaderma.com, Dubai
```

Claude will drive your Chrome browser — you'll see it navigate Maps, SEMrush, and LinkedIn automatically. When it's done, the dossier is in the shared Railway DB.

---

## Seeing what's in the DB

### Quick ranked list (who to contact first)
```bash
pnpm relevance
```

### Full CSV export
```bash
pnpm db:export
```
Opens `outputs/prospect-dossier-from-db.csv` — 105 columns including all contacts, audit, AI visibility, synthesis, and relevance verdict. The `outputs/` folder is local only (not pushed to GitHub).

### Railway web UI
Go to [railway.app](https://railway.app) → ask your teammate to add you as a collaborator on the project → open Data tab → switch schema selector from `public` to **`prospect`** → click `prospects` table.

### Grade all prospects
```bash
pnpm grade
```

---

## How the shared DB works

| Action | Who runs it | Result |
|---|---|---|
| Research a new prospect | Either teammate, locally | New row added to shared `prospect.prospects` |
| `pnpm grade` | Either teammate | Updates `grade_tier` + `priority` for all rows |
| `pnpm relevance` | Either teammate | Reads all rows, shows combined ranked list |
| `pnpm db:export` | Either teammate | Exports all rows to local CSV |

You both see the same data. There's no conflict — each prospect is deduped by domain, so researching the same domain twice just updates the existing row.

---

## Troubleshooting

**`error: password authentication failed`**
→ Wrong `DATABASE_URL`. Ask your teammate to copy it again from their `.env`.

**`error: schema prospect does not exist`**
→ Run `pnpm migrate` once to create the tables.

**Claude can't see my browser / "no tab found"**
→ Make sure the Claude in Chrome extension is installed AND you clicked Connect in the extension popup. Then restart Claude Code (`claude`).

**SEMrush shows wrong country data**
→ The tool uses `?db=de` for Germany, `?db=us` for US, etc. — set automatically from the prospect's city. If your SEMrush account defaults to a different country, the URL param should override it.

**LinkedIn shows "Premium required"**
→ You need LinkedIn Premium for the People page and profile viewing. Basic free LinkedIn will be blocked on company People pages.

---

## What stays local (never shared)

- Your `.env` file — contains the DB password, never commit it
- `outputs/*.csv` — the exported prospect data stays on your machine
- Your browser sessions — SEMrush/LinkedIn logins are yours only

Everything else (research scripts, code, config) is on GitHub and shared.
