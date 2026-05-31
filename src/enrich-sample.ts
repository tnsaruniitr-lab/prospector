import { extractSiteContacts } from "./contact-extract.js";

// Live test of the deterministic site extractor on real clinics — no DB needed.
const SITES = [
  "edenderma.com",        // EDEN — /team lists Dr. Farshad Zadeh (Owner)
  "altaderma.com",        // Dr. Ali Singel (Medical Director)
  "medicalspa-berlin.de", // German Impressum → Geschäftsführer name
  "hortmanclinics.com",   // team page
];

const titles = ["owner", "founder", "medical director", "ceo", "managing director", "geschäftsführer", "principal"];

for (const site of SITES) {
  console.log("\n" + "=".repeat(72) + "\n" + site);
  try {
    const r = await extractSiteContacts(site, { maxPages: 5, timeoutMs: 9000, contactTitles: titles });
    console.log(`pages ${r.pagesScanned.length} · emails [${r.emails.slice(0, 4).join(", ") || "—"}] · whatsapp ${r.whatsapp ?? "—"}`);
    console.log(`socials: IG ${r.socials.instagram ?? "—"} · LinkedIn ${r.socials.linkedin ?? "—"} · booking ${r.bookingLinks[0] ?? "—"}`);
    console.log(`people (${r.people.length}):`);
    for (const p of r.people.slice(0, 7)) {
      console.log(`  - ${(p.name ?? "(generic)").padEnd(26)} ${(p.role ?? "").slice(0, 22).padEnd(22)} ${p.email ?? ""} ${p.linkedinUrl ?? ""}  [${p.confidence.toFixed(2)} ${p.source}]`);
    }
    if (r.notes.length) console.log(`notes: ${r.notes.slice(0, 2).join(" | ")}`);
  } catch (e) {
    console.log("ERROR:", (e as Error).message);
  }
}
