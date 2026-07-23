// Live product health monitor. Runs on the WSL crontab every ~30 min,
// 24/7, independent of any SSH/Claude session. Watches the REAL product's
// PostHog stream for the failure classes that have actually bitten us, and on
// a NEW break fires two ways: (1) an email via Mailjet, (2) one line into the
// dashboard team chat so the whole team sees it. Edge-triggered - one alert on
// break, one on recovery, no repeat spam while it stays down.
//
// WHY THIS EXISTS: on Jun 10-13 /api/chat died silently - pageviews + signups
// kept coming but message_sent was 0 for THREE DAYS and nobody noticed until it
// cost a whole FB-group wave. PostHog dashboards don't page you. This does.
//
// WHAT IT WATCHES (all over a rolling window, default 3h):
//   1. chat_dead      - 0 message_sent while real traffic is flowing (THE big one)
//   2. zero_activity  - 0 pageviews at all (site down / unreachable)
//   3. error_spike    - $exception volume way over its own 7-day baseline
//   4. checkout_broken- people reach Stripe (payment_initiated) but 0 complete
//
// WHAT IT DOESN'T CATCH: whatever kills this cron too (box off, no network).
// For that you still want an external uptime ping. This is the complement -
// it sees "up but not actually working", which uptime pings can't.
//
// DELIVERY:
//   - Email: only if MAILJET_API_KEY + MAILJET_SECRET_KEY are in .env. Plain
//     fetch to Mailjet v3.1 (no SDK dep, same ethos as stripe-pull). Until the
//     keys are set it just logs "would email" - the chat alert still goes out.
//   - Chat: posts one line as Claude via scripts/chat.mjs (set
//     HEALTH_CHAT_MENTION to @-mention someone so it highlights). Respects the team's no-noise rule: it only ever
//     posts on a state CHANGE, never a "still all good" heartbeat.
//
// State lives in .claude-data/health-state.json (this is a fresh process each
// cron tick, so the up/down memory has to be on disk, not in a variable).
//
// Usage:
//   node scripts/health-monitor.mjs            # real run (cron uses this)
//   node scripts/health-monitor.mjs --dry-run  # print verdicts, touch nothing
//   node scripts/health-monitor.mjs --status   # print current saved state + exit
//
// Env (.env), all optional except the ones marked REQUIRED:
//   POSTHOG_API_KEY        personal key w/ Query Read (already used by posthog-pull)
//   POSTHOG_PROJECT_ID     REQUIRED - your PostHog project id
//   POSTHOG_HOST           default https://eu.posthog.com
//   MAILJET_API_KEY        arm email alerts (paste from prod host)
//   MAILJET_SECRET_KEY     arm email alerts
//   HEALTH_ALERT_TO        REQUIRED - email that receives alerts
//   HEALTH_ALERT_FROM      REQUIRED - verified Mailjet sender address
//   HEALTH_PROD_API        REQUIRED - production API base URL to probe
//   HEALTH_PROD_WEB        REQUIRED - production web base URL to probe
//   HEALTH_WINDOW_HOURS    rolling window, default 3
//   HEALTH_MIN_TRAFFIC     visitors in window before "chat dead" can trip, default 15
//   HEALTH_MIN_CHECKOUTS   payment_initiated in window before "checkout broken" can trip, default 3
//   HEALTH_ERR_FLOOR       min $exception count to even consider a spike, default 25
//   HEALTH_ERR_MULT        spike = errors > this * 7-day baseline for the window, default 3
//   VITE_DB_URL / DB_SERVICE_KEY   only needed by chat.mjs (already set)

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// ---- tiny .env loader (no dotenv dep, same as the other scripts) ----------
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DRY = process.argv.includes('--dry-run');
const STATUS_ONLY = process.argv.includes('--status');
// Fire one harmless notification down every armed channel and exit. Use this
// after pasting new tokens to prove the pipe works, instead of faking a break.
const TEST_PING = process.argv.includes('--test-ping');

const KEY = process.env.POSTHOG_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = (process.env.POSTHOG_HOST || 'https://eu.posthog.com').replace(/\/$/, '');

const WINDOW_H = Number(process.env.HEALTH_WINDOW_HOURS || 3);
const MIN_TRAFFIC = Number(process.env.HEALTH_MIN_TRAFFIC || 15);
const MIN_CHECKOUTS = Number(process.env.HEALTH_MIN_CHECKOUTS || 3);
const ERR_FLOOR = Number(process.env.HEALTH_ERR_FLOOR || 25);
const ERR_MULT = Number(process.env.HEALTH_ERR_MULT || 3);

