-- Migration 16: kpi_snapshots - one row per day of the numbers that matter,
-- so the dashboard can draw funnel + traffic (and later revenue) trends the
-- frontend can read directly. Run in the Supabase SQL editor after migration
-- 15. Safe to re-run.
--
-- Why a table: PostHog is not reachable from the browser here (RLS-free anon
-- key can't query it, and the account differs - see CLAUDE.md), so the daily
-- cron pulls the numbers and stamps one snapshot row here for the app to read.
--
-- One row = one day. `metrics` is an open jsonb so new number sources slot in
-- WITHOUT a schema change - today it holds `traffic` and `funnel`; when Stripe
-- lands it just gains a `revenue` key. scripts/snapshot-kpis.mjs writes it
-- (service key, merges keys so different sources never clobber each other).

create table if not exists public.kpi_snapshots (
  day        date primary key,
  metrics    jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.kpi_snapshots enable row level security;
drop policy if exists kpi_snapshots_team_all on public.kpi_snapshots;
create policy kpi_snapshots_team_all on public.kpi_snapshots
  for all to authenticated using (true) with check (true);
