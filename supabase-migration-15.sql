-- Migration 15: competitors registry - which brands we auto-track, now that
-- competitor ads come straight from the Meta Ad Library API instead of
-- Foreplay. Run in the Supabase SQL editor after migration 14. Safe to re-run.
--
-- Flow: scripts/import-ad-library.mjs seeds this from the old Foreplay Spyder
-- brands on first run, resolves each brand's Meta page_id by searching the
-- Ad Library, then pulls every EU-reached ad per page daily (ads-cron).
-- The team adds/edits brands on /competitors (paste an Ad Library link or a
-- page id); ig_handle feeds scripts/scrape-competitor-posts.mjs weekly.

create table if not exists public.competitors (
  id              uuid primary key default gen_random_uuid(),
  brand           text not null unique,   -- display name, matches ads.brand
  page_id         text,                   -- Meta page id; null = not resolved yet
  ig_handle       text,                   -- instagram handle, no @; feeds the posts scraper
  active          boolean not null default true,  -- false = keep the rows, stop scraping
  notes           text,
  added_by_email  text default 'adlib@import',
  created_at      timestamptz default now(),
  last_scraped_at timestamptz             -- last successful ad/post pull
);

alter table public.competitors enable row level security;
drop policy if exists competitors_team_all on public.competitors;
create policy competitors_team_all on public.competitors
  for all to authenticated using (true) with check (true);
