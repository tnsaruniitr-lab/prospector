import type { Playbook } from "./types.js";

// Vertical playbooks. Week-1 starts with roofing; dental + med spa are
// wired in so the same pipeline runs them once you're ready.
export const PLAYBOOKS: Record<string, Playbook> = {
  roofing: {
    id: "roofing",
    label: "Roofing / HVAC / Plumbing",
    searchSeeds: ["roofing contractor", "HVAC contractor", "plumber"],
    qualify: { minReviews: 5, maxReviews: 400, minPain: 30 },
    channelPriority: ["phone", "email", "linkedin", "instagram"],
    ownerSources: [
      "state contractor license board (public)",
      "Google Business Profile",
      "website footer / contact page",
      "Apollo",
    ],
    contactTitles: [
      "owner", "founder", "co-founder", "ceo", "president", "general manager",
      "operations manager", "marketing manager",
    ],
    opener: ({ name, city, topIssue, channel }) =>
      channel === "phone"
        ? `Call ${name}: "When folks search 'emergency roof repair ${city}' or ask ChatGPT, you don't come up — ${topIssue}. I recorded a 90-sec teardown, want me to text it?"`
        : `Quick one for ${name}: when someone searches "emergency roof repair ${city}" (or asks an AI assistant), your site isn't surfacing — ${topIssue}. I made a 90-second teardown showing the 3 fixes. Want it?`,
  },

  dental_implants: {
    id: "dental_implants",
    label: "Dental implants / Orthodontics",
    searchSeeds: ["dental implants", "orthodontist", "cosmetic dentist"],
    qualify: { minReviews: 10, maxReviews: 600, minPain: 25 },
    channelPriority: ["email", "linkedin", "phone", "instagram"],
    ownerSources: [
      "practice site 'Meet Dr. X' page",
      "state dental board (public)",
      "Apollo (LinkedIn common)",
      "Instagram",
    ],
    contactTitles: [
      "owner", "founder", "co-founder", "dentist", "orthodontist", "implant dentist",
      "practice owner", "practice manager", "marketing manager",
    ],
    opener: ({ name, city, topIssue }) =>
      `Hi Dr. — patients near ${city} increasingly ask ChatGPT "how much do dental implants cost" before they ever call. ${name}'s site isn't being read cleanly by those tools — ${topIssue} — so a competitor gets quoted instead. I put together a short before/after. Worth a look?`,
  },

  med_spa: {
    id: "med_spa",
    label: "Med spas / Cosmetic clinics",
    searchSeeds: ["med spa", "botox", "medical aesthetics clinic"],
    qualify: { minReviews: 10, maxReviews: 800, minPain: 25 },
    channelPriority: ["instagram", "email", "phone", "linkedin"],
    ownerSources: [
      "Instagram bio (owner + booking link/email)",
      "website",
      "medical director on record (public)",
      "Apollo",
    ],
    contactTitles: [
      "owner", "founder", "co-founder", "medical director", "clinic director",
      "aesthetic doctor", "dermatologist", "practice manager", "marketing manager",
    ],
    opener: ({ name, city, topIssue }) =>
      `Love what ${name} is doing on IG — but the search/AI side is leaking. When people search "best botox ${city}" or ask an assistant, you're hard to surface: ${topIssue}. I did a quick visual + SEO teardown. Want me to send the 3 highest-impact fixes?`,
  },

  law_firm: {
    id: "law_firm",
    label: "Law firms / PI / immigration",
    searchSeeds: ["personal injury lawyer", "immigration lawyer", "law firm"],
    qualify: { minReviews: 8, maxReviews: 900, minPain: 25 },
    channelPriority: ["email", "linkedin", "phone", "instagram"],
    ownerSources: [
      "attorney bio pages",
      "bar profile / public registry",
      "website footer / contact page",
      "Apollo",
    ],
    contactTitles: [
      "founder", "owner", "managing partner", "partner", "principal attorney",
      "attorney", "lawyer", "practice manager", "marketing director",
    ],
    opener: ({ name, city, topIssue }) =>
      `Quick note for ${name}: people researching legal help in ${city} are now asking search and AI tools before they call. Your site has a visibility gap — ${topIssue}. I mapped the 3 fixes that would make your practice-area pages easier for Google and AI assistants to cite. Worth sending over?`,
  },

  private_clinic: {
    id: "private_clinic",
    label: "Private clinics / Chiro / Physio",
    searchSeeds: ["private clinic", "chiropractor", "physiotherapy clinic"],
    qualify: { minReviews: 8, maxReviews: 700, minPain: 25 },
    channelPriority: ["email", "phone", "instagram", "linkedin"],
    ownerSources: [
      "practitioner/team pages",
      "clinic site footer / contact page",
      "public provider listings",
      "Apollo",
    ],
    contactTitles: [
      "owner", "founder", "clinic director", "medical director", "physiotherapist",
      "chiropractor", "practice manager", "marketing manager",
    ],
    opener: ({ name, city, topIssue }) =>
      `Hi — ${name} looks like a strong clinic locally, but the site is leaving search/AI visibility on the table: ${topIssue}. For patients asking "best physio/chiro near me in ${city}", those details matter. I made a short audit with the top fixes. Want me to send it?`,
  },
};

export function getPlaybook(id: string): Playbook {
  const p = PLAYBOOKS[id];
  if (!p) {
    const ids = Object.keys(PLAYBOOKS).join(", ");
    throw new Error(`Unknown playbook "${id}". Available: ${ids}`);
  }
  return p;
}
