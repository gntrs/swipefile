-- Migration 10: chat reactions.
-- Run in the Supabase SQL editor after migration 9.
--
-- One row = one person reacting with one emoji to one chat message.
-- Tapping the same emoji again removes the row (toggle). Claude reacts too,
-- via scripts/chat.mjs --react (author_email 'claude@analysis').

create table if not exists public.chat_reactions (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages(id) on delete cascade,
  emoji        text not null,
  author_email text not null,
  created_at   timestamptz default now(),
  unique (message_id, emoji, author_email)
);
create index if not exists chat_reactions_msg_idx on public.chat_reactions (message_id);

alter table public.chat_reactions enable row level security;
drop policy if exists chat_reactions_team_all on public.chat_reactions;
create policy chat_reactions_team_all on public.chat_reactions
  for all to authenticated using (true) with check (true);

-- Live reactions over realtime, same as the messages themselves.
do $$
begin
  alter publication supabase_realtime add table public.chat_reactions;
exception
  when duplicate_object then null;
end $$;
