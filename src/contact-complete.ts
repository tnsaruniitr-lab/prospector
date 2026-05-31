import { verifyEmail } from "./verify.js";
import { findFounderLinkedIn } from "./linkedin-find.js";
import type { DossierContact } from "./dossier.js";

/** Ordered email-pattern candidates for a person at a domain (most-likely first). */
export function emailCandidates(fullName: string, domain: string): string[] {
  const parts = fullName
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms|maj|gen|major|general|sir|dame)\.?\b/g, " ")
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

export interface CompletedContact extends DossierContact {
  emailCandidates?: string[];
  emailStatus?: string;
}

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

  // 2. Email — derive patterns + verify the domain accepts mail
  if (!out.email && contact.name && domain) {
    const candidates = emailCandidates(contact.name, domain);
    out.emailCandidates = candidates;
    out.emailStatus = candidates.length ? await verifyEmail(candidates[0]) : "unverified";
    if (out.emailStatus === "valid_domain" && candidates.length) {
      out.email = candidates[0]; // best-guess pattern on a mail-accepting domain
    }
  } else if (out.email) {
    out.emailStatus = await verifyEmail(out.email);
  }

  return out;
}
