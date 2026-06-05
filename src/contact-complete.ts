import { verifyEmail } from "./verify.js";
import { findFounderLinkedIn } from "./linkedin-find.js";
import type { DossierContact } from "./dossier.js";

/** Ordered email-pattern candidates for a person at a domain (most-likely first). */
export function emailCandidates(fullName: string, domain: string): string[] {
  const parts = fullName
    .split(",")[0] // drop credentials after a comma ("Nicole Habib, MMS, PA-C" → "Nicole Habib")
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue").replace(/ß/g, "ss") // German transliteration (Büchle → Buechle)
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip remaining diacritics (é→e, ñ→n)
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms|maj|gen|major|general|sir|dame|md|do|dds|dmd|rn|np|pa|msn|mms|mba|bsn|facs|faad|phd|esq)\.?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const d = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!parts.length || !d) return [];
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const fi = first[0], li = last ? last[0] : "";
  const pats = new Set<string>();
  if (first && last) {
    pats.add(`${first}.${last}@${d}`);
    pats.add(`${first}${last}@${d}`);
    pats.add(`${fi}${last}@${d}`);
    pats.add(`${first}${li}@${d}`);
    pats.add(`${fi}.${last}@${d}`);
  }
  pats.add(`${first}@${d}`);
  if (last) pats.add(`${last}@${d}`);
  return [...pats];
}

// emailCandidates + emailStatus are now part of DossierContact.
export type CompletedContact = DossierContact;

/**
 * Repeatable contact completer — fills a contact's missing LinkedIn + email.
 * Deterministic and reusable for ANY decision-maker (founder, DM2, …):
 *   1. LinkedIn via web search (SerpAPI) when missing and a key is present
 *   2. email via pattern derivation + MX-domain verification (no key needed)
 * Mailbox-level verification (does the exact inbox exist) needs an API
 * (Apollo/Hunter/ZeroBounce); until then `valid_domain` = the domain accepts mail.
 */
export async function completeContact(
  contact: DossierContact,
  opts: { domain?: string | null; business?: string; city?: string | null },
): Promise<CompletedContact> {
  const out: CompletedContact = { ...contact };
  const domain = (opts.domain ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  // 1. LinkedIn (search) if missing
  if (!out.linkedin && contact.name) {
    const li = await findFounderLinkedIn(contact.name, opts.business, opts.city);
    if (li) { out.linkedin = li.url; out.linkedinVerified = false; }
  }

  // 2. Email — prefer an already-captured address (published on-site, or Apollo-verified
  //    passed in via contact.email/emailStatus). Only as a LAST resort derive a pattern,
  //    and when we do, label it `valid_domain_guess` so it is never mistaken for a real
  //    mailbox. The accurate path (mailbox-confirmed) is Apollo, done in the browser.
  if (out.email) {
    // Keep an explicit status if the caller already set one (published / apollo_verified).
    if (!out.emailStatus) {
      out.emailStatus = (await verifyEmail(out.email)) === "valid_domain" ? "valid_domain" : "unverified";
    }
  } else if (contact.name && domain) {
    const candidates = emailCandidates(contact.name, domain);
    out.emailCandidates = candidates;
    const domainOk = candidates.length ? await verifyEmail(candidates[0]) : "unverified";
    if (domainOk === "valid_domain" && candidates.length) {
      out.email = candidates[0];
      out.emailStatus = "valid_domain_guess"; // pattern only; domain accepts mail, mailbox NOT confirmed
    } else {
      out.emailStatus = "not_found";
    }
  }

  return out;
}
