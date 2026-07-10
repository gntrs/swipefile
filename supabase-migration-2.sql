-- Migration 2: organic posts + comments on posts.
-- Run AFTER supabase-schema.sql, in the Supabase SQL editor.

-- ========================== posts ==================================
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  platform       text,                        -- Facebook | Instagram | TikTok | YouTube | Other
  post_type      text default 'post',         -- post | story | reel | video | other
  url            text,
  title          text,                        -- short label / the hook line
  copy           text,                        -- full caption / text
  media_path     text,                        -- optional screenshot in 'ad-media' bucket
  posted_at      date,
  verdict        text default 'unsure',       -- winner | loser | testing | unsure
  tags           text[] default '{}',
  metrics        jsonb default '{}'::jsonb,    -- { views, likes, comments, shares, saves, clicks, signups }
  notes          text,
  added_by       uuid references auth.users(id),
  added_by_email text,
  created_at     timestamptz default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_posted_idx  on public.posts (posted_at desc);

alter table public.posts enable row level security;
drop policy if exists posts_team_all on public.posts;
create policy posts_team_all on public.posts
  for all to authenticated using (true) with check (true);

-- ==================== comments -> posts too =========================
alter table public.comments
  add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.comments
  alter column ad_id drop not null;
create index if not exists comments_post_idx on public.comments (post_id);
