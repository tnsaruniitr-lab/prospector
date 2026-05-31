import { config } from "./config.js";
import { q, T } from "./db.js";
import { getPlaybook } from "./playbooks.js";
import { runAudit } from "./audit.js";
import { botCheck } from "./botcheck.js";
import { scoreBusiness, qualifyByPriority } from "./scoring.js";

interface ProspectRow {
  id: string;
  name: string;
  website: string | null;
  rating: number | null;
  review_count: number | null;
}

/** Minimal concurrency pool — run `worker` over `items`, `n` at a time. */
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

/**
 * Component 1 over a batch: audit + bot-scan each un-audited prospect, compute
 * the full-stack priority + lead offer, persist, and set qual_status.
 */
export async function auditBatch(opts: { playbookId: string; limit?: number }) {
  const playbook = getPlaybook(opts.playbookId);

  const prospects = await q<ProspectRow>(
    `select id, name, website, rating, review_count
     from ${T.prospects}
     where playbook = $1 and qual_status = 'new' and website is not null
     limit $2`,
    [playbook.id, opts.limit ?? 200],
  );
  if (!prospects.length) {
    console.log(`[audit] nothing to audit for ${playbook.id} (run source first?).`);
    return { audited: 0, qualified: 0 };
  }

  console.log(`[audit] ${prospects.length} sites, concurrency ${config.AUDIT_CONCURRENCY}`);
  let done = 0, qualified = 0;

  await pool(prospects, config.AUDIT_CONCURRENCY, async (p) => {
    const [audit, bot] = await Promise.all([runAudit(p.website!), botCheck(p.website!)]);
    const facts = { reviewCount: p.review_count, rating: p.rating };
    const sc = audit.status === "ok" ? scoreBusiness(facts, audit.signals, bot) : null;

    await q(
      `insert into ${T.audits}
        (prospect_id, tier, status, error, classification, fail_count, warn_count,
         priority, lead_offer, signals, bot, top_issues)
       values ($1,'cheap',$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
      [
        p.id, audit.status, audit.error ?? null, audit.signals.classification,
        audit.signals.failCount, audit.signals.warnCount,
        sc?.priority ?? null, sc?.leadOffer ?? null,
        JSON.stringify(audit.signals),
        JSON.stringify({ hasChatbot: bot.hasChatbot, hasWhatsAppBot: bot.hasWhatsAppBot, hasWhatsAppLink: bot.hasWhatsAppLink, chatVendor: bot.chatVendor, pixels: bot.pixels, note: bot.note }),
        JSON.stringify(audit.topIssues),
      ],
    );

    const verdict = sc ? qualifyByPriority(sc, facts) : { status: "new" as const, reason: "audit error — will retry" };
    if (verdict.status === "qualified") qualified++;

    await q(
      `update ${T.prospects}
       set qual_status = $1, qual_reason = $2, priority = $3, lead_offer = $4,
           whatsapp = $5, instagram = coalesce(instagram, $6),
           has_chatbot = $7, has_whatsapp_bot = $8, updated_at = now()
       where id = $9`,
      [
        verdict.status, verdict.reason, sc?.priority ?? null, sc?.leadOffer ?? null,
        bot.whatsapp, bot.instagram ? `instagram.com/${bot.instagram}` : null,
        bot.hasChatbot, bot.hasWhatsAppBot, p.id,
      ],
    );

    done++;
    const tag = audit.status === "error"
      ? "ERR".padEnd(20)
      : `prio ${String(sc?.priority ?? 0).padStart(3)} ${(sc?.leadOffer ?? "").toUpperCase().padEnd(11)}`;
    console.log(`[audit] ${String(done).padStart(3)}/${prospects.length}  ${tag}  ${verdict.status.padEnd(10)} ${p.name}`);
  });

  console.log(`[audit] done — ${done} audited, ${qualified} qualified.`);
  console.log(`[audit] next: pnpm worklist --playbook ${playbook.id}`);
  return { audited: done, qualified };
}
