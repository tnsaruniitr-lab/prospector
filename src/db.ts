import pkg, { type Pool as PgPool } from "pg";
import { config } from "./config.js";

const { Pool, types } = pkg;

// Postgres `numeric` (OID 1700) comes back as a string by default to preserve
// precision; we want JS numbers for pain_score / rating.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

/** Railway public connections need SSL; local dev does not. */
function sslFor(url: string): false | { rejectUnauthorized: boolean } {
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return false;
  } catch {
    /* fall through */
  }
  return { rejectUnauthorized: false };
}

let activePool: PgPool | null = null;

function getPool() {
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database commands. Add it to prospect-engine/.env.");
  }
  activePool ??= new Pool({
    connectionString: config.DATABASE_URL,
    ssl: sslFor(config.DATABASE_URL),
    max: 10,
  });
  return activePool;
}

export const pool = {
  query: (text: string, params?: unknown[]) => getPool().query(text, params),
  end: async () => {
    if (!activePool) return;
    await activePool.end();
    activePool = null;
  },
};

/** Run a parameterized query and return the rows. */
export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

// Schema-qualified table names in one place.
export const T = {
  campaigns: "prospect.campaigns",
  prospects: "prospect.prospects",
  audits: "prospect.audits",
  contacts: "prospect.contacts",
  outreach: "prospect.outreach",
} as const;
