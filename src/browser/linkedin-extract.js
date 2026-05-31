// Run on a LinkedIn profile page (linkedin.com/in/...), logged in. Pulls the
// top-card identity for verification (name, headline, company, location).
// `cardText` is included so the agent can confirm role/company against the
// expected business — the human-in-the-loop accuracy check.
(() => {
  const t = (el) => (el && el.innerText ? el.innerText.trim() : "");
  const name = t(document.querySelector("h1"));
  const txt = (document.querySelector("main")?.innerText || document.body.innerText || "");
  return {
    url: location.href.split("?")[0],
    name: name || null,
    isProfile: /\/in\//.test(location.pathname),
    cardText: txt.replace(/\s+\n/g, "\n").slice(0, 900),
  };
})()
