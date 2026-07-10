-- Migration 3: team profiles (nickname + avatar).
-- Run in the Supabase SQL editor after migration 2.
-- A row is auto-created by the app on first login (id + email); each member can
-- edit only their OWN profile, everyone can read all (needed to show nicknames
-- and avatars across the app).

create table if not exists public.team (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nickname    text,
  avatar_path text,                 -- stored in the 'ad-media' bucket under avatars/
  created_at  timestamptz default now()
);

alter table public.team enable row level security;

drop policy if exists team_read_all on public.team;
create policy team_read_all on public.team
  for select to authenticated using (true);

drop policy if exists team_insert_own on public.team;
create policy team_insert_own on public.team
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists team_update_own on public.team;
create policy team_update_own on public.team
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
