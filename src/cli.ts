import { source } from "./source.js";
import { auditBatch } from "./audit-batch.js";
import { worklist } from "./worklist.js";
import { enrich } from "./enrich.js";
import { runLocalCsv } from "./local-csv.js";
import { runDossierCsv } from "./dossier-from-csv.js";
import { dbExport } from "./db-export.js";
import { PLAYBOOKS } from "./playbooks.js";
import { pool } from "./db.js";

interface Flags {
  playbook?: string;
  city?: string;
  cities?: string[];
  seed?: string;
  input?: string;
  output?: string;
  maxPages?: number;
  limit?: number;
  start?: number;
  force?: boolean;
  allowQuick?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): Flags {
  const f: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--playbook": f.playbook = argv[++i]; break;
      case "--city": f.city = argv[++i]; break;
      case "--cities": f.cities = argv[++i].split(";").map((s) => s.trim()).filter(Boolean); break;
      case "--seed": f.seed = argv[++i]; break;
      case "--input": f.input = argv[++i]; break;
      case "--output": f.output = argv[++i]; break;
      case "--max-pages": f.maxPages = Number(argv[++i]); break;
      case "--limit": f.limit = Number(argv[++i]); break;
      case "--start": f.start = Number(argv[++i]); break;
      case "--force": f.force = true; break;
      case "--allow-quick": f.allowQuick = true; break;
      case "-h": case "--help": f.help = true; break;
      default:
        if (argv[i].startsWith("--")) { console.error(`Unknown flag: ${argv[i]}`); process.exit(1); }
    }
  }
  return f;
}

function printHelp() {
  const ids = Object.keys(PLAYBOOKS).join(" | ");
  console.log(`
prospect-engine — audit-led outbound for local-service ICPs

Commands:
  source    --playbook <id> --city "<City, ST>" [--seed "<query>"] [--max-pages 3]
            Discover businesses via Google Places and store them.

  audit     --playbook <id> [--limit 200]
            Low-level cheap audit only. Blocked by default for outreach because
            every usable audit must include browser SEMrush + LinkedIn.
            Use --allow-quick only for debugging.

  enrich    --playbook <id> [--city "<City, ST>"] [--limit N] [--force]
            Crawl contact/about/team pages, extract emails/socials/forms/people,
            and optionally enrich owner/founder leads via Apollo.

  worklist  --playbook <id> [--city "<City, ST>"] [--limit N]
            Export a ranked, enriched worklist (markdown + CSV) to outputs/.

  pipeline  --playbook <id> --cities "City A;City B" [--limit N]
            Legacy quick pipeline. Blocked by default; use deep browser dossier
            research for outreach-ready data.

  csv       --playbook <id> --input leads.csv [--output enriched.csv] [--limit N]
            Legacy quick CSV. Blocked by default because it is not Semrush +
            LinkedIn browser complete. Use --allow-quick only for debugging.

  dossier-csv --input enriched.csv [--output prospect-dossier.csv] [--limit N]
            Convert a quick enriched CSV into the 70-column dossier contract.
            Rows are marked partial until the browser SEMrush/LinkedIn pass is complete.

  db-export
            Export researched Postgres dossiers to outputs/prospect-dossier-from-db.csv
            plus one markdown dossier per prospect.

  playbooks
            List available ICP playbooks.

Playbooks: ${ids}

  Typical Week-1 run:
  pnpm source   --playbook roofing --city "Austin, TX"

Outreach-ready rule:
  Do browser research first: rendered page audit + SEMrush overview/competitors +
  LinkedIn founder/DM2 verification. Only persisted dossiers pass the hard gate.
`);
}

function assertQuickAllowed(command: string, flags: Flags) {
  if (flags.allowQuick || process.env.PROSPECT_ALLOW_QUICK_AUDIT === "1") return;
  console.error(
    `[${command}] blocked: quick audit paths are not outreach-ready. ` +
    "Run the browser dossier flow with SEMrush + LinkedIn, or pass --allow-quick only for debugging.",
  );
  process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseArgs(rest);

  if (!command || flags.help) {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case "playbooks":
      for (const p of Object.values(PLAYBOOKS)) {
        console.log(`  ${p.id.padEnd(16)} ${p.label}`);
        console.log(`  ${" ".repeat(16)} seeds: ${p.searchSeeds.join(", ")}`);
        console.log(`  ${" ".repeat(16)} channels: ${p.channelPriority.join(" → ")}`);
      }
      break;

    case "source":
      if (!flags.playbook || !flags.city) {
        console.error("source requires --playbook and --city");
        process.exit(1);
      }
      await source({ playbookId: flags.playbook, city: flags.city, seedOverride: flags.seed, maxPages: flags.maxPages });
      break;

    case "audit":
      if (!flags.playbook) { console.error("audit requires --playbook"); process.exit(1); }
      assertQuickAllowed("audit", flags);
      await auditBatch({ playbookId: flags.playbook, limit: flags.limit });
      break;

    case "enrich":
      if (!flags.playbook) { console.error("enrich requires --playbook"); process.exit(1); }
      await enrich({ playbookId: flags.playbook, city: flags.city, limit: flags.limit, force: flags.force });
      break;

    case "worklist":
      if (!flags.playbook) { console.error("worklist requires --playbook"); process.exit(1); }
      await worklist({ playbookId: flags.playbook, city: flags.city, limit: flags.limit });
      break;

    case "pipeline":
      if (!flags.playbook) { console.error("pipeline requires --playbook"); process.exit(1); }
      assertQuickAllowed("pipeline", flags);
      {
        const cities = flags.cities ?? (flags.city ? [flags.city] : []);
        if (!cities.length) {
          console.error(`pipeline requires --cities "City A;City B" or --city "<City>"`);
          process.exit(1);
        }
        for (const city of cities) {
          await source({ playbookId: flags.playbook, city, seedOverride: flags.seed, maxPages: flags.maxPages });
        }
        await auditBatch({ playbookId: flags.playbook, limit: flags.limit });
        await enrich({ playbookId: flags.playbook, limit: flags.limit, force: flags.force });
        await worklist({ playbookId: flags.playbook, limit: flags.limit });
      }
      break;

    case "csv":
      if (!flags.playbook || !flags.input) {
        console.error("csv requires --playbook and --input");
        process.exit(1);
      }
      assertQuickAllowed("csv", flags);
      await runLocalCsv({
        playbookId: flags.playbook,
        input: flags.input,
        output: flags.output,
        limit: flags.limit,
        start: flags.start,
      });
      break;

    case "dossier-csv":
      if (!flags.input) {
        console.error("dossier-csv requires --input");
        process.exit(1);
      }
      runDossierCsv({
        input: flags.input,
        output: flags.output,
        limit: flags.limit,
        start: flags.start,
      });
      break;

    case "db-export":
      await dbExport();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[prospect] fatal:", err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
