# Configurable Sources + AI Scaffolding — Design

**Status:** design only (no implementation yet). This is the spec to build against.
**Companion docs:** `brand-onboarding-design.md` (seller personas + pain archetypes).

---

## The problem

Today the research pipeline is **hardcoded**: SEMrush (AI module) + LinkedIn + on-page
audit, always, in that order. That's perfect for one seller — an AEO/AI-search studio —
and wrong for everyone else. A web-redesign seller doesn't care about AI visibility; a
recruiter doesn't care about SEMrush at all.

**Goal:** turn the hardcoded pipeline into a **configurable engine** where the seller's
identity drives *which* browser sources run and *what facts* get extracted — and AI does
the heavy lifting of proposing all of it, so the user only reviews and edits.

---

## Non-negotiable principles

1. **Browser-only, never API keys.** Every source is a browser recipe: the user is logged
   into the tool in Chrome → navigate → inject an extractor → read the DOM. SEMrush,
   LinkedIn, Apollo, Crunchbase, PageSpeed — all the same shape. The Research Plan carries
   **no secrets**, ever. The per-source prerequisite is "be logged into X in Chrome," not
   "enter an API key."
2. **Never fabricate** (the golden rule). Unfound = null / not-public. A signal that can't
   be read from the source's screen does not enter the plan.
3. **The Research Plan is the contract** between the webpage (configurator) and the skill
   (executor). Both sides evolve independently as long as they agree on its shape.

---

## Two persona layers — keep them separate

| Layer | What it is | What it drives |
|---|---|---|
| **Seller persona** | What *you* sell ("AI-search visibility", "web redesign", "recruiting") | Which sources matter, scoring weights, pitch language |
| **Prospect vertical** | The *target's* type (med spa, law firm, agency) | Schema/audit expectations |

The seller persona is set **once** in onboarding and reused. The prospect vertical is
inferred per search from "who to find." Existing code already half-implements both:
prospect verticals in `synthesis.ts`; seller persona in `relevance.ts` + the
`seller_profiles` table + the pain archetypes design.

---

## Who decides the sources — proposer / disposer model

Layered ownership. AI proposes; the human bounds and vetoes.

| Layer | Owner | What happens |
|---|---|---|
| 1. **Available tools** | User (set once) | "I'm logged into SEMrush + LinkedIn + Maps." This is the *universe* AI may pick from. AI can't conjure a tool you don't have. |
| 2. **Which to use + why** | AI proposes | Reasons persona → pain → evidence → matching sources, with a justification per source. |
| 3. **Final say** | User overrides | Pin a source as "always," remove one, blacklist one AI must never use. |

Three modes fall out of this:
- **Pure AI** — accept the proposal as-is.
- **Pure hardcode** — pin an exact source list; AI doesn't touch it.
- **Both (default)** — AI proposes, user pins/removes a few, the rest stays AI-driven.

---

## Where the intelligence comes from — "what to find"

This is the core of the product. Today it's hardcoded domain expertise (someone decided
SEMrush AI delta + traffic + ratings prove the AI-invisibility pain). The generalizable
version works **backward from the value proposition**:

> *"What observable facts would PROVE the pain I sell against — and prove this prospect is
> worth selling to?"*

That one question generates the signal list. It derives the current hardcoded set from
first principles:

```
Seller: "I sell AI-search visibility"
  Pain = invisible in AI search
    → proof: ai_mentions (low), ai_delta_vs_leader (big gap), cited_pages (few)
  Worth selling to = budget + established
    → proof: organic_traffic (scale), google_rating + review_count (social proof)
  Where (browser): SEMrush AI module; Google/Maps
```

…and produces a *different* set for a different seller, automatically:

```
Seller: "I sell website redesigns"
  Pain = dated/slow site
    → proof: pagespeed_score (low), mobile_friendly, old copyright_year, table_layouts
  Worth selling to = enough traffic to justify
    → proof: organic_traffic
  Where: PageSpeed (public); the site itself; SEMrush (traffic only)
```

**The method is the intelligence**, not the specific list.

### The Signal Map

The structured definition this produces — editable data, not buried code:

```
SignalMap entry = {
  persona, source,
  signal,            // e.g. "ai_delta_vs_leader"
  meaning,           // "how far behind the category AI leader they are"
  painThreshold,     // "pain if leader > 2× their mentions"
  pitchWeight        // how strong a hook this is (orders the outreach pitch)
}
```

### AI's four roles in generating it

