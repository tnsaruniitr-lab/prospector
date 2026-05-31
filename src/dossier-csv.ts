import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dossierToCsv, flattenDossier, renderDossier, DOSSIER_COLUMNS } from "./dossier.js";
import { altaderma, eden } from "./dossier-data.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "outputs");
mkdirSync(outDir, { recursive: true });

const dossiers = [altaderma, eden];

// The CSV is the column contract — mirrors the columns that will persist to Postgres.
const csvPath = resolve(outDir, "prospect-dossier.csv");
writeFileSync(csvPath, dossierToCsv(dossiers), "utf-8");

// Per-prospect markdown briefs (rendered from the same objects).
for (const d of dossiers) {
  const slug = d.domain.replace(/[^a-z0-9]+/gi, "-");
  writeFileSync(resolve(outDir, `${slug}-dossier.md`), renderDossier(d), "utf-8");
}

console.log(`Columns (${DOSSIER_COLUMNS.length}):`);
DOSSIER_COLUMNS.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${c}`));

console.log(`\n--- Altaderma row (populated values) ---`);
const row = flattenDossier(altaderma);
for (const c of DOSSIER_COLUMNS) console.log(`  ${c.padEnd(28)} ${row[c] || "· (empty)"}`);

console.log(`\n[csv] wrote ${csvPath} — ${dossiers.length} rows (Altaderma=full, EDEN=partial)`);
