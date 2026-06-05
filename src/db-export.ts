import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { q, T, pool } from "./db.js";
import { dossierToCsv, dossierToRows, renderDossier, type Dossier } from "./dossier.js";
import { buildXlsx } from "./storage.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "outputs");

/**
 * Read all dossiers back out of Postgres and (re)generate the canonical enriched
 * file — `prospect-dossier-from-db-final.csv` + `.xlsx` — which is where new research
 * accumulates. Because it is always rendered from the DB via the same column set,
 * new rows are guaranteed to align with the existing 105-column format.
 */
export async function dbExport(): Promise<number> {
  const rows = await q<{ dossier: Dossier }>(
    `select dossier from ${T.prospects} where dossier is not null order by researched_at desc nulls last`,
  );
  const dossiers = rows.map((r) => r.dossier).filter(Boolean);
  if (!dossiers.length) {
    console.log("[db-export] no dossiers in DB yet");
    return 0;
  }
  mkdirSync(outDir, { recursive: true });

  // Canonical enriched outputs — the file new research accumulates into.
  const finalCsv = resolve(outDir, "prospect-dossier-from-db-final.csv");
  writeFileSync(finalCsv, dossierToCsv(dossiers), "utf-8");

  const { headers, rows: dataRows } = dossierToRows(dossiers);
  const xlsxBuf = await buildXlsx(headers, dataRows);
  writeFileSync(resolve(outDir, "prospect-dossier-from-db-final.xlsx"), xlsxBuf);

  // Back-compat: keep the original csv name too.
  writeFileSync(resolve(outDir, "prospect-dossier-from-db.csv"), dossierToCsv(dossiers), "utf-8");

  for (const d of dossiers) {
    const slug = d.domain.replace(/[^a-z0-9]+/gi, "-");
    writeFileSync(resolve(outDir, `${slug}-from-db.md`), renderDossier(d), "utf-8");
  }
  console.log(`[db-export] ${dossiers.length} dossiers → ${finalCsv} (+ .xlsx)`);
  return dossiers.length;
}

// Run directly: `pnpm exec tsx src/db-export.ts`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await dbExport();
  await pool.end();
}
