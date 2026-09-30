// Pure logic for scripts/track-longevity.mjs: argument parsing, the opt in
// check, and the patch a re-check writes. No I/O here, so it is tested
// without a browser or a database.
import { daysRunning, startedIso } from '../../src/features/capture/dates.js';

export const TERMS_MESSAGE =
  "This script loads Meta Ad Library pages automatically, which Meta's terms restrict. It is off unless you opt in: pass --i-accept-the-terms or set LONGEVITY_OPT_IN=1.";
export const INSTALL_MESSAGE = 'Install Playwright first: npm i -D playwright && npx playwright install chromium';
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 1000;

export const USAGE = `Usage:
  node scripts/track-longevity.mjs --fixture <file.html> --id <library id>
      Parse one saved Ad Library page offline and print what would be written. No database, no opt in.
  node scripts/track-longevity.mjs --i-accept-the-terms [--limit 50] [--dry-run] [--rescore]
      Re-check competitor ads that have an Ad Library id (oldest check first). Needs VITE_DB_URL and DB_SERVICE_KEY.
      --dry-run   print the patches, write nothing
      --rescore   also move auto verdicts that nobody set by hand (never a human verdict)
  LONGEVITY_OPT_IN=1 works instead of --i-accept-the-terms.`;

// -> { ok: true, opts } | { ok: false, error }
export function parseArgs(argv) {
  const opts = { acceptTerms: false, fixture: null, id: null, limit: DEFAULT_LIMIT, dryRun: false, rescore: false, help: false };
  const args = [...argv];
  const value = (flag) => {
    const v = args.shift();
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value.`);
    return v;
  };
  try {
    while (args.length) {
      const a = args.shift();
      if (a === '--i-accept-the-terms') opts.acceptTerms = true;
      else if (a === '--dry-run') opts.dryRun = true;
      else if (a === '--rescore') opts.rescore = true;
      else if (a === '--help' || a === '-h') opts.help = true;
      else if (a === '--fixture') opts.fixture = value(a);
      else if (a === '--id') {
        const id = value(a);
        if (!/^\d{6,20}$/.test(id)) throw new Error('--id must be an Ad Library id: 6 to 20 digits.');
        opts.id = id;
      } else if (a === '--limit') {
        const n = Number(value(a));
        if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) throw new Error(`--limit must be a whole number from 1 to ${MAX_LIMIT}.`);
        opts.limit = n;
      } else throw new Error(`Unknown option ${a}.`);
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (opts.fixture && !opts.id) return { ok: false, error: '--fixture needs --id <library id>.' };
  if (opts.id && !opts.fixture) return { ok: false, error: '--id only works with --fixture.' };
  if (opts.fixture && opts.rescore) return { ok: false, error: '--rescore does nothing with --fixture: nothing is written.' };
  return { ok: true, opts };
}

export function optedIn(argv, env = {}) {
  return (argv || []).includes('--i-accept-the-terms') || String(env.LONGEVITY_OPT_IN || '').trim() === '1';
}

// What a re-check writes for one ad: the running facts merged into its
// metrics, plus the status that follows from them. The verdict is never part
// of this; --rescore decides that separately through nextImportVerdict.
// -> { metrics, status }
export function longevityPatch(ad, capture, now = new Date()) {
  const m = { ...(ad?.metrics || {}) };
  const c = capture || {};
  const at = now.toISOString();
  if (c.started) m.started_running = startedIso(c.started);
  if (c.active === true) {
    m.live = true;
    delete m.stopped_running;
  } else if (c.active === false) {
    m.live = false;
    if (c.stopped) m.stopped_running = c.stopped;
  }
  const startDay = typeof m.started_running === 'string' ? m.started_running.slice(0, 10) : null;
  const days = daysRunning(startDay, m.live === false ? m.stopped_running || null : null, now);
  if (days !== null && !(m.live === false && !m.stopped_running)) m.days_running = days;
  m.last_synced = at;
  m.longevity_checked_at = at;
  let status = ad?.status || 'running';
  if (m.live === true) status = 'running';
  else if (m.live === false) status = 'dead';
  return { metrics: m, status };
}

// Oldest check first, never checked before all of them. Ties keep their order.
export function checkOrder(ads) {
  const t = (ad) => {
    const v = Date.parse(ad?.metrics?.longevity_checked_at || '');
    return Number.isFinite(v) ? v : -Infinity;
  };
  return ads
    .map((ad, i) => ({ ad, i }))
    .sort((a, b) => t(a.ad) - t(b.ad) || a.i - b.i)
    .map((x) => x.ad);
}

// A random pause between pages, 3 to 6 seconds.
export const pauseMs = (random = Math.random) => 3000 + Math.floor(random() * 3000);

export const MAX_FAILURES_IN_A_ROW = 5;
