import { config } from "./config.js";
import type { NormalizedProspect } from "./types.js";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Field mask controls which fields (and which billing SKU) come back.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.types",
  "nextPageToken",
].join(",");

interface PlacesResponse {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    types?: string[];
  }>;
  nextPageToken?: string;
}

function domainFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Text Search against the Places API (New). Paginates up to `maxPages`
 * (20 results/page, 60 max). `city` is recorded on each result for storage.
 */
export async function searchPlaces(
  query: string,
  city: string,
  maxPages = 3,
): Promise<NormalizedProspect[]> {
  if (!config.GOOGLE_MAPS_API_KEY) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is required for sourcing. Add it to .env (enable 'Places API (New)').",
    );
  }

  const out: NormalizedProspect[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, unknown> = { textQuery: query, pageSize: 20 };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Places API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as PlacesResponse;
    for (const p of data.places ?? []) {
      out.push({
        placeId: p.id,
        name: p.displayName?.text ?? "(unknown)",
        website: p.websiteUri ?? null,
        domain: domainFromUrl(p.websiteUri),
        phone: p.nationalPhoneNumber ?? null,
        address: p.formattedAddress ?? null,
        city,
        googleMapsUri: p.googleMapsUri ?? null,
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? null,
        types: p.types ?? [],
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return out;
}
