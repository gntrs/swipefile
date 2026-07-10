-- Migration 9: briefs - Claude's analysis summaries, saved into the dashboard.
-- Run in the Supabase SQL editor after migration 8.
--
-- Every time Claude Code delivers an analysis (ads autopsy, funnel findings,
-- competitor read), a copy lands here via scripts/add-brief.mjs so the team
-- can reread it on their phones and Claude can reread it next session.

create table if not exists public.briefs (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text not null,          -- plain text, whitespace preserved
  added_by_email text default 'claude@analysis',
  created_at     timestamptz default now()
);
create index if not exists briefs_created_idx on public.briefs (created_at desc);

alter table public.briefs enable row level security;
drop policy if exists briefs_team_all on public.briefs;
create policy briefs_team_all on public.briefs
  for all to authenticated using (true) with check (true);

-- ============================ goals =================================
-- Claude writes action items straight into goals (created_by_email
-- 'claude@analysis', shown as "by Claude"). urgent = red tag in the UI;
-- brief_id links a goal to the brief that explains it - tapping the goal
-- opens that brief expanded and highlighted.
alter table public.goals add column if not exists urgent boolean default false;
alter table public.goals add column if not exists brief_id uuid references public.briefs(id) on delete set null;
