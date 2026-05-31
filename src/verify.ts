import { resolveMx } from "node:dns/promises";

const cache = new Map<string, boolean>();

/**
 * Lightweight email check: syntax + does the domain accept mail (MX records).
 * Not full SMTP deliverability, but it cheaply filters dead domains so we never
 * mark a fabricated/typo'd address as usable.
 *   valid_domain | no_mx | invalid | unverified (no email)
 */
export async function verifyEmail(email: string | null): Promise<string> {
  if (!email) return "unverified";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "invalid";
  const domain = email.split("@")[1].toLowerCase();

  if (cache.has(domain)) return cache.get(domain) ? "valid_domain" : "no_mx";
  try {
    const mx = await resolveMx(domain);
    const ok = mx.length > 0;
    cache.set(domain, ok);
    return ok ? "valid_domain" : "no_mx";
  } catch {
    cache.set(domain, false);
    return "no_mx";
  }
}
