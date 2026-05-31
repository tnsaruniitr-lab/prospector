import { q, T } from "./db.js";
import type { Dossier, DossierContact } from "./dossier.js";
import { assertDeepResearchComplete } from "./research-gate.js";

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
};
/** SEMrush-style abbreviated count → integer ("7K"→7000, "2.2K"→2200, "717"→717). */
const kmbToInt = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Math.round(v);
  const m = String(v).trim().replace(/,/g, "").match(/^([0-9]*\.?[0-9]+)\s*([kmb])?/i);
  if (!m) return null;
  const mult = ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[(m[2] || "").toLowerCase()] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
};

/**
 * Persist a Dossier to Postgres (upsert by domain). The full object goes into
 * the `dossier` jsonb (source of truth); a queryable subset goes into flat
 * columns; contacts + an audit row are written alongside. Idempotent — re-running
 * on the same domain updates in place. This is the going-forward persistence call:
 * every researched prospect flows through here into the Railway DB.
 */
export async function recordDossier(d: Dossier): Promise<string> {
  assertDeepResearchComplete(d);

  const c = d.contacts;
  const cv = d.competitive;
  const domain = d.domain.toLowerCase();

  const vals = {
    playbook: d.category || "dossier",
    name: d.name,
    website: d.domain.startsWith("http") ? d.domain : `https://${d.domain}`,
    city: d.geo ?? null,
    email: c.businessEmail ?? null,
    instagram: c.instagram ?? null,
    whatsapp: c.whatsapp ?? null,
    phone: c.businessPhone ?? null,
    booking_link: c.bookingLink ?? null,
    has_chatbot: d.audit.hasChatWidget ?? null,
    has_whatsapp_bot: d.audit.hasWhatsAppBot ?? null,
    lead_offer: d.leadOffer,
    rating: numOrNull(d.googleRating),
    review_count: intOrNull(d.googleReviews),
    authority_score: numOrNull(cv.authorityScore),
    organic_traffic: kmbToInt(cv.organicTraffic),
    traffic_trend: cv.trafficTrend ?? null,
    organic_keywords: kmbToInt(cv.organicKeywords),
    backlinks: kmbToInt(cv.backlinks),
    ref_domains: kmbToInt(cv.refDomains),
    ai_mentions: intOrNull(cv.aiVisibility?.mentions),
    ai_visibility: JSON.stringify(cv.aiVisibility ?? {}),
    competitors: JSON.stringify(cv.competitors ?? []),
    weak_points: JSON.stringify(d.weakPoints ?? []),
    dossier: JSON.stringify(d),
    dossier_summary: d.hook ?? d.pitch ?? null,
  };

  const existing = await q<{ id: string }>(`select id from ${T.prospects} where lower(domain) = $1 limit 1`, [domain]);

  let id: string;
  if (existing.length) {
    id = existing[0].id;
    await q(
      `update ${T.prospects} set
         playbook=$2, name=$3, website=$4, city=$5, email=$6, instagram=$7, whatsapp=$8,
         has_chatbot=$9, has_whatsapp_bot=$10, lead_offer=$11, rating=$12, review_count=$13,
         authority_score=$14, ai_mentions=$15, ai_visibility=$16::jsonb, competitors=$17::jsonb,
         dossier=$18::jsonb, dossier_summary=$19,
         phone=$20, booking_link=$21, organic_traffic=$22, traffic_trend=$23, organic_keywords=$24,
         backlinks=$25, ref_domains=$26, weak_points=$27::jsonb,
         research_status='researched', qual_status='qualified',
         researched_at=now(), updated_at=now()
       where id=$1`,
      [id, vals.playbook, vals.name, vals.website, vals.city, vals.email, vals.instagram, vals.whatsapp,
        vals.has_chatbot, vals.has_whatsapp_bot, vals.lead_offer, vals.rating, vals.review_count,
        vals.authority_score, vals.ai_mentions, vals.ai_visibility, vals.competitors, vals.dossier, vals.dossier_summary,
        vals.phone, vals.booking_link, vals.organic_traffic, vals.traffic_trend, vals.organic_keywords,
        vals.backlinks, vals.ref_domains, vals.weak_points],
    );
  } else {
    const r = await q<{ id: string }>(
      `insert into ${T.prospects}
         (playbook, name, website, domain, city, email, instagram, whatsapp, has_chatbot, has_whatsapp_bot,
          lead_offer, rating, review_count, authority_score, ai_mentions, ai_visibility, competitors,
          dossier, dossier_summary, phone, booking_link, organic_traffic, traffic_trend, organic_keywords,
          backlinks, ref_domains, weak_points, research_status, qual_status, researched_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19,
          $20,$21,$22,$23,$24,$25,$26,$27::jsonb,'researched','qualified',now())
       returning id`,
      [vals.playbook, vals.name, vals.website, domain, vals.city, vals.email, vals.instagram, vals.whatsapp,
        vals.has_chatbot, vals.has_whatsapp_bot, vals.lead_offer, vals.rating, vals.review_count,
        vals.authority_score, vals.ai_mentions, vals.ai_visibility, vals.competitors, vals.dossier, vals.dossier_summary,
        vals.phone, vals.booking_link, vals.organic_traffic, vals.traffic_trend, vals.organic_keywords,
        vals.backlinks, vals.ref_domains, vals.weak_points],
    );
    id = r[0].id;
  }

  // Contacts — replace the set for this prospect.
  await q(`delete from ${T.contacts} where prospect_id = $1`, [id]);
  const people = [c.founder, c.decisionMaker2, ...(c.others ?? [])].filter((p): p is DossierContact => !!p);
  for (const p of people) {
    await q(
      `insert into ${T.contacts} (prospect_id, name, role, email, email_status, linkedin_url, instagram, phone, source, confidence, evidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, p.name, p.role, p.email ?? null, p.email ? "valid_domain" : null, p.linkedin ?? null, null,
        p.phone ?? null, p.source ?? "dossier", p.linkedinVerified ? 0.9 : 0.6, null],
    );
  }

  // One audit row capturing the rendered-page signals + the diagnosis.
  // Replace (not append) so re-recording the same prospect doesn't pile up audit rows.
  await q(`delete from ${T.audits} where prospect_id = $1`, [id]);
  await q(
    `insert into ${T.audits} (prospect_id, tier, status, classification, lead_offer, signals, top_issues)
     values ($1,'deep','ok',$2,$3,$4::jsonb,$5::jsonb)`,
    [id, d.audit.title ?? null, d.leadOffer, JSON.stringify(d.audit), JSON.stringify(d.topAiProblems ?? [])],
  );

  return id;
}
