// Morning brief -> Telegram. One push a day: yesterday's numbers, how they moved
// vs the day before, and a motivating line to start the day on. Same voice + same
// bot as the sale alerts. Phone only, no email.
//
// WHY: the sale alerts are the heartbeat; this is the daily standup with yourself.
// You wake up, you see exactly where the business stands, you feel the trend. No
// opening a dashboard, no PostHog - it comes to you before coffee.
//
//   node scripts/morning-brief.mjs             # real run (cron: once a day)
//   node scripts/morning-brief.mjs --dry-run   # print, send nothing
//   node scripts/morning-brief.mjs --test-ping  # send a sample brief now
//
// Reads kpi_snapshots (metrics.traffic / .funnel / .revenue, filled by the
// posthog + stripe crons) and the sales table. Days are keyed UTC to match how
// kpi_snapshots stores them, so "yesterday" = yesterday UTC.
//
// Env (.env): VITE_DB_URL, DB_SERVICE_KEY, TG_BOT_TOKEN, TG_CHAT_ID.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const DRY = process.argv.includes('--dry-run');
const TEST_PING = process.argv.includes('--test-ping');
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;
const LOG_PATH = path.resolve('.claude-data/morning-brief.log');

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync('.claude-data', { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch { /* best-effort */ }
}

const SYMBOL = { eur: '€', usd: '$', gbp: '£' };
const sym = (c) => SYMBOL[(c || 'eur').toLowerCase()] || `${(c || '').toUpperCase()} `;
const money = (n, c) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return Number.isInteger(v) ? `${sym(c)}${v}` : `${sym(c)}${v.toFixed(2)}`;
};
const utcDay = (d) => d.toISOString().slice(0, 10);

// A vs B -> " (↑ 3)" / " (↓ 2)" / "" when flat or no baseline.
function delta(cur, prev) {
  if (prev == null) return '';
  const d = Math.round((cur - prev) * 100) / 100;
  if (d === 0) return ' (flat)';
  return d > 0 ? ` (↑ ${d})` : ` (↓ ${Math.abs(d)})`;
}

const MORNING = [
  "let's make today count 🔥",
  'yesterday already happened. today is the one u can win',
  'show up. the compounding does the rest 📈',
  "somewhere someone's building slower than u. go",
  'small day or big day, just make it a day u moved',
  'the business is real and it runs while u sleep. now add to it',
  "coffee, then one thing that moves the needle. that's the whole game",
  'ur early. ur building. keep ur head down and ship',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { log(`[brief] (tg not armed) would push:\n${text}`); return; }
  if (DRY) { log(`[brief] (dry-run) would push:\n${text}\n---`); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log('[brief] telegram pushed');
  } catch (err) { log(`[brief] TELEGRAM FAILED (${err.message})`); }
}

if (TEST_PING) {
  await sendTelegram(
    `☀️ morning brief — sample\n\n` +
    `💰 €48 · 4 sales (↑ 12)\n👤 3 new signups (↑ 1)\n👀 210 visitors (↓ 40)\n📈 MRR €320\n\n` +
    `${pick(MORNING)}\n\n(test ping — if you can read this, the brief reaches your phone)`
  );
  log('[brief] test ping done');
  process.exit(0);
}

const supabase = createClient((process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL), (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY), {
  auth: { persistSession: false },
});

async function main() {
  const yDay = utcDay(new Date(Date.now() - 1 * 86400e3));   // yesterday
  const bDay = utcDay(new Date(Date.now() - 2 * 86400e3));   // day before

  // KPI rows for both days (funnel + traffic + latest MRR).
  const { data: kpiRows, error: kErr } = await supabase
    .from('kpi_snapshots')
    .select('day, metrics')
    .in('day', [yDay, bDay]);
  if (kErr) { log(`[brief] kpi query failed (${kErr.message})`); return; }
  const byDay = new Map((kpiRows || []).map((r) => [r.day, r.metrics || {}]));
  const y = byDay.get(yDay) || {};
  const b = byDay.get(bDay) || {};

  // Daily revenue comes from the sales table (kpi_snapshots.revenue is lifetime).
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('amount, currency, paid_at')
    .gte('paid_at', new Date(Date.now() - 3 * 86400e3).toISOString());
  if (sErr) { log(`[brief] sales query failed (${sErr.message})`); return; }
  const sumDay = (day) => (sales || []).filter((s) => utcDay(new Date(s.paid_at)) === day);
  const ySales = sumDay(yDay);
  const bSales = sumDay(bDay);
  const ccy = ySales[0]?.currency || y?.revenue?.currency || 'eur';
  const yRev = ySales.reduce((s, r) => s + Number(r.amount || 0), 0);
  const bRev = bSales.reduce((s, r) => s + Number(r.amount || 0), 0);

  const ySignups = Number(y?.funnel?.user_registered || 0);
  const bSignups = Number(b?.funnel?.user_registered || 0);
  const yVis = Number(y?.traffic?.visitors || 0);
  const bVis = Number(b?.traffic?.visitors || 0);
  const mrr = y?.revenue?.mrr ?? b?.revenue?.mrr ?? null;

  const nice = new Date(yDay + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });

  const lines = [
    `☀️ morning brief — ${nice}`,
    ``,
    `💰 ${money(yRev, ccy)} · ${ySales.length} sale${ySales.length === 1 ? '' : 's'}${delta(yRev, bRev)}`,
    `👤 ${ySignups} new signup${ySignups === 1 ? '' : 's'}${delta(ySignups, bSignups)}`,
    `👀 ${yVis} visitors${delta(yVis, bVis)}`,
  ];
  if (mrr != null) lines.push(`📈 MRR ${money(mrr, ccy)}`);
  lines.push(``, pick(MORNING));

  await sendTelegram(lines.join('\n'));
  log(`[brief] sent: rev ${yRev} signups ${ySignups} vis ${yVis} mrr ${mrr}`);
}

main().catch((err) => {
  log(`[brief] cycle error: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
