-- Migration 5: team board - quick chat + goals on the dashboard.
-- Run in the Supabase SQL editor after migration 4.
-- Both tables are simple team-wide lists: everyone logged in can read and
-- write everything (internal tool, same posture as ads/posts/comments).

-- ======================= chat_messages ==============================
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  body         text not null,
  author_id    uuid references auth.users(id),
  author_email text,
  created_at   timestamptz default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;
drop policy if exists chat_messages_team_all on public.chat_messages;
create policy chat_messages_team_all on public.chat_messages
  for all to authenticated using (true) with check (true);

-- Live chat: broadcast new rows over Supabase Realtime so messages appear
-- without a refresh. Safe to re-run (skips if already added).
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;

-- =========================== goals ==================================
create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  horizon          text not null check (horizon in ('1w', '2w', '1m')),  -- 1 week | 2 weeks | 1 month
  done             boolean default false,
  created_by_email text,
  created_at       timestamptz default now()
);
create index if not exists goals_created_idx on public.goals (created_at desc);

alter table public.goals enable row level security;
drop policy if exists goals_team_all on public.goals;
create policy goals_team_all on public.goals
  for all to authenticated using (true) with check (true);
