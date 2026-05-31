// In-page AEO/SEO audit. Inject into a prospect's rendered homepage via the
// browser JS tool; returns a structured gap report of what Google + AI engines
// actually see (post-JavaScript). More accurate than raw-HTML fetch on modern
// (Wix/React/SPA) sites.
(() => {
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const meta = (n) => {
    const el = document.querySelector(`meta[name="${n}"]`) || document.querySelector(`meta[property="${n}"]`);
    return el ? el.getAttribute("content") : null;
  };
  const ld = qa('script[type="application/ld+json"]')
    .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
    .filter(Boolean);
  const types = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (o["@type"]) types.push([].concat(o["@type"]).join(","));
      if (o["@graph"]) walk(o["@graph"]);
      Object.values(o).forEach((v) => { if (v && typeof v === "object") walk(v); });
    }
  };
  ld.forEach(walk);
  const allLd = JSON.stringify(ld);
  const title = document.title || "";
  const desc = meta("description") || "";
  const h1 = qa("h1").map((h) => (h.textContent || "").trim()).filter(Boolean);
  const text = (document.body && document.body.innerText) || "";
  const imgs = qa("img");
  return {
    url: location.href,
    title, titleLen: title.length,
    metaDescription: desc.slice(0, 160), metaDescLen: desc.length,
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    lang: document.documentElement.lang || null,
    hreflang: qa("link[rel=alternate][hreflang]").map((l) => l.getAttribute("hreflang")),
    viewport: !!meta("viewport"),
    robotsMeta: meta("robots"),
    h1Count: h1.length, h1: h1.slice(0, 3), h2Count: qa("h2").length,
    og: { title: meta("og:title"), image: !!meta("og:image") },
    jsonLdBlocks: ld.length,
    schemaTypes: Array.from(new Set(types)),
    hasLocalBusiness: /LocalBusiness|MedicalBusiness|MedicalClinic|HealthAndBeauty|Dentist|Physician|LegalService/i.test(allLd),
    hasFAQ: /FAQPage/i.test(allLd),
    hasPerson: /"Person"|Physician/i.test(allLd),
    hasAggregateRating: /aggregateRating/i.test(allLd),
    renderedWords: text.trim() ? text.trim().split(/\s+/).length : 0,
    images: imgs.length,
    imagesNoAlt: imgs.filter((i) => !i.getAttribute("alt") || !i.getAttribute("alt").trim()).length,
    // bot/chat + booking widgets (product-fit + AEO context)
    hasChatWidget: /intercom|tawk|tidio|crisp|drift|livechat|freshchat|zendesk|chatwoot/i.test(document.documentElement.innerHTML),
    hasWhatsApp: /wa\.me\/|api\.whatsapp\.com/i.test(document.documentElement.innerHTML),
  };
})()
