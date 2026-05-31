import { config } from "./config.js";
import type { ExtractedContact } from "./types.js";

const PEOPLE_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/search";
const PEOPLE_MATCH_URL = "https://api.apollo.io/api/v1/people/match";

interface ApolloSearchPerson {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  last_name_obfuscated?: string | null;
  name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  email_status?: string | null;
  has_email?: boolean;
  has_direct_phone?: string | null;
  phone_numbers?: Array<{ raw_number?: string | null; sanitized_number?: string | null }>;
}

interface ApolloSearchResponse {
  people?: ApolloSearchPerson[];
}

interface ApolloMatchResponse {
  person?: ApolloSearchPerson;
}

function headers() {
  return {
    "accept": "application/json",
    "content-type": "application/json",
    "cache-control": "no-cache",
    "x-api-key": config.APOLLO_API_KEY ?? "",
  };
}

function personName(p: ApolloSearchPerson): string | null {
  if (p.name) return p.name;
  const last = p.last_name ?? p.last_name_obfuscated;
  const name = [p.first_name, last].filter(Boolean).join(" ").trim();
  return name || null;
}

function phoneFromPerson(p: ApolloSearchPerson): string | null {
  return p.phone_numbers?.map((n) => n.sanitized_number ?? n.raw_number).find(Boolean) ?? null;
}

function confidence(p: ApolloSearchPerson, enriched: boolean) {
  let c = enriched ? 0.82 : 0.68;
  if (p.email && p.email_status === "verified") c += 0.12;
  else if (p.email) c += 0.06;
  if (p.linkedin_url) c += 0.08;
  if (p.title && /founder|owner|ceo|partner|director|manager/i.test(p.title)) c += 0.05;
  return Math.min(c, 0.96);
}

function toContact(p: ApolloSearchPerson, enriched: boolean): ExtractedContact | null {
  const name = personName(p);
  if (!name && !p.linkedin_url && !p.email) return null;
  return {
    name,
    role: p.title ?? null,
    email: p.email ?? null,
    phone: phoneFromPerson(p),
    linkedinUrl: p.linkedin_url ?? null,
    instagram: null,
    source: enriched ? "apollo_enrich" : "apollo_search",
    confidence: confidence(p, enriched),
    evidence: enriched
      ? "Apollo people enrichment match"
      : "Apollo people search by company domain/title",
  };
}

async function enrichApolloPerson(id: string, domain: string): Promise<ExtractedContact | null> {
  const url = new URL(PEOPLE_MATCH_URL);
  url.searchParams.set("id", id);
  url.searchParams.set("domain", domain);
  url.searchParams.set("reveal_personal_emails", String(config.APOLLO_REVEAL_EMAILS));
  url.searchParams.set("reveal_phone_number", String(config.APOLLO_REVEAL_PHONES));
  url.searchParams.set("run_waterfall_email", String(config.APOLLO_REVEAL_EMAILS));
  url.searchParams.set("run_waterfall_phone", String(config.APOLLO_REVEAL_PHONES));

  const res = await fetch(url, { method: "POST", headers: headers() });
  if (!res.ok) return null;
  const data = (await res.json()) as ApolloMatchResponse;
  return data.person ? toContact(data.person, true) : null;
}

export async function searchApolloContacts(opts: {
  domain: string | null;
  city: string | null;
  contactTitles: string[];
  limit?: number;
}): Promise<ExtractedContact[]> {
  if (!config.APOLLO_API_KEY || !opts.domain) return [];

  const url = new URL(PEOPLE_SEARCH_URL);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(Math.min(opts.limit ?? 5, 10)));
  url.searchParams.append("q_organization_domains_list[]", opts.domain);

  for (const seniority of ["owner", "founder", "c_suite", "partner", "head", "director", "manager"]) {
    url.searchParams.append("person_seniorities[]", seniority);
  }
  for (const title of opts.contactTitles.slice(0, 20)) {
    url.searchParams.append("person_titles[]", title);
  }
  if (opts.city) url.searchParams.append("organization_locations[]", opts.city);

  const res = await fetch(url, { method: "POST", headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[apollo] ${opts.domain} search failed: ${res.status} ${text.slice(0, 160)}`);
    return [];
  }

  const data = (await res.json()) as ApolloSearchResponse;
  const searchContacts = (data.people ?? [])
    .map((p) => toContact(p, false))
    .filter((c): c is ExtractedContact => !!c);

  if (!config.APOLLO_ENRICH) return searchContacts;

  const enriched: ExtractedContact[] = [];
  for (const p of (data.people ?? []).slice(0, opts.limit ?? 5)) {
    if (!p.id) continue;
    const hit = await enrichApolloPerson(p.id, opts.domain);
    if (hit) enriched.push(hit);
  }

  return enriched.length ? enriched : searchContacts;
}
