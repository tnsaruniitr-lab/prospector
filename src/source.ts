import { q, T } from "./db.js";
import { getPlaybook } from "./playbooks.js";
import { searchPlaces } from "./places.js";
import type { NormalizedProspect } from "./types.js";

interface SourceOpts {
  playbookId: string;
  city: string;
  maxPages?: number;
  seedOverride?: string;
}

/**
 * Discover businesses for one playbook in one city: run each search seed
 * through Places, dedupe by place_id, and store as prospects under a campaign.
 * Re-running is safe — existing prospects (and their audits) are left intact.
 */
export async function source(opts: SourceOpts) {
  const playbook = getPlaybook(opts.playbookId);
  const seeds = opts.seedOverride ? [opts.seedOverride] : playbook.searchSeeds;
  const query = seeds.map((s) => `${s} in ${opts.city}`).join(" | ");

  console.log(`[source] ${playbook.label} in ${opts.city}`);
  console.log(`[source] seeds: ${seeds.join(", ")}`);

  // Gather + dedupe across all seeds.
  const byPlaceId = new Map<string, NormalizedProspect>();
  for (const seed of seeds) {
    const sq = `${seed} in ${opts.city}`;
    const found = await searchPlaces(sq, opts.city, opts.maxPages ?? 3);
    console.log(`[source]   "${sq}" → ${found.length}`);
    for (const p of found) if (!byPlaceId.has(p.placeId)) byPlaceId.set(p.placeId, p);
  }
  const prospects = [...byPlaceId.values()];

  // Record the campaign.
  const [campaign] = await q<{ id: string }>(
    `insert into ${T.campaigns} (playbook, city, query, found_count)
     values ($1, $2, $3, $4) returning id`,
    [playbook.id, opts.city, query, prospects.length],
  );

  // Insert prospects; on_conflict keeps prior qual_status/audits intact.
  let inserted = 0;
  for (const p of prospects) {
    const rows = await q<{ id: string }>(
      `insert into ${T.prospects}
        (campaign_id, playbook, place_id, name, website, domain, phone, address,
         city, google_maps_uri, rating, review_count, types, qual_status, qual_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (place_id) do nothing
       returning id`,
      [
        campaign.id, playbook.id, p.placeId, p.name, p.website, p.domain, p.phone,
        p.address, p.city, p.googleMapsUri, p.rating, p.reviewCount, p.types,
        p.website ? "new" : "no_website",
        p.website ? null : "No website — phone/walk-in motion, not web audit.",
      ],
    );
    if (rows.length) inserted++;
  }

  const withSite = prospects.filter((p) => p.website).length;
  console.log(
    `[source] ${prospects.length} unique businesses (${withSite} with a website). ` +
      `${inserted} new rows stored. Campaign ${campaign.id}.`,
  );
  console.log(`[source] next: pnpm audit --playbook ${playbook.id}`);
  return { campaignId: campaign.id, found: prospects.length, withSite, inserted };
}
