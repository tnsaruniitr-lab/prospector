import { z } from "zod";
import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ override: true });

// Project root = parent of src/.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const envSchema = z.object({
  // Railway Postgres connection string.
  DATABASE_URL: z.string().optional(),
  // Required only for `source`; validated at point of use so audit/worklist run without it.
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // Optional contact enrichment. People Search is useful for LinkedIn/name/title;
  // email/phone reveal is kept behind explicit flags because it can consume credits.
  APOLLO_API_KEY: z.string().optional(),
  APOLLO_ENRICH: z.coerce.boolean().default(false),
  APOLLO_REVEAL_EMAILS: z.coerce.boolean().default(false),
  APOLLO_REVEAL_PHONES: z.coerce.boolean().default(false),
  // Optional Semrush API enrichment. Uses the official CSV-returning endpoints.
  SEMRUSH_API_KEY: z.string().optional(),
  SEMRUSH_DATABASE: z.string().optional(),
  SEMRUSH_TOP_KEYWORDS_LIMIT: z.coerce.number().int().positive().default(8),
  SEMRUSH_COMPETITORS_LIMIT: z.coerce.number().int().positive().default(5),
  // Optional LLM layer for sharpened openers.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  // Auditor wiring.
  AUDITOR_SCRIPT: z.string().optional(),
  AUDIT_CONCURRENCY: z.coerce.number().int().positive().default(4),
  AUDIT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[prospect] Missing / invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;

export const paths = {
  projectRoot,
  outputsDir: resolve(projectRoot, "outputs"),
  migrationsDir: resolve(projectRoot, "migrations"),
  auditorScript:
    config.AUDITOR_SCRIPT ??
    resolve(
      projectRoot,
      "../aeo-seo-auditor/skill-unified/scripts/run_deterministic.sh",
    ),
};
