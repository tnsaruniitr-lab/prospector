// Run on a LinkedIn company People page (linkedin.com/company/{slug}/people/),
// logged in. Returns each listed employee's name + role/headline + `/in/` PROFILE
// URL. This is the people-LIST extractor — distinct from linkedin-extract.js, which
// verifies a single /in/ profile. Scrolls first to load the lazy-rendered list.
// Capturing the URL (not just the name) is what lets DM2/founder_linkedin populate.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = () => (document.body && document.body.innerText) || "";
  for (let i = 0; i < 16; i++) { if (/associated member|not found|isn.t available/i.test(T())) break; await wait(1000); }
  for (let s = 0; s < 5; s++) { window.scrollBy(0, 1000); await wait(600); }
  const seen = new Set();
  const out = [];
  for (const a of Array.from(document.querySelectorAll('a[href*="/in/"]'))) {
    const url = (a.href || "").split("?")[0];
    if (!/\/in\/[A-Za-z0-9_%-]+/.test(url) || seen.has(url)) continue;
    seen.add(url);
    const card = a.closest("li") || a.parentElement?.parentElement?.parentElement;
    const txt = (card?.innerText || "").replace(/\s+/g, " ").trim();
    if (txt.length < 4) continue;
    out.push({ name: txt.split(/ {2,}/)[0].slice(0, 40), role: txt.slice(0, 90), url });
  }
  return { found: !/not found|isn.t available/i.test(T()), count: out.length, people: out.slice(0, 12) };
})()
