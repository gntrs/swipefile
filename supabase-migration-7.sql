-- Migration 7: team availability calendar.
-- Run in the Supabase SQL editor after migration 6.
--
-- Each row is one block of time on one day for one person: "in office",
-- "work from home", or "out". Times are stored as minutes-from-midnight
-- (wall-clock, timezone-free) so a weekly schedule stays simple: a block is
-- just day + start_min..end_min + status. Everyone can read the whole team's
-- week; you may only add / change / remove your OWN blocks.

create table if not exists public.availability (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,                        -- shown in the UI: whose block this is
  day        date not null,               -- the calendar day
  start_min  int  not null,               -- minutes from midnight, 0..1440
  end_min    int  not null,               -- minutes from midnight, > start_min
  status     text not null default 'in_office'
             check (status in ('in_office', 'wfh', 'out')),
  note       text,
  created_at timestamptz default now(),
  check (start_min >= 0 and end_min <= 1440 and end_min > start_min)
);
create index if not exists availability_day_idx on public.availability (day);
create index if not exists availability_user_idx on public.availability (user_id);

alter table public.availability enable row level security;

-- Everyone on the team sees everyone's week.
drop policy if exists availability_read_all on public.availability;
create policy availability_read_all on public.availability
  for select to authenticated using (true);

-- You may only create / edit / delete your own blocks.
drop policy if exists availability_insert_own on public.availability;
create policy availability_insert_own on public.availability
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists availability_update_own on public.availability;
create policy availability_update_own on public.availability
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists availability_delete_own on public.availability;
create policy availability_delete_own on public.availability
  for delete to authenticated using (auth.uid() = user_id);
