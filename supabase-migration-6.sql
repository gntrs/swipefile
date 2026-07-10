-- Migration 6: creator outreach tracker.
-- Run in the Supabase SQL editor after migration 5.
-- One row per creator contacted for a collab: who, where, and how far the
-- conversation got. Everyone logged in can read and write (internal tool,
-- same posture as ads/posts/comments).

create table if not exists public.outreach (
  id             uuid primary key default gen_random_uuid(),
  creator        text not null,  -- name or @handle
  platform       text not null check (platform in ('email', 'instagram', 'tiktok', 'youtube', 'other')),
  status         text not null default 'sent' check (status in ('sent', 'followup', 'replied', 'deal', 'dead')),
  link           text,           -- profile or thread url
  notes          text,
  added_by       uuid references auth.users(id),
  added_by_email text,
  created_at     timestamptz default now()
);
create index if not exists outreach_created_idx on public.outreach (created_at desc);

alter table public.outreach enable row level security;
drop policy if exists outreach_team_all on public.outreach;
create policy outreach_team_all on public.outreach
  for all to authenticated using (true) with check (true);
