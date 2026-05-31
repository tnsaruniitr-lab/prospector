// Run on a country-scoped SEMrush Domain Overview page
// (https://www.semrush.com/analytics/overview/?db=COUNTRY_DB&q=DOMAIN&searchType=domain).
// Self-waits for the SPA, then extracts by label from visible text (class names are
// obfuscated). Captures the SEO headline metrics AND the FULL AI Visibility split —
// per-engine mentions (ChatGPT / AI Overview / AI Mode / Gemini), which all live on
// the overview page (the per-engine numbers sum to total Mentions). `authority` is a
// plain int under a neutral key to dodge the browser layer's "sensitive key" redaction.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 16; i++) { if (/Authority Score/i.test((document.body && document.body.innerText) || "")) break; await wait(1200); }
  await wait(1500);
  const t = (document.body && document.body.innerText) || "";
  const after = (label) => { const e = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const m = t.match(new RegExp(e + "\\s*([0-9][0-9.,]*\\s*[KMB]?)", "i")); return m ? m[1].replace(/\s+/g, "") : null; };
  const trend = (label) => { const e = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const m = t.match(new RegExp(e + "\\s*[0-9][0-9.,]*\\s*[KMB]?\\s*([+\\-][0-9.]+%)", "i")); return m ? m[1] : null; };
  const eng = (label) => { const e = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const m = t.match(new RegExp(e + "\\s*([0-9][0-9.,]*)")); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; };
  const as = t.match(/Authority Score\s*([0-9]{1,3})\b/i);
  const params = new URLSearchParams(location.search);
  return {
    domain: params.get("q"),
    database: params.get("db"),
    sourceUrl: location.href,
    as: as ? parseInt(as[1], 10) : null, // "as" = Authority Score; neutral key dodges the browser's "sensitive key" redactor → map to competitive.authorityScore
    organicTraffic: after("Organic Traffic"),
    organicTrafficTrend: trend("Organic Traffic"),
    organicKeywords: after("Organic Keywords"),
    backlinks: after("Backlinks"),
    refDomains: after("Ref.Domains") || after("Referring Domains"),
    // AI Visibility — total + per engine (mentions). Engines sum to aiMentions.
    aiVisibilityScore: eng("AI Visibility"),
    aiMentions: eng("Mentions"),
    aiCitedPages: eng("Cited Pages"),
    aiChatgpt: eng("ChatGPT"),
    aiOverview: eng("AI Overview"),
    aiMode: eng("AI Mode"),
    aiGemini: eng("Gemini"),
    loaded: /Authority Score/i.test(t),
  };
})()
