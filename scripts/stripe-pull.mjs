// Stripe -> dashboard revenue pipeline. No SDK needed (plain fetch, Stripe's
// REST API), no server: this runs on the WSL cron and writes to the database.
//
//   node scripts/stripe-pull.mjs [--dry-run]
//
// What it does, each run (idempotent):
//   1. Lifetime gross revenue: pages through /v1/charges (succeeded, paid),
//      sums amount - amount_refunded. "Generated", not "paid out" - payouts
//      and Stripe fees don't reduce it.
//   2. MRR: pages through active + trialing subscriptions, normalizes every
//      item to monthly (year/12, week*4.33, day*30.4).
//   3. Upserts one sales row per charge (dedupe on stripe_id) - INSERTs feed
//      the dashboard's realtime confetti.
//   4. Writes today's kpi_snapshots.metrics.revenue = { total_gross, mrr,
//      sales_count, currency } (merged, never clobbers traffic/funnel keys).
//
// Setup (one time):
//   - Stripe dashboard -> Developers -> API keys -> Create RESTRICTED key:
//     Read on Charges + Subscriptions, nothing else. Starts rk_live_...
//   - .env (here AND in the WSL clone): STRIPE_API_KEY=rk_live_...
//   - Apply db-setup.sql, then crontab:
//       */5 * * * * cd $HOME/swipefile && node scripts/stripe-pull.mjs >> .claude-data/stripe-cron.log 2>&1
//
// Every 5 min = a sale shows up (and pops confetti) within 5 min of payment.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STRIPE_KEY = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
const DRY = process.argv.includes('--dry-run');

if (!STRIPE_KEY) {
  console.log('No STRIPE_API_KEY in .env - skipping (see script header for setup).');
  process.exit(0);
}

const supabase = createClient((process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL), (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY), {
  auth: { persistSession: false },
});

async function stripe(path, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function pageAll(path, params = {}) {
  const out = [];
  let starting_after;
  for (;;) {
    const page = await stripe(path, {
      ...params,
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
    });
    out.push(...page.data);
    if (!page.has_more) return out;
    starting_after = page.data[page.data.length - 1].id;
  }
}

// ---- 1. Lifetime gross from charges ----
const charges = await pageAll('charges');
const paid = charges.filter((c) => c.status === 'succeeded' && c.paid);
const byCurrency = {};
for (const c of paid) {
  const net = (c.amount - (c.amount_refunded || 0)) / 100;
  byCurrency[c.currency] = (byCurrency[c.currency] || 0) + net;
}
// Primary currency = the one with the most revenue (in practice: eur).
const primary = Object.entries(byCurrency).sort((a, b) => b[1] - a[1])[0] || ['eur', 0];
const totalGross = Math.round(primary[1] * 100) / 100;

// ---- 2. MRR from active subscriptions ----
const PER_MONTH = { month: 1, year: 1 / 12, week: 4.33, day: 30.4 };
let mrr = 0;
for (const status of ['active', 'trialing']) {
  const subs = await pageAll('subscriptions', { status });
  for (const s of subs) {
    for (const item of s.items?.data || []) {
      const p = item.price;
      if (!p?.unit_amount || !p.recurring) continue;
      const perMonth = PER_MONTH[p.recurring.interval] || 1;
      mrr += ((p.unit_amount / 100) * (item.quantity || 1) * perMonth) / (p.recurring.interval_count || 1);
    }
  }
}
mrr = Math.round(mrr * 100) / 100;

// ---- 2b. Anomaly signals (each needs its own read scope on the restricted
// key; every call degrades to null if the scope wasn't granted). The daily
// ads-cron analysis pass flags these when they move. ----
const optional = async (fn) => {
  try {
    return await fn();
  } catch {
    return null; // scope not granted or endpoint down - not fatal
  }
};
const now = Date.now() / 1000;
const failed30 = charges.filter((c) => c.status === 'failed' && c.created > now - 30 * 86400).length;
const refundedTotal =
  Math.round(charges.reduce((s, c) => s + (c.amount_refunded || 0), 0)) / 100;
const disputes = await optional(async () => {
  const d = await pageAll('disputes');
  return {
    open: d.filter((x) => ['needs_response', 'warning_needs_response', 'under_review'].includes(x.status)).length,
    total: d.length,
  };
});
const balance = await optional(async () => {
  const b = await stripe('balance');
  const sum = (arr) => Math.round((arr || []).reduce((s, x) => s + x.amount, 0)) / 100;
  return { available: sum(b.available), pending: sum(b.pending) };
});

console.log(
  `Stripe: ${paid.length} paid charges, ${totalGross} ${primary[0].toUpperCase()} lifetime gross, MRR ${mrr}` +
    `, failed30d ${failed30}, refunded ${refundedTotal}` +
    (disputes ? `, disputes ${disputes.open} open/${disputes.total} total` : '') +
    (balance ? `, balance ${balance.available} available + ${balance.pending} pending` : '')
);

if (DRY) {
  console.log('[dry-run] newest 5 charges:');
  for (const c of paid.slice(0, 5))
    console.log(
      ` ${new Date(c.created * 1000).toISOString()} ${(c.amount / 100).toFixed(2)} ${c.currency} ${c.description || ''}`
    );
  process.exit(0);
}

// ---- 3. Upsert sales rows (INSERTs trigger the dashboard confetti) ----
const rows = paid.map((c) => ({
  stripe_id: c.id,
  amount: (c.amount - (c.amount_refunded || 0)) / 100,
  currency: c.currency,
  product: c.description || c.calculated_statement_descriptor || null,
  paid_at: new Date(c.created * 1000).toISOString(),
}));
let inserted = 0;
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200);
  const { data, error } = await supabase
    .from('sales')
    .upsert(batch, { onConflict: 'stripe_id', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('sales upsert failed:', error.message);
    break;
  }
  inserted += data?.length || 0;
}
console.log(`sales: ${inserted} new row(s) of ${rows.length} charges.`);

// ---- 4. Merge today's revenue key into kpi_snapshots ----
const day = new Date().toISOString().slice(0, 10);
const { data: existing } = await supabase.from('kpi_snapshots').select('metrics').eq('day', day).maybeSingle();
const metrics = {
  ...(existing?.metrics || {}),
  revenue: {
    total_gross: totalGross,
    mrr,
    sales_count: paid.length,
    currency: primary[0],
    failed_30d: failed30,
    refunded_total: refundedTotal,
    disputes_open: disputes?.open ?? null,
    balance_available: balance?.available ?? null,
    balance_pending: balance?.pending ?? null,
    pulled_at: new Date().toISOString(),
  },
};
const { error: snapErr } = await supabase.from('kpi_snapshots').upsert({ day, metrics }, { onConflict: 'day' });
if (snapErr) console.error('kpi_snapshots merge failed:', snapErr.message);
else console.log(`kpi_snapshots.${day}.revenue updated.`);
