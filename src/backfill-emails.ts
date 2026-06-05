/**
 * Backfill business_email (+ phone/WhatsApp/booking/instagram if missing) for every
 * prospect already in the DB, using the site-crawl extractor. Keeps any email already
 * present (manual captures), only fills blanks, never fabricates.
 *
 *   npx tsx src/backfill-emails.ts
 */
import { q, T, pool } from "./db.js";
import { extractSiteContacts } from "./contact-extract.js";
import type { Dossier } from "./dossier.js";

const GENERIC = new Set([
  "info", "contact", "kontakt", "hello", "hallo", "office", "mail", "email", "e-mail",
  "praxis", "team", "welcome", "service", "reception", "admin", "empfang", "post", "moin",
  "enquiries", "enquiry", "inquiries", "bookings", "booking", "appointments", "hi",
]);
const pref = (e: string) => (e.split("@")[0] ?? "").toLowerCase();

const rows = await q<{ domain: string; dossier: Dossier }>(
  `select domain, dossier from ${T.prospects} where dossier is not null order by domain`,
);

let filled = 0, had = 0, none = 0, err = 0;
for (const { domain, dossier } of rows) {
  const c: any = (dossier.contacts ??= {} as any);
  if (c.businessEmail) { had++; console.log(`=  ${domain}  (${c.businessEmail})`); continue; }
  try {
    const r = await extractSiteContacts(domain, { maxPages: 6, timeoutMs: 8000 });
    const emails = [...new Set((r.emails ?? []).map((e) => e.toLowerCase()))];
    const business = emails.find((e) => GENERIC.has(pref(e))) ?? emails[0] ?? null;

    if (!c.businessPhone && r.phones?.[0]) c.businessPhone = r.phones[0];
    if (!c.whatsapp && r.whatsapp) c.whatsapp = r.whatsapp;
    if (!c.instagram && (r.socials as any)?.instagram) c.instagram = (r.socials as any).instagram;
    if (!c.bookingLink && r.bookingLinks?.[0]) c.bookingLink = r.bookingLinks[0];

    if (business) {
      c.businessEmail = business;
      await q(`update ${T.prospects} set dossier=$1::jsonb, email=coalesce(email,$2) where domain=$3`,
        [JSON.stringify(dossier), business, domain]);
      filled++; console.log(`+  ${domain}  ${business}`);
    } else {
      await q(`update ${T.prospects} set dossier=$1::jsonb where domain=$2`, [JSON.stringify(dossier), domain]);
      none++; console.log(`-  ${domain}  (no public email; phone ${r.phones?.[0] ?? "-"})`);
    }
  } catch (e: any) {
    err++; console.log(`!  ${domain}  ERR ${(e?.message ?? "").slice(0, 60)}`);
  }
}
console.log(`\nfilled:${filled}  already-had:${had}  no-public-email:${none}  errors:${err}  total:${rows.length}`);
await pool.end();
