import type { Dossier } from "./dossier.js";
import { assertDeepResearchComplete } from "./research-gate.js";
import { saveProspect } from "./storage.js";

/**
 * Persist a Dossier via the configured storage adapter(s).
 *
 * Validates that the deep-research pass is complete, then delegates to
 * saveProspect() which fans out to LocalFileAdapter, DbAdapter, or both
 * depending on the STORAGE env var.
 *
 * Public signature is unchanged — all existing callers (db-flow.ts,
 * research-*.ts) require zero edits.
 */
export async function recordDossier(d: Dossier): Promise<string> {
  assertDeepResearchComplete(d);
  return saveProspect(d);
}
