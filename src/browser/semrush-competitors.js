// Run on a SEMrush Organic Competitors page
// (https://www.semrush.com/analytics/organic/competitors/?q=DOMAIN&searchType=domain).
// The competitors grid is virtualized (not a real <table>), so parse the visible text:
// after the "Domain  Com. Level  Common Keywords  …" header each row reads
// "<domain> <com.level>% <common kw> <SE kw> …". Returns the top 5 organic competitors.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 16; i++) { if (/Com\.?\s*Level/i.test((document.body && document.body.innerText) || "")) break; await wait(1200); }
  await wait(1500);
  const t = (document.body.innerText || "").replace(/ /g, " ");
  const i = t.search(/Domain\s+Com\.?\s*Level\s+Common\s*Keywords/i);
  const seg = i >= 0 ? t.slice(i) : t;
  const re = /([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\s+(\d+)%\s+(\d+)\s+(\d+)/gi;
  const out = []; let m;
  while ((m = re.exec(seg)) && out.length < 8) {
    out.push({ domain: m[1], commonLevel: m[2] + "%", keywords: parseInt(m[3], 10) });
  }
  return out.slice(0, 5);
})()
