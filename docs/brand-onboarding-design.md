# Brand Onboarding Service — Design Doc

**Status:** Designed, not yet built  
**Purpose:** Make `scoreRelevance()` work for ANY company prospecting for itself, not just hardcoded AEO/SEO defaults  
**Location:** `/Users/arunsharma/Documents/New project/prospect-engine`

---

## The Problem

`scoreRelevance()` currently assumes the seller fixes AEO/SEO pain — because that's what was built first. Hand this tool to a CRM vendor, a design agency, or AnswerMonk and the *wording* updates (via `IcpProfile`) but the *scoring logic* is still wrong: it checks weakPoints (AEO gaps), AI mentions, and schema signals — all specific to AI-search pain, not to the new seller's offer.

**The fix:** a one-time onboarding flow that produces a `SellerProfile` stored in the DB, so every relevance verdict is personalised to the actual seller.

---

## Architecture Overview

```
User answers 5 onboarding questions
          ↓
Brand Onboarding Service
  - Parses seller intent (LLM, used ONCE here only)
  - Maps description → 1–3 pain archetypes
  - Human confirms/adjusts the match
          ↓
SellerProfile (stored in DB per workspace)
  - Identity + offer wording
  - Active pain archetypes (1–3)
  - ICP filters (verticals, geo, size)
  - Disqualifier rules
          ↓
scoreRelevance(dossier, sellerProfile)
  - Deterministic per-prospect (no LLM here)
  - Pain score derived from archetype signals
  - Wording from seller profile templates
          ↓
Relevance verdict (highly_relevant / moderate / not_relevant)
```

**Key design principle:** LLM is used ONCE (at onboarding, to map seller description → archetypes). Per-prospect scoring is pure deterministic code — fast, auditable, consistent across thousands of prospects.

---

## Stage 1 — The 5 Onboarding Questions

| # | Question | Purpose |
|---|---|---|
| 1 | "What do you sell?" (one sentence) | Offer identity |
| 2 | "Who is your ideal client?" (industry/size/geo) | ICP filter |
| 3 | "What specific pain do you fix?" (the problem, not the solution) | Pain archetype mapping |
| 4 | "What does a bad-fit prospect look like?" | Disqualifier rules |
| 5 | "What's your proof/USP?" | Value prop hook |

Answers feed into onboarding service → produces SellerProfile.

---

## Stage 2 — Pain Archetype Library

An archetype has exactly 6 components:

### Structure
```
{
  name: string                     // "AI Invisibility"
  triggers: string[]               // plain-English phrases → matched at onboarding
  dossiierSignals: SignalCheck[]   // which dossier fields detect this pain
  scoreFunction: (d: Dossier) => number  // 0-40, deterministic
  disqualifier: (d: Dossier) => boolean  // pain already solved → skip
  valuePropTemplate: string        // pitch sentence with {placeholders}
}
```

### The 6 Starting Archetypes

#### 1. AI Invisibility
- **Seller type:** AEO studios, GEO platforms (AnswerMonk), content agencies
- **Trigger phrases:** "can't get found in ChatGPT", "AI ignores them", "invisible to generative engines", "not cited by AI answers"
- **Dossier signals:** `aiMentions < 30`, `!hasLocalBusiness`, `!hasFAQ`, `weakPoints.length > 3`
- **Score:** `min(40, weakPoints.length × 6 + (aiMentions < 30 ? 12 : 0))`
- **Disqualifier:** `aiMentions > 80 AND weakPoints.length < 2`
- **Value prop template:** `"{sellerName} helps {category} businesses like {name} get cited by ChatGPT — right now {name} has {aiMentions} AI mentions while {leaderDomain} has {leaderMentions}. {sellerFix}."`

#### 2. Conversion Gap
- **Seller type:** CRO agencies, booking platform vendors, chatbot tools, CX tools
- **Trigger phrases:** "good traffic but no bookings", "site visitors don't convert", "no lead capture on the site"
- **Dossier signals:** `!contacts.bookingLink`, `!audit.hasChatWidget`, `!audit.hasWhatsApp`, `!audit.hasAggregateRating`
- **Score:** `min(40, missingConversionElements × 10)` (each missing element = 10)
- **Disqualifier:** `hasChat AND hasBooking AND hasAggregateRating`
- **Value prop template:** `"{name} has traffic but no way to capture it — no booking link, no chat, no reviews widget. {sellerFix}."`

#### 3. Trust Deficit
- **Seller type:** Reputation management, review platforms, PR agencies, personal-brand consultants
- **Trigger phrases:** "prospects don't trust them online", "no social proof", "can't show credentials", "reviews are missing"
- **Dossier signals:** `!audit.hasPerson`, `!audit.hasAggregateRating`, `googleReviews < 20`
- **Score:** `min(40, (hasPerson ? 0 : 15) + (hasAggregateRating ? 0 : 15) + (reviews < 20 ? 10 : 0))`
- **Disqualifier:** `hasPerson AND hasAggregateRating AND googleReviews > 100`

