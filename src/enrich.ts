import { config } from "./config.js";
import { q, T } from "./db.js";
import { getPlaybook } from "./playbooks.js";
import { searchApolloContacts } from "./apollo.js";
import { extractSiteContacts } from "./contact-extract.js";
import { llmExtractOwners } from "./people-llm.js";
import { findFounderLinkedIn } from "./linkedin-find.js";
import { verifyEmail } from "./verify.js";
import type { ExtractedContact } from "./types.js";

interface EnrichOpts {
  playbookId: string;
  city?: string;
  limit?: number;
  force?: boolean;
}

interface ProspectRow {
  id: string;
  name: string;
  website: string;
  domain: string | null;
  phone: string | null;
  city: string | null;
}

async function pool<I>(items: I[], n: number, worker: (item: I, i: number) => Promise<void>) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

function contactKey(c: ExtractedContact) {
  return [
    c.name?.toLowerCase() ?? "",
    c.email?.toLowerCase() ?? "",
    c.linkedinUrl?.toLowerCase() ?? "",
    c.phone?.toLowerCase() ?? "",
    c.source,
  ].join("|");
}

function mergeContacts(contacts: ExtractedContact[]) {
  const map = new Map<string, ExtractedContact>();
  for (const c of contacts) {
    const key = contactKey(c);
    const prior = map.get(key);
    if (!prior || c.confidence > prior.confidence) map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}

function cityClause(city: string | undefined, params: unknown[]) {
  if (!city) return "";
  params.push(city);
  return ` and city = $${params.length}`;
}

export async function enrich(opts: EnrichOpts) {
  const playbook = getPlaybook(opts.playbookId);
  const params: unknown[] = [playbook.id, opts.limit ?? 200];

  let sql = `
    select p.id, p.name, p.website, p.domain, p.phone, p.city
    from ${T.prospects} p
    where p.playbook = $1
      and p.website is not null
  `;
  sql += cityClause(opts.city, params);
  if (!opts.force) {
    sql += `
      and not exists (
        select 1 from ${T.contacts} c
        where c.prospect_id = p.id
          and c.source in ('website_crawl', 'apollo_search', 'apollo_enrich')
      )
    `;
  }
  sql += ` order by p.priority desc nulls last, p.review_count desc nulls last limit $2`;

  const prospects = await q<ProspectRow>(sql, params);
  if (!prospects.length) {
    console.log(`[enrich] nothing to enrich for ${playbook.id}${opts.city ? ` in ${opts.city}` : ""}.`);
    return { enriched: 0, contacts: 0 };
  }

  console.log(
    `[enrich] ${prospects.length} prospects, website crawl` +
      (config.APOLLO_API_KEY ? " + Apollo" : " (Apollo skipped: no APOLLO_API_KEY)"),
  );

  let enriched = 0;
  let contactsStored = 0;

  await pool(prospects, config.AUDIT_CONCURRENCY, async (p, i) => {
    const site = await extractSiteContacts(p.website, {
      maxPages: 8,
      contactTitles: playbook.contactTitles,
    });

    // LLM founder rung — clean owner names the deterministic regex can't get
    // (and the Geschäftsführer in a German Impressum).
    const llmOwners = await llmExtractOwners(p.website, p.name, playbook.contactTitles);

    const apollo = await searchApolloContacts({
      domain: p.domain,
      city: p.city,
      contactTitles: playbook.contactTitles,
      limit: 5,
    });

    const contacts = mergeContacts([...site.people, ...llmOwners, ...apollo]);

    // LinkedIn search rung — when we have an owner's NAME but no profile URL,
    // search the web for their linkedin.com/in/ (the primary path; many are findable).
    const ownerNeedingLinkedin = contacts.find(
      (c) => c.name && !c.linkedinUrl && (!c.role || /owner|founder|director|ceo|principal|partner|inhaber|geschaft/i.test(c.role)),
    );
    if (ownerNeedingLinkedin?.name) {
      const li = await findFounderLinkedIn(ownerNeedingLinkedin.name, p.name, p.city);
      if (li) {
        ownerNeedingLinkedin.linkedinUrl = li.url;
        ownerNeedingLinkedin.confidence = Math.max(ownerNeedingLinkedin.confidence, li.confidence);
        ownerNeedingLinkedin.evidence += ` · LinkedIn via search`;
      }
    }

    await q(
      `delete from ${T.contacts}
       where prospect_id = $1
         and source in ('website_crawl', 'apollo_search', 'apollo_enrich')`,
      [p.id],
    );

    for (const c of contacts) {
      await q(
        `insert into ${T.contacts}
          (prospect_id, name, role, email, email_status, linkedin_url, instagram, phone,
           source, confidence, evidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          p.id,
          c.name,
          c.role,
          c.email,
          await verifyEmail(c.email),
          c.linkedinUrl,
          c.instagram,
          c.phone,
          c.source,
          c.confidence,
          c.evidence,
        ],
      );
      contactsStored++;
    }

    await q(
      `update ${T.prospects}
       set email = coalesce(email, $1),
           phone = coalesce(phone, $2),
           whatsapp = coalesce(whatsapp, $3),
           instagram = coalesce(instagram, $4),
           linkedin = coalesce(linkedin, $5),
           facebook = coalesce(facebook, $6),
           tiktok = coalesce(tiktok, $7),
           youtube = coalesce(youtube, $8),
           x_url = coalesce(x_url, $9),
           contact_form = coalesce(contact_form, $10),
           booking_link = coalesce(booking_link, $11),
           enrichment_status = $12,
           enriched_at = now(),
           updated_at = now()
       where id = $13`,
      [
        site.emails[0] ?? contacts.find((c) => c.email)?.email ?? null,
        site.phones[0] ?? contacts.find((c) => c.phone)?.phone ?? null,
        site.whatsapp,
        site.socials.instagram,
        site.socials.linkedin ?? contacts.find((c) => c.linkedinUrl)?.linkedinUrl ?? null,
        site.socials.facebook,
        site.socials.tiktok,
        site.socials.youtube,
        site.socials.x,
        site.contactForms[0] ?? null,
        site.bookingLinks[0] ?? null,
        contacts.length ? "enriched" : "no_contacts_found",
        p.id,
      ],
    );

    enriched++;
    const best = contacts[0];
    const bestLabel = best
      ? `${best.name ?? best.role ?? "contact"} ${best.email ?? best.linkedinUrl ?? best.phone ?? ""}`.trim()
      : "no contacts";
    console.log(
      `[enrich] ${String(i + 1).padStart(3)}/${prospects.length} ` +
        `${String(contacts.length).padStart(2)} contacts  ${p.name} -> ${bestLabel}`,
    );
  });

  console.log(`[enrich] done - ${enriched} prospects enriched, ${contactsStored} contacts stored.`);
  return { enriched, contacts: contactsStored };
}
