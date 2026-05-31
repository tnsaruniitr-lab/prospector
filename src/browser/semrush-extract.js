// Run on a SEMrush Domain Overview page
// (https://www.semrush.com/analytics/overview/?q=DOMAIN&searchType=domain).
// SEMrush class names are obfuscated, so we extract by label from visible text.
// Always returns `raw` as a fallback for the agent to parse if a label moves.
(() => {
  const txt = (document.body && document.body.innerText) || "";
  // number that follows a label (often on the next line): "Authority Score\n14"
  const after = (label) => {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = txt.match(new RegExp(esc + "\\s*([0-9][0-9.,]*\\s*[KMB]?)", "i"));
    return m ? m[1].replace(/\s+/g, "") : null;
  };
  // trailing percent trend if present: "Organic Traffic\n118\n-67%"
  const trend = (label) => {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = txt.match(new RegExp(esc + "\\s*[0-9][0-9.,]*\\s*[KMB]?\\s*([+\\-][0-9]+%)", "i"));
    return m ? m[1] : null;
  };
  return {
    domain: (new URLSearchParams(location.search).get("q")) || null,
    authorityScore: after("Authority Score"),
    organicTraffic: after("Organic Traffic"),
    organicTrafficTrend: trend("Organic Traffic"),
    paidTraffic: after("Paid Traffic"),
    refDomains: after("Ref.Domains") || after("Referring Domains"),
    organicKeywords: after("Organic Keywords"),
    organicKeywordsTrend: trend("Organic Keywords"),
    backlinks: after("Backlinks"),
    aiMentions: after("Mentions"),
    aiCitedPages: after("Cited Pages"),
    raw: txt.slice(0, 3500),
  };
})()
