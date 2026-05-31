// Inject on a Google Maps search results page
// (https://www.google.com/maps/search/{category}+in+{city}). Extracts the
// business cards from the results feed: name + website + rating + review count.
// Best-effort against Maps' obfuscated DOM; if it returns few results, fall back
// to reading the feed text and structuring candidates manually.
(() => {
  const feed = document.querySelector('[role="feed"]') || document.body;
  const cards = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
  const seen = new Set();
  const out = [];
  for (const link of cards) {
    const name = (link.getAttribute("aria-label") || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const card = link.closest("div[jsaction], div");
    const txt = (card?.innerText || "").replace(/\s+/g, " ");
    const rm = txt.match(/(\d\.\d)\s*\(?\s*([\d,]+)?\s*\)?/);
    const site = card?.querySelector('a[data-value="Website"], a[aria-label*="ebsite"]');
    out.push({
      name,
      website: site ? site.href : null,
      rating: rm ? parseFloat(rm[1]) : null,
      reviews: rm && rm[2] ? parseInt(rm[2].replace(/,/g, ""), 10) : null,
    });
  }
  return out.slice(0, 25);
})()
