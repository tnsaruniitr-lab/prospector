import { completeContact } from "./contact-complete.js";
import type { DossierContact } from "./dossier.js";

// Repeatable contact completion run live on BOTH Altaderma decision-makers.
// LinkedIn URLs were captured from the LinkedIn company People page; this fills
// the emails (pattern + MX verification) — no API key required.
const decisionMakers: DossierContact[] = [
  { name: "Maj. Gen. Dr. Ali Singel", role: "Medical Director / Owner", linkedin: "https://www.linkedin.com/in/major-general-dr-ali-singel-50488420/", linkedinVerified: true },
  { name: "Joelle Merhi", role: "Manager (clinic operations)", linkedin: "https://www.linkedin.com/in/joelle-merhi-13b744b2", linkedinVerified: false },
];

for (const dm of decisionMakers) {
  const c = await completeContact(dm, { domain: "altaderma.com", business: "Altaderma", city: "Dubai" });
  console.log(`\n${c.name} — ${c.role}`);
  console.log(`  LinkedIn:   ${c.linkedin ?? "—"}${c.linkedinVerified ? "  (verified)" : ""}`);
  console.log(`  Email:      ${c.email ?? "—"}  [${c.emailStatus ?? "—"}]`);
  console.log(`  Candidates: ${(c.emailCandidates ?? []).join(", ") || "—"}`);
}
console.log("");
