-- Contact-first enrichment fields for the lead factory MVP.

alter table prospect.prospects
  add column if not exists email text,
  add column if not exists linkedin text,
  add column if not exists facebook text,
  add column if not exists tiktok text,
  add column if not exists youtube text,
  add column if not exists x_url text,
  add column if not exists contact_form text,
  add column if not exists booking_link text,
  add column if not exists enrichment_status text not null default 'pending',
  add column if not exists enriched_at timestamptz;

alter table prospect.contacts
  add column if not exists evidence text;

create index if not exists prospects_enrichment_idx on prospect.prospects(enrichment_status);