| Role | What it does |
|---|---|
| **Evidence designer** | Turns "what I sell" → the signal list (the derivations above) |
| **Pitch ranker** | Orders signals by outreach power ("AI delta vs leader" beats "has 14 images") |
| **Gap critic** | "You pull traffic but not trend — declining traffic is a stronger pain signal, add it" |
| **Threshold setter** | Proposes what counts as pain ("ai_mentions < 30 = invisible") |

### The honest constraint: feasibility check

AI can suggest any signal — but each must be **actually extractable from that tool's
browser page**. If SEMrush's UI doesn't surface it cleanly, it doesn't go in the plan.
AI proposes; the DOM constrains. This keeps the system honest — no signal that can't
be gathered.

---

## The Research Plan schema (the contract)

Illustrative shape — carries **no API keys**:

```
ResearchPlan = {
  sellerPersona,        // "ai_search_visibility"
  prospectVertical,     // "med_spa"
  region,               // "Berlin, Germany"
  researchSources: [
    { type: "semrush_ai",   enabled: true,  signals: [...], pinned: false },
    { type: "onpage_audit", enabled: true,  signals: [...] },
    { type: "custom",       enabled: false, site, instructions }  // the manual path
  ],
  contactSource: { type: "linkedin", enabled: true },  // or "apollo_browser", "manual"
}
```

- `custom` is the manual path: user provides a site + free-text instructions; Claude
  executes them in the browser with judgment (great fit — instruction-following).
- `contactSource` is browser-only too: `linkedin` (have), `apollo_browser` (logged-in
  Apollo session, navigate + extract — **no key**), `manual`.

---

## The UX loop — minimal input → scaffold → edit → execute

Per-search input is just **who + where**; the persona is a saved setting.

```
User: "med spas in Berlin"
   ↓
AI scaffolds the full Research Plan (sources + signals + thresholds), pre-filled
   ↓
User reviews a PRE-FILLED, EDITABLE plan — toggles/deletes/adds/pins
   ↓
Research runs exactly as it does today, pulling the signals the plan defines
```

The user never sees a blank form — only an AI-proposed plan they refine.

---

## Worked example A — AI-search seller

Setup: persona `AI-search visibility`; tools available: SEMrush, LinkedIn, Maps.
Input: `med spas` + `Berlin`. AI scaffolds:

```
RESEARCH PLAN ── med spas · Berlin · persona: AI-search visibility
├─ SOURCE: SEMrush AI module        [AI-picked: "your pitch IS AI visibility — core evidence"]
│    ├─ ai_mentions          pain if < 30      [edit threshold]
│    ├─ ai_delta_vs_leader   pain if leader>2× [edit]
│    ├─ cited_pages                            [toggle off]
│    ├─ per_engine_split                       [toggle off]
│    └─ organic_traffic+trend scale/budget     [keep]
├─ SOURCE: On-page audit            [AI-picked: "proves WHY invisible — missing schema"]
│    ├─ hasLocalBusiness / hasPerson / hasFAQ
│    ├─ schemaTypes
│    └─ renderedWords         pain if thin
├─ SOURCE: Google Maps              [AI-picked: "rating + reviews = social proof + scale"]
│    ├─ google_rating
│    └─ review_count
└─ CONTACT: LinkedIn (browser)      [AI-picked: "founder + DM2 to reach"]
     ├─ founder (verified)
     └─ dm2 (verified)
```

User edits: removes `per_engine_split`, pins `Google Maps`, tightens `ai_mentions` to <50.
Runs.

## Worked example B — web-redesign seller (same input, different plan)

Swap only the persona to `web redesign`. AI scaffolds a completely different plan —
**no AI-visibility signals at all**:

```
RESEARCH PLAN ── med spas · Berlin · persona: web redesign
├─ SOURCE: PageSpeed (public)       [AI-picked: "speed = your pitch"]
│    ├─ performance_score   pain if < 50
│    └─ mobile_friendly
├─ SOURCE: On-page audit            [AI-picked: "design-age signals"]
│    ├─ copyright_year       pain if old
│    ├─ table_layouts / inline_styles
│    └─ has_viewport
├─ SOURCE: SEMrush (traffic only)   [AI-picked: "scale to justify spend — NOT AI module"]
│    └─ organic_traffic
└─ CONTACT: LinkedIn (browser)      [AI-picked]
```

Same engine, same browser-only principle, different evidence — because the persona changed.
This is the proof the tool generalizes beyond the AEO use case.

---

## Webpage ↔ skill connection

The Research Plan flows through the existing bridge:

