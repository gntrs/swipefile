// Revenue -> Telegram hype alerts. Runs on the WSL cron right after
// stripe-pull.mjs lands fresh data, reads the `sales` table it fills, and buzzes
// the phone on every NEW sale with a little summary + a motivating line. No email
// - phone only. Edge-triggered on sale id, so no double-buzz, no spam.
//
// WHY: stripe-pull already stores every charge, but stored money is silent money.
// Seeing "💰 new sale, €12, that's €48 today" land on your phone while you're
// doing something else IS the dopamine that keeps you building. That's the point.
//
//   node scripts/revenue-alert.mjs             # real run (cron uses this)
//   node scripts/revenue-alert.mjs --dry-run   # print what it WOULD send, touch nothing
//   node scripts/revenue-alert.mjs --status     # print saved state + exit
//   node scripts/revenue-alert.mjs --test-ping  # send one sample hype msg + exit
//
// State: .claude-data/revenue-alert-state.json (remembers which sale ids it has
// already celebrated - this is a fresh process each tick, memory must be on disk).
// FIRST run seeds every existing sale as "already seen" and stays silent, so it
// never floods you with a year of historical charges the first time it wakes up.
//
// Env (.env), all optional except the database pair (already set):
//   VITE_DB_URL / DB_SERVICE_KEY   read the sales table
//   TG_BOT_TOKEN / TG_CHAT_ID                   phone push (same bot as health-monitor)
//   REVENUE_TZ        local day for "today" totals, default UTC
//   REVENUE_BIG       € amount that counts as a "big one", default 50
//   REVENUE_CURRENCY  fallback currency symbol if a row has none, default eur

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// ---- tiny .env loader (same as the sibling scripts) ------------------------
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const DRY = process.argv.includes('--dry-run');
const STATUS_ONLY = process.argv.includes('--status');
const TEST_PING = process.argv.includes('--test-ping');

const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;
const TZ = process.env.REVENUE_TZ || 'UTC';
const BIG = Number(process.env.REVENUE_BIG || 50);
const FALLBACK_CCY = process.env.REVENUE_CURRENCY || 'eur';

