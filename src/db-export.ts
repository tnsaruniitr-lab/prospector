import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { q, T } from "./db.js";
import { dossierToCsv, renderDossier, type Dossier } from "./dossier.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "outputs");

/** Read all dossiers back out of Postgres and render CSV + per-prospect markdown. */
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
  const csvPath = resolve(outDir, "prospect-dossier-from-db.csv");
  writeFileSync(csvPath, dossierToCsv(dossiers), "utf-8");
  for (const d of dossiers) {
    const slug = d.domain.replace(/[^a-z0-9]+/gi, "-");
    writeFileSync(resolve(outDir, `${slug}-from-db.md`), renderDossier(d), "utf-8");
  }
  console.log(`[db-export] ${dossiers.length} dossiers read from DB → ${csvPath}`);
  return dossiers.length;
}
