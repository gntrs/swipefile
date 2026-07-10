-- Migration 17: sales - one row per Stripe payment, the live feed behind the
-- dashboard revenue counter + per-sale confetti. Filled by
-- scripts/stripe-pull.mjs (cron, service key); the browser only reads.
-- Aggregates (MRR, lifetime gross) live in kpi_snapshots.metrics.revenue,
-- exactly the key migration 16 reserved for Stripe.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  stripe_id text not null unique,          -- Stripe charge id (dedupe key)
  amount numeric not null,                 -- major units, e.g. 12.99
  currency text not null default 'eur',
  product text,                            -- price nickname / product name if known
  paid_at timestamptz not null,            -- Stripe charge created time
  created_at timestamptz not null default now()
);

alter table public.sales enable row level security;

-- Internal tool: any logged-in teammate can read; only the service key writes.
create policy "sales readable by team"
  on public.sales for select
  to authenticated
  using (true);

-- Live per-sale events for the dashboard confetti.
alter publication supabase_realtime add table public.sales;
