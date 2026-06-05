/**
 * Deterministic business-email + contact finder.
 *
 *   npx tsx src/find-contacts.ts <domain-or-url>
 *
 * Wraps extractSiteContacts() — which crawls /contact, /kontakt, /impressum, /about,
 * /team and parses mailto: links + visible text — so business_email is captured
 * reliably instead of being eyeballed off the homepage (the old sparse path).
 */
import { extractSiteContacts } from "./contact-extract.js";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: npx tsx src/find-contacts.ts <domain-or-url>");
  process.exit(1);
}

// generic mailbox prefixes → business_email; anything else → likely a person.
const GENERIC = new Set([
  "info", "contact", "kontakt", "hello", "hallo", "office", "mail", "email", "e-mail",
  "praxis", "team", "welcome", "service", "reception", "admin", "empfang", "post", "moin",
  "enquiries", "enquiry", "inquiries", "bookings", "booking", "appointments", "hi",
]);
const prefix = (e: string) => (e.split("@")[0] ?? "").toLowerCase();

const r = await extractSiteContacts(arg, { maxPages: 8 });
const emails = [...new Set((r.emails ?? []).map((e) => e.toLowerCase()))];
const business = emails.find((e) => GENERIC.has(prefix(e))) ?? emails[0] ?? null;
const personal = emails.find((e) => !GENERIC.has(prefix(e))) ?? null;

console.log(
  JSON.stringify(
    {
      input: arg,
      pagesScanned: r.pagesScanned,
      business_email: business,
      founder_email_candidate: personal,
      other_emails: emails.filter((e) => e !== business),
      business_phone: r.phones?.[0] ?? null,
      whatsapp: r.whatsapp ?? null,
      socials: r.socials ?? null,
      booking_link: r.bookingLinks?.[0] ?? null,
      people: (r.people ?? []).slice(0, 6).map((p) => ({
        name: p.name,
        role: p.role,
        email: p.email,
        linkedin: p.linkedinUrl,
      })),
      notes: r.notes,
    },
    null,
    2,
  ),
);
