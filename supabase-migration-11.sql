-- Migration 11: @mentions in team chat.
-- Run in the Supabase SQL editor after migration 10.
--
-- Typing @name in the chat composer resolves to the mentioned person's email
-- and is stored alongside the message so it can be queried without parsing
-- the body text (used to highlight "you were mentioned" in the UI, and by
-- scripts/chat.mjs --mentions so Claude can check whether it was tagged).

alter table public.chat_messages add column if not exists mentions text[] default '{}';
create index if not exists chat_messages_mentions_idx on public.chat_messages using gin (mentions);
