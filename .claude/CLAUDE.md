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
- **type: "research"** → Run the full research-prospect flow: Maps discovery → on-page audit → SEMrush → LinkedIn → synthesize → persist to Railway DB. Write a summary result when done.

Never fabricate. If a value isn't found, set it to null or an honest note.

## 3. Connection details

- Railway DB: `DATABASE_URL` from environment (set in `.env` or Claude Code env)
- Queue tool: `src/queue.ts` — commands: `list | take <id> | done <id> '<json>' | fail <id> '<msg>'`
- Research skill: `.claude/skills/research-prospect/SKILL.md`

## 4. For new users

If `DATABASE_URL` is not set, say:
> "To connect to the Prospect Engine database, add DATABASE_URL to your .env file.
> Get the connection string from the project owner or set up your own Railway Postgres."

Then wait. Once set, everything works automatically.
