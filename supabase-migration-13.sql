-- Migration 13: creator finder - scraped Instagram creator leads + the job
-- queue that lets a dashboard button trigger the scraper on your cron box.
-- Run in the Supabase SQL editor after migration 12. Safe to re-run.
--
-- Flow: the Outreach page inserts a scrape_jobs row (status 'pending');
-- creators-cron.sh on your cron box polls every couple of minutes, runs
-- scripts/scrape-creators.mjs --job (Brave Search API), and fills
-- creator_leads. The page streams new leads in and offers one-tap
-- "add to outreach".

create table if not exists public.creator_leads (
  id             uuid primary key default gen_random_uuid(),
  handle         text not null unique,       -- instagram handle, no @
  name           text,                       -- display name from the page title
  url            text not null,              -- instagram.com/<handle>
  platform       text not null default 'instagram',
  followers      integer,                    -- null = count not found in search snippets
  tier           text check (tier in ('nano', 'small', 'mid', 'big')),
  -- nano: under 50k (the ~25k group) · small: 50-100k · mid: 100-250k ·
  -- big: 250k+ (the ~1M group). Null tier = followers unknown, check manually.
  bio            text,                       -- search result snippet
  source_query   text,                       -- which search found them
  status         text not null default 'new' check (status in ('new', 'outreached', 'dismissed')),
  added_by_email text default 'scraper@import',
  created_at     timestamptz default now()
);
create index if not exists creator_leads_created_idx on public.creator_leads (created_at desc);

create table if not exists public.scrape_jobs (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null default 'creators',
  status             text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  params             jsonb default '{}'::jsonb,  -- {queries: [...]} to override the builtin niche queries
  note               text,                       -- result summary or error message
  requested_by_email text,
  created_at         timestamptz default now(),
  finished_at        timestamptz
);
create index if not exists scrape_jobs_status_idx on public.scrape_jobs (status, created_at);

alter table public.creator_leads enable row level security;
drop policy if exists creator_leads_team_all on public.creator_leads;
create policy creator_leads_team_all on public.creator_leads
  for all to authenticated using (true) with check (true);

alter table public.scrape_jobs enable row level security;
drop policy if exists scrape_jobs_team_all on public.scrape_jobs;
create policy scrape_jobs_team_all on public.scrape_jobs
  for all to authenticated using (true) with check (true);

-- Live updates on the Outreach page (same mechanism as chat/goals).
do $$
begin
  alter publication supabase_realtime add table public.creator_leads;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.scrape_jobs;
exception
  when duplicate_object then null;
end $$;