```
1. Webpage: user configures → builds Research Plan JSON
2. Webpage → WebSocket → bridge:  { type:"research", researchPlan:{...} }
3. Bridge routes to the user's local agent
4. Agent writes research-plan.json into the skill's working dir
5. Agent invokes Claude: "Run research-prospect using research-plan.json"
6. Skill Stage 0 READS the plan → runs only enabled adapters, chosen contact engine,
   any custom instructions
7. Results flow back: agent → bridge → webpage
```

Webpage = configurator. Bridge = transport. Skill = executor. Research Plan = contract.

---

## Build checklist (in order)

**Phase 0 — Research Plan schema (do first)**
- [ ] Define the plan shape: persona, vertical, region, researchSources[], contactSource, custom
- [ ] Each source entry `{ type, enabled, signals[], pinned }` — **no keys field**
- [ ] Define the `custom` type `{ site, instructions }`
- [ ] Freeze the schema before building against it

**Phase 1 — Persona library + source recipe**
- [ ] Expand seller personas to 5–6, each tied to a pain archetype
- [ ] Each persona declares default research sources + default contact source
- [ ] Build the persona → default-sources lookup
- [ ] Build the Signal Map (persona × source → signals + meaning + threshold + pitch weight)

**Phase 2 — Browser-adapter abstraction in the skill**
- [ ] Refactor SKILL.md: each source = a named browser recipe (navigate + extract)
- [ ] Skill reads the plan, runs only **enabled** adapters in sequence
- [ ] Make the research gate **plan-aware** (don't demand SEMrush if the plan didn't ask)

**Phase 3 — The custom/manual path**
- [ ] Custom adapter: Claude reads `{site, instructions}` and executes in browser
- [ ] Findings recorded into the dossier like any other source

**Phase 4 — Contact source options (all browser)**
- [ ] LinkedIn adapter (have it)
- [ ] Apollo-browser adapter (logged-in session, navigate + extract — no key)
- [ ] Contact source selectable in the plan

**Phase 5 — AI scaffolding + webpage configurator**
- [ ] AI evidence-designer: persona → proposed Signal Map + sources (with reasons)
- [ ] Persona picker → AI auto-fills the plan
- [ ] User can toggle/pin/remove sources + signals, edit thresholds, add custom instructions
- [ ] "Logged into X in Chrome?" checklist per chosen source
- [ ] Produces the Research Plan JSON

**Phase 6 — Webpage ↔ skill connection**
- [ ] Webpage sends plan via the bridge
- [ ] Agent writes research-plan.json
- [ ] Skill Stage 0 reads it and executes accordingly

---

## UATs (acceptance criteria)

| # | Given | When | Then (pass condition) |
|---|---|---|---|
| **U0** | The plan schema | Two plans: one preset, one custom | Both validate; **neither contains an API key** |
| **U1** | A persona is selected | User picks "web redesign" | Sources auto-fill to `[pagespeed, onpage_audit, semrush(traffic), linkedin]` — **SEMrush AI module absent** |
| **U2** | A plan with SEMrush off | Skill runs | Dossier with **no SEMrush section**; gate **accepts it** |
| **U3** | Custom instructions "check pricing tiers + last blog date" | Skill runs custom adapter | Dossier contains exactly those findings, via browser |
| **U4** | `contactSource = apollo_browser`, logged into Apollo | Skill finds contacts | Founder + email **from Apollo's page**, **zero API key** |
| **U5** | Webpage: persona "web redesign", pagespeed off, +1 custom instruction | Click Research | Plan **sent** matches the UI exactly |
| **U6** | A plan configured in the webpage | End-to-end via bridge | Dossier sources **exactly match** the plan |
| **U7** | Any source not selected | Run completes | Dossier records "sources used: [...]" and omits unselected ones (no null-as-data) |
| **U8** | A new persona ("recruiting") | AI scaffolds | Proposes LinkedIn/headcount-based plan, **no SEMrush** |

---

## Definition of Done

- ✅ A new seller persona can be added **by config**, no core rewrite
- ✅ Research runs with **SEMrush OFF** and still produces a valid graded dossier
- ✅ A **fully custom** run (site + instructions, no presets) works end to end
- ✅ Contacts via **LinkedIn or Apollo — both browser, zero keys**
- ✅ Webpage config → plan → skill executes it **faithfully**
- ✅ AI **scaffolds** the plan from persona + who + where; user only edits
- ✅ **No API key field exists anywhere** in the product

---

## The critical path

Everything hangs off **Phase 0 — the Research Plan schema.** The webpage builds it, the
bridge carries it, the skill executes it, AI scaffolds it. Get that contract right and the
rest is adding adapters + persona rows + Signal Map entries on either side. Build the schema
first; freeze it; then everything else is additive.
