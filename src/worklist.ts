import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { q, T } from "./db.js";
import { paths } from "./config.js";
import { getPlaybook } from "./playbooks.js";
import type { Playbook } from "./types.js";

interface WorklistOpts { playbookId: string; city?: string; limit?: number }

interface ProspectRow {
  id: string; name: string; website: string | null; phone: string | null;
  email: string | null; whatsapp: string | null; instagram: string | null;
  linkedin: string | null; facebook: string | null; tiktok: string | null;
  youtube: string | null; x_url: string | null; contact_form: string | null;
  booking_link: string | null; city: string | null;
  google_maps_uri: string | null; rating: number | null; review_count: number | null;
  priority: number | null; lead_offer: string | null;
  has_chatbot: boolean | null; has_whatsapp_bot: boolean | null;
  contact_name: string | null; contact_role: string | null; contact_email: string | null;
  contact_phone: string | null; contact_linkedin: string | null; contact_instagram: string | null;
  contact_source: string | null; contact_confidence: number | null;
}
interface AuditRow {
  prospect_id: string; top_issues: { id: string; evidence: string }[] | null;
  classification: string | null; fail_count: number | null; warn_count: number | null;
  signals: {
    aiReadable?: boolean;
    hasValidSchema?: boolean;
    hasPersonSchema?: boolean;
    slowMs?: number | null;
    failCount?: number;
    warnCount?: number;
  } | null;
  audited_at: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const OFFER_LABEL: Record<string, string> = { aeo: "AEO / AI-search", bot: "WhatsApp / chatbot", attribution: "Attribution" };

function topIssueText(a: AuditRow | undefined): string {
  const ev = a?.top_issues?.[0]?.evidence?.trim();
  return ev ? ev.replace(/\s+/g, " ").slice(0, 140) : "key SEO/AEO signals are missing";
}

function issueScores(a: AuditRow | undefined) {
  const s = a?.signals ?? {};
  const fail = s.failCount ?? a?.fail_count ?? 0;
  const warn = s.warnCount ?? a?.warn_count ?? 0;
  const aeo =
    (s.aiReadable === false ? 35 : 0) +
    (s.hasValidSchema === false ? 30 : 0) +
    (s.hasPersonSchema === false ? 15 : 0) +
    Math.min(fail * 4, 20);
  const seo =
    Math.min(fail * 6 + warn * 2, 55) +
    (s.slowMs != null && s.slowMs > 1800 ? 20 : s.slowMs != null && s.slowMs > 800 ? 10 : 0);
  return {
    aeoIssueScore: Math.min(100, aeo),
    seoIssueScore: Math.min(100, seo),
  };
}

/** Ranked, hand-workable worklist (markdown + CSV), highest priority first. */
export async function worklist(opts: WorklistOpts) {
  const playbook = getPlaybook(opts.playbookId);

  const params: unknown[] = [playbook.id];
  let sql = `select p.id, p.name, p.website, p.phone, p.email, p.whatsapp, p.instagram,
                    p.linkedin, p.facebook, p.tiktok, p.youtube, p.x_url, p.contact_form,
                    p.booking_link, p.city, p.google_maps_uri, p.rating, p.review_count,
                    p.priority, p.lead_offer, p.has_chatbot, p.has_whatsapp_bot,
                    c.name as contact_name, c.role as contact_role, c.email as contact_email,
                    c.phone as contact_phone, c.linkedin_url as contact_linkedin,
                    c.instagram as contact_instagram, c.source as contact_source,
                    c.confidence as contact_confidence
             from ${T.prospects} p
             left join lateral (
               select name, role, email, phone, linkedin_url, instagram, source, confidence
               from ${T.contacts}
               where prospect_id = p.id
               order by confidence desc nulls last, created_at desc
               limit 1
             ) c on true
             where p.playbook = $1 and p.qual_status = 'qualified'`;
  if (opts.city) { params.push(opts.city); sql += ` and p.city = $${params.length}`; }
  sql += ` order by p.priority desc nulls last`;
  const prospects = await q<ProspectRow>(sql, params);

  if (!prospects.length) {
    console.log(`[worklist] no qualified prospects for ${playbook.id} yet.`);
    return { count: 0 };
  }

  const ids = prospects.map((p) => p.id);
  const audits = await q<AuditRow>(
    `select prospect_id, top_issues, classification, fail_count, warn_count, signals, audited_at
     from ${T.audits} where prospect_id = any($1::uuid[]) and status = 'ok'
     order by audited_at desc`,
    [ids],
  );
  const latest = new Map<string, AuditRow>();
  for (const a of audits) if (!latest.has(a.prospect_id)) latest.set(a.prospect_id, a);

  const ranked = prospects.slice(0, opts.limit ?? prospects.length).map((p) => ({ p, a: latest.get(p.id) }));

  await mkdir(paths.outputsDir, { recursive: true });
  const base = `${playbook.id}-${slug(opts.city ?? "all")}-worklist`;
  const mdPath = resolve(paths.outputsDir, `${base}.md`);
  const csvPath = resolve(paths.outputsDir, `${base}.csv`);
  await writeFile(mdPath, renderMd(playbook, opts.city, ranked), "utf-8");
  await writeFile(csvPath, renderCsv(ranked), "utf-8");

  console.log(`[worklist] ${ranked.length} qualified prospects, ranked by priority.`);
  console.log(`[worklist]   ${mdPath}`);
  console.log(`[worklist]   ${csvPath}`);
  return { count: ranked.length, mdPath, csvPath };
}

function renderMd(playbook: Playbook, city: string | undefined, ranked: { p: ProspectRow; a: AuditRow | undefined }[]): string {
  const lines: string[] = [
    `# Worklist — ${playbook.label}${city ? ` · ${city}` : ""}`,
    "",
    `${ranked.length} qualified prospects, highest priority first. Each row's **lead offer** is the biggest gap.`,
    "", "---", "",
  ];
  ranked.forEach(({ p, a }, i) => {
    const offer = p.lead_offer ? OFFER_LABEL[p.lead_offer] ?? p.lead_offer : "—";
    const issue = topIssueText(a);
    const opener = playbook.opener({ name: p.name, city: p.city ?? city ?? "your area", topIssue: issue, channel: playbook.channelPriority[0] });
    lines.push(`### ${i + 1}. ${p.name} — priority ${p.priority ?? "?"} · lead: ${offer}`);
    lines.push("");
    lines.push(`- **Best contact:** ${p.contact_name ?? "—"}${p.contact_role ? ` · ${p.contact_role}` : ""} · ${p.contact_email ?? p.email ?? "—"} · ${p.contact_linkedin ?? "—"}`);
    lines.push(`- **Channels:** phone ${p.contact_phone ?? p.phone ?? "—"} · WhatsApp ${p.whatsapp ?? "—"} · IG ${p.contact_instagram ?? p.instagram ?? "—"} · form ${p.contact_form ?? "—"}`);
    lines.push(`- **Reviews:** ${p.review_count ?? "?"} · ${p.rating ?? "?"}★ · **Site:** ${p.website ?? "—"}`);
    lines.push(`- **Bot on site:** chatbot ${p.has_chatbot ? "yes" : "no"} · WhatsApp bot ${p.has_whatsapp_bot ? "yes" : "no"}`);
    if (a?.top_issues?.length) {
      lines.push(`- **Top issues:**`);
      a.top_issues.slice(0, 3).forEach((iss) => lines.push(`  - \`${iss.id}\` — ${iss.evidence.replace(/\s+/g, " ").slice(0, 200)}`));
    }
    lines.push(`- **Opener:** ${opener}`);
    lines.push(`- **Contact (fill in):** founder ____ · email ____ · LinkedIn ____`);
    lines.push("");
  });
  return lines.join("\n");
}

function renderCsv(ranked: { p: ProspectRow; a: AuditRow | undefined }[]): string {
  const header = [
    "rank","priority","lead_offer","aeo_issue_score","seo_issue_score","name","city",
    "reviews","rating","website","business_email","business_phone","whatsapp",
    "instagram","linkedin","facebook","tiktok","youtube","x","contact_form","booking_link",
    "contact_name","contact_role","contact_email","contact_phone","contact_linkedin",
    "contact_instagram","contact_source","contact_confidence","has_chatbot",
    "has_whatsapp_bot","classification","top_issue","maps",
  ];
  const rows = ranked.map(({ p, a }, i) => {
    const scores = issueScores(a);
    return [
      i + 1, p.priority ?? "", p.lead_offer ?? "", scores.aeoIssueScore, scores.seoIssueScore,
      p.name, p.city ?? "", p.review_count ?? "", p.rating ?? "", p.website ?? "",
      p.email ?? "", p.phone ?? "", p.whatsapp ?? "", p.instagram ?? "", p.linkedin ?? "",
      p.facebook ?? "", p.tiktok ?? "", p.youtube ?? "", p.x_url ?? "", p.contact_form ?? "",
      p.booking_link ?? "", p.contact_name ?? "", p.contact_role ?? "",
      p.contact_email ?? "", p.contact_phone ?? "", p.contact_linkedin ?? "",
      p.contact_instagram ?? "", p.contact_source ?? "", p.contact_confidence ?? "",
      p.has_chatbot ? "Y" : "N", p.has_whatsapp_bot ? "Y" : "N",
      a?.classification ?? "", topIssueText(a), p.google_maps_uri ?? "",
    ].map(csvCell).join(",");
  });
  return [header.map(csvCell).join(","), ...rows].join("\n");
}