const STATE_PATH = path.resolve('.claude-data/revenue-alert-state.json');
const LOG_PATH = path.resolve('.claude-data/revenue-alert.log');
const MAX_REMEMBERED = 2000; // cap the seen-id set so state can't grow forever

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync('.claude-data', { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch { /* logging is best-effort */ }
}

// ---- state -----------------------------------------------------------------
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    s.seen_ids = s.seen_ids || [];
    return s;
  } catch {
    return { seen_ids: [], last_hype: -1, milestones: {}, seeded: false };
  }
}
function saveState(state) {
  fs.mkdirSync('.claude-data', { recursive: true });
  // Keep only the most recent ids - older ones can never re-appear as "new".
  if (state.seen_ids.length > MAX_REMEMBERED) {
    state.seen_ids = state.seen_ids.slice(-MAX_REMEMBERED);
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

if (STATUS_ONLY) {
  const s = loadState();
  console.log(JSON.stringify({ ...s, seen_ids: `[${s.seen_ids.length} ids]` }, null, 2));
  process.exit(0);
}

// ---- money formatting ------------------------------------------------------
const SYMBOL = { eur: '€', usd: '$', gbp: '£' };
function sym(ccy) {
  return SYMBOL[(ccy || FALLBACK_CCY).toLowerCase()] || `${(ccy || '').toUpperCase()} `;
}
// € with no trailing .00, but keep cents when they matter: 12 -> €12, 12.5 -> €12.50
function money(amount, ccy) {
  const n = Number(amount || 0);
  const s = sym(ccy);
  return Number.isInteger(n) ? `${s}${n}` : `${s}${n.toFixed(2)}`;
}

// Local Y-M-D for a Date, in the founder's timezone - so "today" means his today,
// not UTC's. en-CA gives ISO-ish YYYY-MM-DD out of toLocaleDateString.
function localDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

// ---- the hype ---------------------------------------------------------------
// Every buzz carries one of these. Rotated (never the same one twice running) so
// it stays fresh. Lowercase, hungry, a bit slangy - your voice, not a bank's.
const HYPE = [
  'keep stacking 🧱',
  "the machine's working. just keep feeding it",
  'someone chose u over everyone else today. let that land',
  '0 → this. there was nothing here once, remember that',
  'money showed up while u were doing something else. thats the whole point',
  'another brick in the thing ur building 📈',
  "this is what it looks like when it works. want more of this",
  'small numbers compound. just show up tomorrow',
  "proof it's real. now go get the next one",
  'u built a thing people actually pay for. most never do',
  "don't stop. ur early and it's already working 🚀",
  'this is the boring part of getting rich. love the boring part',
];
const HYPE_FIRST = [
  "☀️ first one's in. day's already green",
  'morning money. everything from here is upside',
  "first blood. let's run it up 🩸",
];
const HYPE_BIG = [
  "🔥 big one. that's not luck, that's the product",
  'chunky. this is the tier u want more of',
  "that's a real one. screenshot it, remember the feeling",
];

function pickHype(pool, state) {
  // Avoid repeating the last line we sent from the main pool.
  if (pool === HYPE) {
    let i = Math.floor(Math.random() * pool.length);
    if (i === state.last_hype) i = (i + 1) % pool.length;
    state.last_hype = i;
    return pool[i];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- delivery --------------------------------------------------------------
async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) {
    log(`[revenue] (telegram not armed) would push: ${text.split('\n')[0]}`);
    return;
  }
  if (DRY) {
    log(`[revenue] (dry-run) would push:\n${text}\n---`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log('[revenue] telegram pushed');
  } catch (err) {
    log(`[revenue] TELEGRAM FAILED (${err.message})`);
  }
}

if (TEST_PING) {
  const state = loadState();
  const msg =
    `💰 new sale — €12\n` +
    `Premium plan (monthly)\n\n` +
    `today: €48 · 4 sales\n` +
    `MRR: €320\n\n` +
    `${pickHype(HYPE, state)}\n\n` +
    `(this is a test ping — if you can read it, revenue alerts reach your phone)`;
  await sendTelegram(msg);
  log('[revenue] test ping done');
  process.exit(0);
}

// ---- main ------------------------------------------------------------------
const supabase = createClient((process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL), (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY), {
  auth: { persistSession: false },
});

async function main() {
  const state = loadState();
  const seen = new Set(state.seen_ids);

  // Pull a generous recent window so a late-arriving charge still gets caught,
  // and so "today"/MRR-ish context is cheap to compute. Volume here is tiny.
  const since = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const { data: recent, error } = await supabase
    .from('sales')
    .select('stripe_id, amount, currency, product, paid_at')
    .gte('paid_at', since)
    .order('paid_at', { ascending: true });

  if (error) {
    log(`[revenue] skip: sales query failed (${error.message}) - state untouched`);
    return;
  }

  // FIRST EVER run: adopt everything currently visible as "already celebrated"
  // and say nothing. Prevents a flood of historical sales on day one.
  if (!state.seeded) {
    state.seen_ids = recent.map((r) => r.stripe_id);
    state.seeded = true;
    if (!DRY) saveState(state);
    log(`[revenue] seeded ${recent.length} existing sale(s) as already-seen - staying silent`);
    return;
  }

  const fresh = recent.filter((r) => !seen.has(r.stripe_id));
  if (!fresh.length) {
    log('[revenue] no new sales - staying silent');
    return;
  }

  // Context for the summary line: today's tally in the founder's timezone.
  const today = localDay(new Date());
  const todays = recent.filter((r) => localDay(new Date(r.paid_at)) === today);
  const todayCount = todays.length;
  const primaryCcy = (fresh[0].currency || todays[0]?.currency || FALLBACK_CCY);
  const todayTotal = todays.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Is any of the fresh batch the very first sale of today?
  const priorToday = todayCount - fresh.filter((r) => localDay(new Date(r.paid_at)) === today).length;
  const isFirstOfDay = priorToday <= 0;
  const freshTotal = fresh.reduce((s, r) => s + Number(r.amount || 0), 0);
  const biggest = fresh.reduce((m, r) => Math.max(m, Number(r.amount || 0)), 0);

  // ---- build the message --------------------------------------------------
  let head;
  if (fresh.length === 1) {
    const s = fresh[0];
    head = `💰 new sale — ${money(s.amount, s.currency)}` + (s.product ? `\n${s.product}` : '');
  } else {
    head =
      `💰 ${fresh.length} new sales — ${money(freshTotal, primaryCcy)}\n` +
      fresh.map((s) => `· ${money(s.amount, s.currency)}${s.product ? ` ${s.product}` : ''}`).join('\n');
  }

  const summary = `today: ${money(todayTotal, primaryCcy)} · ${todayCount} sale${todayCount === 1 ? '' : 's'}`;

  // Pick the hype tier: first-of-day > big one > general.
  let hype;
  if (isFirstOfDay) hype = pickHype(HYPE_FIRST, state);
  else if (biggest >= BIG) hype = pickHype(HYPE_BIG, state);
  else hype = pickHype(HYPE, state);

  // Daily milestone crossings (€100/250/500/1000) - only fire each once per day.
  const MILES = [1000, 500, 250, 100];
  const beforeTotal = todayTotal - freshTotal;
  let milestoneLine = '';
  const crossed = MILES.find((m) => beforeTotal < m && todayTotal >= m);
  if (crossed && state.milestones?.[today] !== crossed) {
    state.milestones = state.milestones || {};
    // remember the highest milestone hit today so we don't repeat lower ones
    if (!state.milestones[today] || crossed > state.milestones[today]) state.milestones[today] = crossed;
    milestoneLine = `\n🎯 ${money(crossed, primaryCcy)}+ day. that's a new floor, not a ceiling.`;
  }
  // prune old milestone days
  if (state.milestones) {
    for (const d of Object.keys(state.milestones)) {
      if (d < localDay(new Date(Date.now() - 3 * 86400 * 1000))) delete state.milestones[d];
    }
  }

  const msg = `${head}\n\n${summary}${milestoneLine}\n\n${hype}`;
  await sendTelegram(msg);

  // Mark fresh ids seen (only after a real send; dry-run leaves state alone).
  if (!DRY) {
    for (const r of fresh) state.seen_ids.push(r.stripe_id);
    saveState(state);
  }
  log(`[revenue] alerted on ${fresh.length} new sale(s), ${money(freshTotal, primaryCcy)}`);
}

main().catch((err) => {
  log(`[revenue] cycle error: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
