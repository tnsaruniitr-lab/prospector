import { q, T } from "./db.js";

// A discovered business (from Places API or browser Maps), before deep research.
export interface Candidate {
  name: string;
  website?: string | null;
  city?: string | null;
  category?: string | null;
  rating?: number | null;
  reviews?: number | null;
}

function domainOf(website?: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Store discovered businesses as `pending` prospects (the research queue).
 * Deduped by domain (or name+city when no website). Does NOT overwrite anything
 * already researched — additive seeding only.
 */
export async function recordCandidates(candidates: Candidate[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0, skipped = 0;
  for (const c of candidates) {
    const domain = domainOf(c.website);
    const existing = domain
      ? await q<{ id: string }>(`select id from ${T.prospects} where lower(domain) = $1 limit 1`, [domain])
      : await q<{ id: string }>(`select id from ${T.prospects} where name = $1 and coalesce(city,'') = $2 limit 1`, [c.name, c.city ?? ""]);
    if (existing.length) { skipped++; continue; }
    await q(
      `insert into ${T.prospects} (playbook, name, website, domain, city, rating, review_count, research_status, qual_status)
       values ($1,$2,$3,$4,$5,$6,$7,'pending','new')`,
      [c.category ?? "discovery", c.name, c.website ?? null, domain, c.city ?? null, c.rating ?? null, c.reviews ?? null],
    );
    inserted++;
  }
  return { inserted, skipped };
}
