-- Ad Tracker - database schema.
-- Run this in the Supabase SQL editor once, then create the storage bucket
-- (see README). Team-shared model: any signed-in team member can read/write all
-- rows (it's an internal tool, not a public product). Tighten later if needed.

-- ============================ ads ==================================
create table if not exists public.ads (
  id           uuid primary key default gen_random_uuid(),
  brand        text,
  platform     text,
  format       text default 'image',       -- image | video
  media_path   text,                        -- path in the 'ad-media' storage bucket
  hook         text,
  ad_copy      text,
  landing_url  text,
  status       text default 'running',      -- running | dead | saved
  verdict      text default 'unsure',       -- winner | loser | testing | unsure
  tags         text[] default '{}',
  metrics      jsonb default '{}'::jsonb,    -- optional { spend, ctr, cpc, roas, ... }
  added_by       uuid references auth.users(id),
  added_by_email text,                        -- shown in the UI: who added this ad
  created_at   timestamptz default now()
);
create index if not exists ads_created_idx on public.ads (created_at desc);
create index if not exists ads_verdict_idx on public.ads (verdict);

-- ========================== comments ================================
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  ad_id        uuid references public.ads(id) on delete cascade,
  body         text not null,
  author_id    uuid references auth.users(id),
  author_email text,
  created_at   timestamptz default now()
);
create index if not exists comments_ad_idx on public.comments (ad_id);

-- ============================ RLS ===================================
alter table public.ads enable row level security;
alter table public.comments enable row level security;

-- Internal team tool: any authenticated user can do everything.
drop policy if exists ads_team_all on public.ads;
create policy ads_team_all on public.ads
  for all to authenticated using (true) with check (true);

drop policy if exists comments_team_all on public.comments;
create policy comments_team_all on public.comments
  for all to authenticated using (true) with check (true);
