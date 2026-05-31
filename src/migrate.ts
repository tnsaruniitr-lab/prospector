import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "./db.js";
import { paths } from "./config.js";

// Apply the SQL migration(s) against the configured Railway Postgres.
// Idempotent — statements use create/alter if not exists.
const files = readdirSync(paths.migrationsDir)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort();

try {
  for (const name of files) {
    const file = resolve(paths.migrationsDir, name);
    const sql = readFileSync(file, "utf-8");
    await pool.query(sql);
    console.log(`[migrate] applied ${file}`);
  }
} catch (err) {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
