-- prospect-engine schema (Week-1 MVP) — Railway Postgres.
-- A dedicated `prospect` schema; the pg driver reaches it directly.

create extension if not exists pgcrypto;
create schema if not exists prospect;

-- A sourcing run: one ICP playbook against one geography.
create table if not exists prospect.campaigns (
  id          uuid primary key default gen_random_uuid(),
  playbook    text not null,                       -- 'roofing' | 'dental_implants' | 'med_spa'
  city        text not null,
  query       text not null,                       -- the actual Places text query used
  found_count integer not null default 0,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

-- A discovered business.
create table if not exists prospect.prospects (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references prospect.campaigns(id) on delete set null,
  playbook        text not null,
  place_id        text unique,                     -- Google Places id (dedup key)
  name            text not null,
  website         text,
  domain          text,                            -- normalized host (dedup + email guessing)
  phone           text,
  address         text,
  city            text,
  google_maps_uri text,
  rating          numeric,
  review_count    integer,
  types           text[],
  instagram       text,                            -- handle, if discovered during enrichment
  whatsapp         text,                            -- wa.me number detected on site
  has_chatbot      boolean,                         -- chat vendor widget detected
  has_whatsapp_bot boolean,                         -- WhatsApp automation vendor detected
  priority         numeric,                         -- 0-100 Component-1 priority (value × opportunity)
  lead_offer       text,                            -- aeo | bot | attribution (biggest gap)
  qual_status     text not null default 'new',     -- new | qualified | rejected | no_website
  qual_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists prospects_playbook_idx on prospect.prospects(playbook);
create index if not exists prospects_qual_idx     on prospect.prospects(qual_status);

-- A cheap deterministic audit of a prospect's website.
create table if not exists prospect.audits (
  id             uuid primary key default gen_random_uuid(),
  prospect_id    uuid not null references prospect.prospects(id) on delete cascade,
  tier           text not null default 'cheap',    -- cheap | deep
  status         text not null default 'ok',       -- ok | error
  error          text,
  classification text,                             -- SSR | CSR | hybrid | ...
  checks_total   integer,
  pass_count     integer,
  fail_count     integer,
  warn_count     integer,
  na_count       integer,
  pain_score     numeric,                          -- legacy opportunity score (superseded by priority)
  priority       numeric,                          -- 0-100 Component-1 priority
  lead_offer     text,                             -- aeo | bot | attribution
  signals        jsonb,                            -- structured AuditSignals
  bot            jsonb,                            -- BotSignals + chat vendor + pixels
  top_issues     jsonb,                            -- [{id, evidence}] — the outreach hook material
  audited_at     timestamptz not null default now()
);
create index if not exists audits_prospect_idx on prospect.audits(prospect_id);
create index if not exists audits_pain_idx     on prospect.audits(pain_score desc);

-- A contact for a prospect (filled during enrichment / manual research).
create table if not exists prospect.contacts (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references prospect.prospects(id) on delete cascade,
  name         text,
  role         text,
  email        text,
  email_status text,                               -- unverified | valid | risky | invalid
  linkedin_url text,
  instagram    text,
  phone        text,
  source       text,                               -- website | gbp | apollo | license_board | manual
  confidence   numeric,
  created_at   timestamptz not null default now()
);
create index if not exists contacts_prospect_idx on prospect.contacts(prospect_id);

-- An outreach touch (high-touch MVP: mostly logged by hand).
create table if not exists prospect.outreach (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospect.prospects(id) on delete cascade,
  contact_id  uuid references prospect.contacts(id) on delete set null,
  channel     text not null,                       -- email | phone | linkedin | instagram
  status      text not null default 'queued',      -- queued | drafted | sent | replied | bounced | optout
  opener      text,
  notes       text,
  sent_at     timestamptz,
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists outreach_prospect_idx on prospect.outreach(prospect_id);
