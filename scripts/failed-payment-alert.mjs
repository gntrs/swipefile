// Failed-payment -> Telegram. Buzzes the phone when a Stripe charge FAILS - a
// declined card, a failed subscription renewal - so you can nudge the customer
// back before they churn quietly. Failed payments are recoverable money; most
// come back if you just reach out. This one actually pays for itself.
//
//   node scripts/failed-payment-alert.mjs             # real run (cron)
//   node scripts/failed-payment-alert.mjs --dry-run   # print, send nothing
//   node scripts/failed-payment-alert.mjs --status     # saved state + exit
//   node scripts/failed-payment-alert.mjs --test-ping  # sample alert now
//
// Hits Stripe directly (plain fetch, restricted key with Charges read - same key
// as stripe-pull). Edge-triggered on charge id: state remembers which failures it
// already flagged, first run seeds silently so it never dumps old declines on you.
//
// Env (.env): STRIPE_API_KEY, TG_BOT_TOKEN, TG_CHAT_ID.
//   FP_WINDOW_DAYS  how far back to scan each run, default 3

import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const DRY = process.argv.includes('--dry-run');
const STATUS_ONLY = process.argv.includes('--status');
const TEST_PING = process.argv.includes('--test-ping');

const STRIPE_KEY = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;
const WINDOW_DAYS = Number(process.env.FP_WINDOW_DAYS || 3);

const STATE_PATH = path.resolve('.claude-data/failed-payment-state.json');
const LOG_PATH = path.resolve('.claude-data/failed-payment.log');
const MAX_REMEMBERED = 2000;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync('.claude-data', { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch { /* best-effort */ }
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    s.seen_ids = s.seen_ids || [];
    return s;
  } catch { return { seen_ids: [], seeded: false }; }
}
function saveState(state) {
  fs.mkdirSync('.claude-data', { recursive: true });
  if (state.seen_ids.length > MAX_REMEMBERED) state.seen_ids = state.seen_ids.slice(-MAX_REMEMBERED);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

if (STATUS_ONLY) {
  const s = loadState();
  console.log(JSON.stringify({ ...s, seen_ids: `[${s.seen_ids.length} ids]` }, null, 2));
  process.exit(0);
}

const SYMBOL = { eur: '€', usd: '$', gbp: '£' };
const sym = (c) => SYMBOL[(c || 'eur').toLowerCase()] || `${(c || '').toUpperCase()} `;
const money = (cents, c) => {
  const v = Math.round(Number(cents || 0)) / 100;
  return Number.isInteger(v) ? `${sym(c)}${v}` : `${sym(c)}${v.toFixed(2)}`;
};

// A recovery nudge, in your voice. Rotated so it never feels canned.
const NUDGE = [
  'worth a nudge — a friendly message wins most of these back',
  'card probably just expired. one email and they’re back in',
  "don't let this one churn quietly. reach out today",
  'failed ≠ gone. most recover if u actually ask',
  'a real person tried to pay u and couldn’t. go make it easy for them',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { log(`[fp] (tg not armed) would push: ${text.split('\n')[0]}`); return; }
  if (DRY) { log(`[fp] (dry-run) would push:\n${text}\n---`); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log('[fp] telegram pushed');
  } catch (err) { log(`[fp] TELEGRAM FAILED (${err.message})`); }
}

if (TEST_PING) {
  await sendTelegram(
    `⚠️ payment failed — €12\n` +
    `someone@email.com\n` +
    `reason: Your card was declined.\n\n` +
    `${pick(NUDGE)}\n\n(test ping — if you can read this, failed-payment alerts work)`
  );
  log('[fp] test ping done');
  process.exit(0);
}

async function stripe(pathName, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${pathName}${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe ${pathName}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  if (!STRIPE_KEY) { log('[fp] no STRIPE_API_KEY - skipping'); return; }

  const since = Math.floor((Date.now() - WINDOW_DAYS * 86400e3) / 1000);
  // Page recent charges and keep the failed ones. Stripe can't filter by status
  // server-side on the list endpoint, so we filter here - volume is tiny.
  const failed = [];
  let starting_after;
  for (;;) {
    const page = await stripe('charges', {
      limit: 100, 'created[gt]': since, ...(starting_after ? { starting_after } : {}),
    });
    for (const c of page.data) if (c.status === 'failed') failed.push(c);
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }

  const state = loadState();
  const seen = new Set(state.seen_ids);

  // First run: adopt current failures as already-seen, stay silent.
  if (!state.seeded) {
    state.seen_ids = failed.map((c) => c.id);
    state.seeded = true;
    if (!DRY) saveState(state);
    log(`[fp] seeded ${failed.length} existing failure(s) as already-seen - staying silent`);
    return;
  }

  const fresh = failed.filter((c) => !seen.has(c.id));
  if (!fresh.length) { log('[fp] no new failed payments - staying silent'); return; }

  for (const c of fresh) {
    const who = c.billing_details?.email || c.receipt_email || c.customer || 'unknown customer';
    const reason = c.failure_message || c.outcome?.seller_message || 'declined (no reason given)';
    const msg =
      `⚠️ payment failed — ${money(c.amount, c.currency)}\n` +
      `${who}\n` +
      `reason: ${reason}\n\n` +
      `${pick(NUDGE)}`;
    await sendTelegram(msg);
  }

  if (!DRY) {
    for (const c of fresh) state.seen_ids.push(c.id);
    saveState(state);
  }
  log(`[fp] alerted on ${fresh.length} new failed payment(s)`);
}

main().catch((err) => {
  log(`[fp] cycle error: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
