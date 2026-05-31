// LinkedIn founder-profile finder via SerpAPI (Google). Given a founder NAME it
// searches and returns the first linkedin.com/in/ profile whose result text
// matches the name. Reads process.env.SERPAPI_API_KEY directly to stay decoupled
// from the zod config. Returns null with no key or no confident match.

interface SerpResult { title?: string; link?: string; snippet?: string }

function cleanProfile(url: string): string {
  const base = url.split("?")[0].split("#")[0].replace(/\/$/, "");
  const m = base.match(/https?:\/\/[a-z.]*linkedin\.com\/in\/[A-Za-z0-9._%-]+/i);
  return (m ? m[0] : base).replace(/^http:/i, "https:");
}

export async function findFounderLinkedIn(
  name: string,
  business?: string | null,
  city?: string | null,
): Promise<{ url: string; confidence: number } | null> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key || !name) return null;

  const q = [name, business ?? "", city ?? "", "linkedin"].filter(Boolean).join(" ");
  const endpoint = `https://serpapi.com/search.json?engine=google&num=10&q=${encodeURIComponent(q)}&api_key=${key}`;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = (await res.json()) as { organic_results?: SerpResult[] };

    // name-match verification: require the meaningful name words to appear in the result.
    const words = name
      .toLowerCase()
      .replace(/\b(dr|prof|mr|ms|mrs|major|general)\.?\b/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (const r of data.organic_results ?? []) {
      const link = r.link ?? "";
      if (!/linkedin\.com\/in\//i.test(link)) continue;
      const hay = `${r.title ?? ""} ${r.snippet ?? ""}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      if (hits === 0) continue;
      return { url: cleanProfile(link), confidence: hits >= 2 ? 0.8 : 0.55 };
    }
    return null;
  } catch {
    return null;
  }
}