#### 4. Reach Starvation
- **Seller type:** SEO agencies, link-building services, content farms, PR for SEO
- **Trigger phrases:** "not ranking for their keywords", "competitors outranking them", "low organic traffic", "invisible on Google"
- **Dossier signals:** `authorityScore < 15`, `trafficTrend negative (contains "-")`, `organicKeywords < 50`
- **Score:** `min(40, (authority < 15 ? 20 : 0) + (declining ? 12 : 0) + (keywords < 50 ? 8 : 0))`
- **Disqualifier:** `authorityScore > 40 AND trafficTrend positive`

#### 5. Content Thinness
- **Seller type:** Content agencies, ghostwriting, copywriting studios, editorial teams
- **Trigger phrases:** "thin site", "not enough content to rank", "no FAQ or answer pages", "can't compete on long-tail"
- **Dossier signals:** `renderedWords < 500`, `aiCitedPages < 5`, `!hasFAQ`, `organicKeywords < 30`
- **Score:** `min(40, (words < 500 ? 15 : 0) + (citedPages < 5 ? 15 : 0) + (hasFAQ ? 0 : 10))`
- **Disqualifier:** `renderedWords > 1500 AND hasFAQ AND aiCitedPages > 50`

#### 6. Pipeline Absent
- **Seller type:** CRM vendors, sales tools, outreach platforms, SDR-as-a-service
- **Trigger phrases:** "no way to capture leads", "can't follow up with prospects", "no sales process", "owner does everything manually"
- **Dossier signals:** `!contacts.businessEmail`, `!contacts.bookingLink`, `contacts.founder === null (owner not findable)`
- **Score:** `min(40, missingPipelineElements × 13)`
- **Disqualifier:** `hasBookingLink AND hasBusinessEmail AND hasVerifiedDM2`

---

## Stage 3 — SellerProfile Schema (DB table)

```ts
interface SellerProfile {
  id: string
  workspaceId: string          // one profile per workspace/user
  sellerName: string
  offer: string
  valueProp: string
  fixes: string
  targetVerticals: string[]    // playbook ids
  minReviews: number           // budget-proxy floor
  archetypes: string[]         // 1–3 archetype ids from the library
  disqualifiers: string[]      // extra user-defined disqualifiers
  icpGeo?: string[]            // optional geo filter
  isActive: boolean            // only one active at a time
  createdAt: Date
}
```

A user can have multiple profiles (e.g. "AnswerMonk profile" vs "AEO consulting profile") — one active at a time, switchable.

---

## Stage 4 — Multi-Archetype Scoring

When a seller matches more than one archetype (e.g. "we do SEO and AEO"):
- Run each archetype's `scoreFunction` independently
- Take the **higher of the two** as the pain score (not additive — avoids inflation)
- The `valueProp` and `competitiveContext` use the highest-scoring archetype's template
- Show both in the factors list so the seller can see why

---

## The Honest Ceiling

Some sellers have pain that doesn't map to dossier signals — a payroll vendor, a catering supplier, an HR platform. Their prospects' pain isn't visible in a website audit at all.

For those archetypes, the dossier signals would be very thin (only ICP size/vertical matching) and the verdict would be honest: *"we can identify ICP fit but not the specific pain from a web audit — this prospect needs a manual discovery step."*

This is the honest ceiling of a dossier-based relevance system. It should be encoded explicitly rather than pretending the score is more confident than it is.

---

## Build Sequence

1. **Pain archetype library** (`src/archetypes.ts`) — the 6 archetypes above as typed objects with score functions. No DB yet.
2. **Onboarding wizard** — 5-question CLI flow, LLM maps answers → archetype selection, human confirms, stores SellerProfile.
3. **SellerProfile DB table** — migration + loader.
4. **Wire into `scoreRelevance`** — replace `DEFAULT_ICP` with active `SellerProfile` from DB.
5. **For AnswerMonk specifically** — pre-built profile using AI Invisibility archetype, GEO/generative engine wording, higher AI-mentions threshold.

---

## Current State

`scoreRelevance()` uses `DEFAULT_ICP` — hardcoded AEO/SEO seller.  
The `IcpProfile` interface accepts a second argument so profiles are already pluggable.  
The scoring logic is hardcoded to AEO pain — needs the archetype layer to become generic.

**File:** `src/relevance.ts`  
**Default ICP:** `DEFAULT_ICP` in that file — edit this for a quick manual override until the onboarding wizard is built.

---

## Related Files

| File | Role |
|---|---|
| `src/relevance.ts` | `scoreRelevance()` + `DEFAULT_ICP` + `IcpProfile` interface |
| `src/relevance-worklist.ts` | `pnpm relevance` command — ranked outreach list from Railway DB |
| `src/dossier.ts` | `flattenDossier()` — calls `scoreRelevance()` to populate CSV columns 96–101 |
| `src/synthesis.ts` | Vertical-aware diagnosis — `vertical` param already parameterises wording |
| `src/playbooks.ts` | Vertical definitions — `targetVerticals` references these IDs |
