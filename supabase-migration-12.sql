-- Migration 12: live goals - broadcast goal changes over Supabase Realtime so
-- new/edited/deleted goals show up on the dashboard without a page refresh
-- (same mechanism as chat_messages in migration 5). Safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.goals;
exception
  when duplicate_object then null;
end $$;
