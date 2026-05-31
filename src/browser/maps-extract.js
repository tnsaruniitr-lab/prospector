// Inject on a Google Maps search results page
// (https://www.google.com/maps/search/{category}+in+{city}).
// Extracts the business cards from the results feed: name + rating + review count.
//
// NOTE: Google Maps does NOT put the business website in the list cards — it only
// lives in each place's detail panel. So discovery deliberately captures
// name + rating + reviews only; the website is resolved later, at RESEARCH time,
// with a one-shot name search ("{name} {city}" → first real business domain).
// That keeps discovery 100% keyless (no Places API) and cheap (no per-card
// click-through just to seed the queue). Reviews alone value-rank the queue.
(() => {
  const feed = document.querySelector('[role="feed"]') || document.body;
  const links = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
  const seen = new Set();
  const out = [];
  for (const link of links) {
    const name = (link.getAttribute("aria-label") || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const card =
      link.closest('[role="article"]') ||
      link.closest("div[jsaction]") ||
      link.parentElement;
    const txt = (card?.innerText || "").replace(/\s+/g, " ");
    const rm = txt.match(/(\d\.\d)\s*\(?\s*([\d,]+)?\s*\)?/);
    out.push({
      name,
      website: null, // resolved at research time via a keyless name search, not here
      rating: rm ? parseFloat(rm[1]) : null,
      reviews: rm && rm[2] ? parseInt(rm[2].replace(/,/g, ""), 10) : null,
    });
  }
  return out.slice(0, 25);
})()
