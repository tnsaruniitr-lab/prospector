-- Prospect relevance grade (computed from the dossier; ranks who to reach out to).
-- Additive only — `priority` (the 0-100 score) already exists from 0001.
alter table prospect.prospects
  add column if not exists grade_tier    text,   -- A | B | C | D
  add column if not exists grade_reasons text;

create index if not exists prospects_priority_idx on prospect.prospects(priority desc nulls last);
