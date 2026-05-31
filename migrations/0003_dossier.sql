-- Deep-research dossier fields (browser + SEMrush). Additive on prospects,
-- plus a full dossier blob for the rendered brief.

alter table prospect.prospects
  add column if not exists authority_score   numeric,
  add column if not exists organic_traffic   integer,
  add column if not exists traffic_trend     text,
  add column if not exists organic_keywords  integer,
  add column if not exists backlinks         integer,
  add column if not exists ref_domains       integer,
  add column if not exists ai_mentions       integer,
  add column if not exists ai_visibility     jsonb,   -- {chatgpt, gemini, aiOverview, citedPages}
  add column if not exists competitors       jsonb,   -- [{domain, commonLevel, keywords}]
  add column if not exists weak_points       jsonb,   -- [{gap, evidence, impact}]
  add column if not exists dossier           jsonb,   -- full Dossier object
  add column if not exists dossier_summary   text,
  add column if not exists research_status   text not null default 'pending',  -- pending | researched | skipped
  add column if not exists researched_at     timestamptz;

create index if not exists prospects_research_idx on prospect.prospects(research_status);