const APP = process.env.APP_NAME || "the product";
// Optional @handle prepended to team-chat alerts so they highlight for someone.
const CHAT_MENTION = process.env.HEALTH_CHAT_MENTION ? process.env.HEALTH_CHAT_MENTION + " " : "";
const ALERT_TO = process.env.HEALTH_ALERT_TO;
const ALERT_FROM = process.env.HEALTH_ALERT_FROM;
// Set to something like "[DRILL] " when deliberately tripping a condition to
// test the pipe, so the team chat doesn't read it as a real outage.
const ALERT_PREFIX = process.env.HEALTH_ALERT_PREFIX || '';

// Telegram = the one that actually reaches the phone. Can reuse an existing
// bot - just set TG_BOT_TOKEN + TG_CHAT_ID. Gated like Mailjet: silent no-op until both are present.
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;

const STATE_PATH = path.resolve('.claude-data/health-state.json');
const LOG_PATH = path.resolve('.claude-data/health-monitor.log');

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
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { conditions: {}, last_run: null };
  }
}
function saveState(state) {
  fs.mkdirSync('.claude-data', { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

if (STATUS_ONLY) {
  console.log(JSON.stringify(loadState(), null, 2));
  process.exit(0);
}

const MISSING = ["POSTHOG_API_KEY", "POSTHOG_PROJECT_ID", "HEALTH_ALERT_TO", "HEALTH_ALERT_FROM", "HEALTH_PROD_API", "HEALTH_PROD_WEB"].filter((k) => !process.env[k]);
if (MISSING.length) {
  log(`[health] FATAL: missing required env: ${MISSING.join(", ")}. Add them to .env (see .env.example). Exiting.`);
  process.exit(1);
}

// ---- PostHog ---------------------------------------------------------------
async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const cols = json.columns || [];
  return (json.results || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

// One pass over the window - all the counts we need in a single query.
async function pullWindow() {
  const [row] = await hogql(`
    select
      countIf(event = '$pageview')          as pageviews,
      count(distinct if(event = '$pageview', person_id, null)) as visitors,
      countIf(event = 'message_sent')        as messages,
      countIf(event = 'user_registered')     as signups,
      countIf(event = '$exception')          as errors,
      countIf(event = 'payment_initiated')   as pay_init,
      countIf(event = 'payment_completed')   as pay_done
    from events
    where timestamp >= now() - interval ${WINDOW_H} hour
  `);
  return row || {};
}

// 7-day average $exception count for a window of WINDOW_H hours, so the spike
// test compares like-for-like (rate, not raw lifetime volume).
async function errorBaseline() {
  const windowsIn7d = (7 * 24) / WINDOW_H;
  const [row] = await hogql(`
    select count() as total
    from events
    where event = '$exception' and timestamp >= now() - interval 7 day
  `);
  const total = Number(row?.total || 0);
  return total / windowsIn7d;
}

// ---- delivery --------------------------------------------------------------
async function sendEmail(subject, body) {
  const apiKey = process.env.MAILJET_API_KEY;
  const secret = process.env.MAILJET_SECRET_KEY;
  if (!apiKey || !secret) {
    log(`[health] (email not armed - no Mailjet keys) would email "${subject}"`);
    return;
  }
  if (DRY) {
    log(`[health] (dry-run) would email "${subject}"`);
    return;
  }
  const auth = Buffer.from(`${apiKey}:${secret}`).toString('base64');
  try {
    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Messages: [{
          From: { Email: ALERT_FROM, Name: `${APP} health` },
          To: [{ Email: ALERT_TO }],
          Subject: subject,
          TextPart: body,
        }],
      }),
    });
    if (!res.ok) throw new Error(`Mailjet ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log(`[health] email sent: ${subject}`);
  } catch (err) {
    log(`[health] EMAIL FAILED (${err.message}) - chat alert still went out`);
  }
}

// Phone push. Plain fetch, no SDK - same ethos as stripe-pull. Never throws:
// a notification channel dying must not take the monitor down with it.
async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) {
    log(`[health] (telegram not armed - no TG_BOT_TOKEN/TG_CHAT_ID) would push: ${text.split('\n')[0]}`);
    return;
  }
  if (DRY) {
    log(`[health] (dry-run) would telegram: ${text.split('\n')[0]}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log('[health] telegram pushed');
  } catch (err) {
    log(`[health] TELEGRAM FAILED (${err.message}) - other channels still fired`);
  }
}

async function postChat(message) {
  if (DRY) {
    log(`[health] (dry-run) would post to team chat: ${message}`);
    return;
  }
  try {
    await execFileP('node', ['scripts/chat.mjs', message], { cwd: process.cwd() });
    log(`[health] chat posted: ${message}`);
  } catch (err) {
    log(`[health] chat post FAILED: ${err.message}`);
  }
}

// ---- safe auto-fixes + live prod probes ------------------------------------
// Deliberately conservative. Everything here is safe to run unattended at 4am
// with nobody watching: it reads, it probes, it wakes a sleeping dyno. It does
// NOT touch prod code, git, or deploys - a bad unattended "fix" turns a 20min
// outage into a weekend. Same line ads-cron.sh already holds.
const PROD_API = (process.env.HEALTH_PROD_API || "").replace(/\/$/, '');
const PROD_WEB = (process.env.HEALTH_PROD_WEB || "").replace(/\/$/, '');

async function probeUrl(url, timeoutMs = 60000) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return { url, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
    const reason = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err?.message || String(err);
    return { url, ok: false, status: null, ms: Date.now() - started, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

// The Render backend is on the FREE plan, which sleeps after ~15min idle and
// takes ~50s to cold start. That cold start looks exactly like an outage to a
// user - and to us. Probing it IS the remediation: it wakes the dyno. So this
// runs on every break and the result goes into the page, which means a "chat
// dead" caused purely by a sleeping dyno self-heals and tells you it did.
async function runSafeAutoFixes() {
  let [api, web] = await Promise.all([
    probeUrl(`${PROD_API}/health`, 60000),
    probeUrl(PROD_WEB, 30000),
  ]);

  // One retry on failure before we believe it. A single blip (cold start, flaky
  // wifi on the WSL box, transient 502) is not an outage, and this monitor's
  // whole value is that you TRUST it when it buzzes. Costs 8s on the rare bad
  // tick and nothing on a good one.
  if (!api.ok || !web.ok) {
    log(`[health] probe failed, retrying in 8s before calling it down`);
    await new Promise((r) => setTimeout(r, 8000));
    if (!api.ok) api = await probeUrl(`${PROD_API}/health`, 60000);
    if (!web.ok) web = await probeUrl(PROD_WEB, 30000);
  }

  const fmt = (p, label) =>
    p.ok ? `${label} OK (${p.status}, ${p.ms}ms)` : `${label} FAIL (${p.error || p.status})`;
  const line = `${fmt(api, 'backend')} | ${fmt(web, 'frontend')}`;
  log(`[health] probes: ${line}`);
  return { api, web, line };
}

// Headless Claude diagnosis pass. Read-only tools by construction: it can curl,
// read git history, and run the existing posthog scripts, but it has no Edit /
// Write / git push, so the worst case is a wrong opinion in a Telegram message.
// Sonnet (not Haiku) because this is the "actually figure it out" tier.
async function diagnose(breakName, detail, summary, probeLine) {
  if (process.env.HEALTH_DIAGNOSE_ENABLED === '0') return null;
  if (DRY) return '(dry-run: diagnosis skipped)';

  const prompt = `You are triaging a LIVE production alert for ${APP}.

ALERT: ${breakName}
DETAIL: ${detail}
POSTHOG WINDOW (${WINDOW_H}h): ${summary}
LIVE PROBES JUST RUN: ${probeLine}

Product: web frontend at ${PROD_WEB}, API backend at ${PROD_API} (free-tier
hosts may sleep when idle and cold-start slowly).
Analytics live in PostHog project ${PROJECT}.

Investigate and find the most likely CAUSE. Useful moves:
- curl ${PROD_API}/health and ${PROD_API}/api/chat to see if the API really works
- git log --oneline -10 in the backend repo, if present (did a deploy break it?)
- node scripts/posthog-pull.mjs is available; or query PostHog
  directly for $exception breakdowns and exactly when the affected event stopped

Then reply with AT MOST 6 short lines, plain text, no markdown:
CAUSE: <your best single explanation, or "unclear" if you genuinely can't tell>
EVIDENCE: <the one fact that convinced you>
FIX: <the concrete next action a human should take>
Be blunt and specific. If the numbers look like a quiet night rather than a real
outage, say so plainly - a false alarm called out is more useful than a guess.`;

  const CLAUDE_BIN = process.env.HEALTH_CLAUDE_BIN || "claude";
  try {
    const { stdout } = await execFileP(
      CLAUDE_BIN,
      [
        '-p', prompt,
        '--model', process.env.HEALTH_DIAGNOSE_MODEL || 'claude-sonnet-5',
        '--allowedTools',
        'Bash(curl*)', 'Bash(git log*)', 'Bash(git show*)', 'Bash(node*)', 'Read', 'Grep',
        '--permission-mode', 'dontAsk',
      ],
      { timeout: Number(process.env.HEALTH_DIAGNOSE_TIMEOUT_MS || 240000), maxBuffer: 1024 * 1024 }
    );
    const text = (stdout || '').trim();
    return text ? text.slice(0, 1200) : null;
  } catch (err) {
    log(`[health] diagnosis failed: ${err?.message}`);
    return null;
  }
}

// ---- checks ----------------------------------------------------------------
// Each returns { broken:boolean, detail:string }. `skip` conditions (a query
// failure) never reach here - we bail the whole run instead of guessing.
function evaluate(w, errBaseline, probe) {
  const visitors = Number(w.visitors || 0);
  const messages = Number(w.messages || 0);
  const errors = Number(w.errors || 0);
  const payInit = Number(w.pay_init || 0);
  const payDone = Number(w.pay_done || 0);

  const errThreshold = Math.max(ERR_FLOOR, Math.round(ERR_MULT * errBaseline));

  return {
    // Order matters for readability, but each is independent + edge-triggered.
    // Site-down is judged by ACTUALLY HITTING PROD, not by "no pageviews" -
    // at this traffic level a quiet night has zero pageviews for hours and a
    // traffic-based check would cry wolf every night until it got muted.
    site_down: {
      broken: Boolean(probe) && (!probe.api.ok || !probe.web.ok),
      detail: `prod not responding: ${probe?.line || 'n/a'}`,
    },
    chat_dead: {
      // Only meaningful when there's real traffic; a quiet night is not an outage.
      broken: visitors >= MIN_TRAFFIC && messages === 0,
      detail: `0 chat messages despite ${visitors} visitors in ${WINDOW_H}h (silent /api/chat outage class)`,
    },
    error_spike: {
      broken: errors >= errThreshold && errors >= ERR_FLOOR,
      detail: `${errors} $exception in ${WINDOW_H}h vs ~${errBaseline.toFixed(1)} baseline (threshold ${errThreshold})`,
    },
    checkout_broken: {
      broken: payInit >= MIN_CHECKOUTS && payDone === 0,
      detail: `${payInit} reached Stripe, 0 completed in ${WINDOW_H}h - payment path may be broken`,
    },
  };
}

const LABELS = {
  site_down: '🚨 Site DOWN (prod not responding)',
  chat_dead: '🚨 Chat is DOWN (no replies)',
  error_spike: '⚠️ Error spike',
  checkout_broken: '🚨 Checkout broken',
};

// Plain-English version for the phone. The log/email can be technical; a push
// notification you read half-asleep should say what's wrong in one line.
const HUMAN = {
  site_down: "🚨 site is down - prod isn't responding",
  chat_dead: "🚨 chat is down - nobody's getting replies",
  error_spike: '⚠️ errors are spiking',
  checkout_broken: "🚨 checkout is broken - people can't pay",
};

// What actually happened, in words instead of a metrics dump.
function plainWhy(name, w, probe) {
  const pv = Number(w.pageviews || 0);
  const vis = Number(w.visitors || 0);
  const msg = Number(w.messages || 0);
  const err = Number(w.errors || 0);
  const pi = Number(w.pay_init || 0);
  switch (name) {
    case 'site_down':
      return `prod didn't answer, twice in a row. ${probe?.line || ''}`.trim();
    case 'chat_dead':
      return `${vis} people on the site, ${msg} messages got through in ${WINDOW_H}h.`;
    case 'error_spike':
      return `${err} errors in ${WINDOW_H}h, way over normal.`;
    case 'checkout_broken':
      return `${pi} people hit Stripe, 0 paid in ${WINDOW_H}h.`;
    default:
      return `pv=${pv} vis=${vis} msg=${msg}`;
  }
}

// ---- main ------------------------------------------------------------------
async function main() {
  let w, errBaseline;
  try {
    [w, errBaseline] = await Promise.all([pullWindow(), errorBaseline()]);
  } catch (err) {
    // Inconclusive (PostHog down / rate limited / query error). Do NOT change
    // state and do NOT alert - a monitor that cries wolf on its own outage is
    // worse than useless. Just log and wait for the next tick.
    log(`[health] skip: PostHog query failed (${err.message}) - state untouched`);
    return;
  }

  // Probes run EVERY tick now: they're what decides site_down (2 cheap requests),
  // and as a bonus they nudge the sleepy Render free dyno.
  const probe = await runSafeAutoFixes();

  const results = evaluate(w, errBaseline, probe);
  const state = loadState();
  state.conditions = state.conditions || {};

  const summary =
    `pv=${w.pageviews || 0} vis=${w.visitors || 0} msg=${w.messages || 0} ` +
    `signup=${w.signups || 0} err=${w.errors || 0} pay=${w.pay_init || 0}->${w.pay_done || 0}`;
  log(`[health] window ${WINDOW_H}h  ${summary}`);

  const newBreaks = [];
  const recoveries = [];
  const now = new Date().toISOString();

  for (const [name, r] of Object.entries(results)) {
    const prev = state.conditions[name] || { down: false, since: null };
    if (r.broken && !prev.down) {
      newBreaks.push({ name, detail: r.detail });
      state.conditions[name] = { down: true, since: now, detail: r.detail };
    } else if (!r.broken && prev.down) {
      recoveries.push({ name, since: prev.since });
      state.conditions[name] = { down: false, since: null, detail: null };
    } else if (r.broken) {
      log(`[health] still down: ${name} (since ${prev.since})`);
    }
  }

  state.last_run = now;
  state.last_summary = summary;
  if (!DRY) saveState(state);

  // ---- fire on edges only --------------------------------------------------
  for (const b of newBreaks) {
    log(`[health] NEW BREAK: ${b.name} - ${b.detail}`);

    // Figure out WHY before paging, so the phone buzz is useful instead of
    // just alarming. Costs one Sonnet call, and only on a real break.
    const verdict = await diagnose(b.name, b.detail, summary, probe?.line || 'n/a');

    const phone =
      `${ALERT_PREFIX}${HUMAN[b.name]}\n\n` +
      `${plainWhy(b.name, w, probe)}\n\n` +
      `probes: ${probe?.line || 'n/a'}` +
      (verdict ? `\n\n${verdict}` : '\n\n(no diagnosis - check the logs)');
    await sendTelegram(phone);

    await sendEmail(
      `${ALERT_PREFIX}${LABELS[b.name]} - ${APP}`,
      `${ALERT_PREFIX}${LABELS[b.name]}\n\nDetected at ${now}.\n\n${b.detail}\n\n` +
      `Window snapshot (${WINDOW_H}h): ${summary}\nProbes: ${probe?.line || 'n/a'}\n\n` +
      (verdict ? `Diagnosis:\n${verdict}\n\n` : '') +
      `- ${APP} health monitor`
    );
    await postChat(`${CHAT_MENTION}${ALERT_PREFIX}${LABELS[b.name]} - ${b.detail}. (${summary})`);
  }
  for (const rec of recoveries) {
    log(`[health] RECOVERED: ${rec.name}`);
    await sendEmail(
      `${ALERT_PREFIX}✅ Recovered: ${rec.name} - ${APP}`,
      `${rec.name} recovered at ${now}.\nIt had been down since ${rec.since}.\n\n` +
      `Window snapshot (${WINDOW_H}h): ${summary}\n- ${APP} health monitor`
    );
    const downMin = rec.since ? Math.round((Date.now() - new Date(rec.since).getTime()) / 60000) : null;
    await sendTelegram(
      `${ALERT_PREFIX}✅ ${(HUMAN[rec.name] || rec.name).replace(/^[🚨⚠️]\s*/u, '')} - fixed itself\n\n` +
      `was down ${downMin != null ? `~${downMin} min` : 'a while'}. back to normal now.`
    );
    await postChat(`${CHAT_MENTION}${ALERT_PREFIX}✅ recovered: ${rec.name} (was down since ${rec.since}). (${summary})`);
  }

  if (!newBreaks.length && !recoveries.length) {
    log('[health] all clear, no state change - staying silent');
  }
}

if (TEST_PING) {
  const stamp = new Date().toISOString();
  await sendTelegram(`✅ health monitor test ping.\nIf you can read this, phone alerts work.\n${stamp}`);
  await sendEmail('✅ health monitor test ping', `If you got this, email alerts work.\n${stamp}`);
  log('[health] test ping done (chat intentionally left alone)');
} else {
  main().catch((err) => {
    log(`[health] cycle error: ${err?.stack || err?.message || err}`);
    process.exit(1);
  });
}
