// Re-checks how long competitor ads keep running, by opening each ad's public
// Meta Ad Library page and reading it with extension/parse.js (the same parser
// the capture bookmarklet and extension use). Updates live, started_running,
// stopped_running and days_running, which the auto verdict depends on.
//
// OFF BY DEFAULT. Loading Meta pages automatically is something Meta's terms
// restrict, so the live mode only runs when you opt in with
// --i-accept-the-terms or LONGEVITY_OPT_IN=1. Whether to use it is your call.
//
// Playwright is not a dependency of this repo. Install it where you run this:
//   npm i -D playwright && npx playwright install chromium
// or point PLAYWRIGHT_MODULE at an existing install's index.mjs.
//
// Usage: see USAGE in scripts/lib/longevity.mjs, or run with --help.
//   node scripts/track-longevity.mjs --fixture test/fixtures/adlibrary/single-active.html --id 999900007654321
//   node scripts/track-longevity.mjs --i-accept-the-terms --dry-run --limit 5
// Live mode needs in .env: VITE_DB_URL, DB_SERVICE_KEY, and OWN_BRAND (so your own ads are skipped).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs, optedIn, longevityPatch, checkOrder, pauseMs, USAGE, TERMS_MESSAGE, INSTALL_MESSAGE, MAX_FAILURES_IN_A_ROW,
} from './lib/longevity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARSER = path.join(ROOT, 'extension', 'parse.js');
const argv = process.argv.slice(2);

async function loadPlaywright() {
  try {
    const mod = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const chromium = mod.chromium || mod.default?.chromium;
    if (!chromium) throw new Error('no chromium export');
    return chromium;
  } catch {
    console.error(INSTALL_MESSAGE);
    process.exit(1);
  }
}

// Runs in the page: the parsed capture for the card with this id, or null.
function captureFor(id) {
  const P = globalThis.SwipefileParse;
  for (const card of P.findCards(document)) {
    const capture = P.parseCard(P.readCard(card));
    if (capture.libraryId === id) return capture;
  }
  return null;
}

async function runFixture(opts) {
  const file = path.resolve(process.cwd(), opts.fixture);
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${opts.fixture}`);
    process.exit(1);
  }
  const chromium = await loadPlaywright();
  // Offline by construction: no host resolves and every request is aborted.
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const context = await browser.newContext();
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(fs.readFileSync(file, 'utf8'));
    await page.addScriptTag({ path: PARSER });
    const capture = await page.evaluate(captureFor, opts.id);
    if (!capture) {
      console.error(`No ad with Library ID ${opts.id} in ${opts.fixture}.`);
      process.exitCode = 1;
      return;
    }
    const patch = longevityPatch({ metrics: {}, status: 'running' }, capture, new Date());
    console.log(JSON.stringify({ capture, patch }, null, 2));
  } finally {
    await browser.close();
  }
}

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const LOGIN_WALL = /you must log in|log in to continue|log into facebook/i;

async function runLive(opts) {
  loadEnv();
  const DB_URL = process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!DB_URL || !SERVICE_KEY) {
    console.error('Missing VITE_DB_URL or DB_SERVICE_KEY in .env');
    process.exit(1);
  }
  const OWN_BRAND = (process.env.OWN_BRAND || process.env.VITE_OWN_BRAND || '').trim().toLowerCase();
  if (!OWN_BRAND) console.warn('OWN_BRAND is not set: every ad with an Ad Library id is treated as a competitor.');

  const { createClient } = await import('@supabase/supabase-js');
  const { fetchAll } = await import('../src/lib/db.js');
  const { permalinkFor } = await import('../src/lib/adlibrary.js');
  const { autoVerdict, nextImportVerdict } = await import('../src/lib/ads.js');
  const db = createClient(DB_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const rows = await fetchAll((q) => q.not('metrics->>ad_library_id', 'is', null), 'ads', { client: db });
  if (rows.partial) {
    console.error(`Could not read every ad: ${rows.error?.message}`);
    process.exit(1);
  }
  const ads = checkOrder(rows.filter((ad) => (ad.brand || '').trim().toLowerCase() !== OWN_BRAND || !OWN_BRAND)).slice(0, opts.limit);
  console.log(`${ads.length} ads to check${opts.dryRun ? ' (dry run, nothing is written)' : ''}.`);
  if (!ads.length) return;

  const chromium = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
  let failures = 0;
  let updated = 0;
  try {
    for (const [i, ad] of ads.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, pauseMs()));
      const id = String(ad.metrics.ad_library_id);
      let capture = null;
      try {
        await page.goto(permalinkFor(id), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(
          (re) => /Library ID/.test(document.body?.innerText || '') || new RegExp(re, 'i').test(document.body?.innerText || ''),
          LOGIN_WALL.source,
          { timeout: 20000 }
        );
        const text = await page.evaluate(() => document.body.innerText);
        if (LOGIN_WALL.test(text) && !/Library ID/.test(text)) {
          console.error('Meta is asking for a login. Stopping: this script never signs in.');
          break;
        }
        await page.addScriptTag({ path: PARSER });
        capture = await page.evaluate(captureFor, id);
      } catch (err) {
        capture = null;
        console.error(`  ${id}: ${err.message.split('\n')[0]}`);
      }
      if (!capture) {
        failures++;
        console.error(`  ${id}: card not found (${failures} in a row).`);
        if (failures >= MAX_FAILURES_IN_A_ROW) {
          console.error(`Stopping after ${MAX_FAILURES_IN_A_ROW} failures in a row.`);
          break;
        }
        continue;
      }
      failures = 0;
      const patch = longevityPatch(ad, capture, new Date());
      const update = { metrics: patch.metrics, status: patch.status };
      if (opts.rescore) {
        const newAuto = autoVerdict({ ...ad, ...update });
        const next = nextImportVerdict(ad, newAuto);
        if (next) {
          update.verdict = next;
          update.metrics = { ...update.metrics, auto_verdict: next };
        }
      }
      const line = `  ${id} ${ad.brand || ''}: live ${patch.metrics.live}, ${patch.metrics.days_running ?? '?'} days${update.verdict ? `, verdict ${update.verdict}` : ''}`;
      if (opts.dryRun) {
        console.log(`${line} (dry run)`);
        continue;
      }
      const { error } = await db.from('ads').update(update).eq('id', ad.id);
      if (error) console.error(`${line}: update failed, ${error.message}`);
      else {
        updated++;
        console.log(line);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Done. ${updated} updated.`);
}

const parsed = parseArgs(argv);
if (!parsed.ok) {
  console.error(parsed.error);
  console.error(USAGE);
  process.exit(1);
}
const opts = parsed.opts;
if (opts.help) {
  console.log(USAGE);
} else if (opts.fixture) {
  await runFixture(opts);
} else if (!optedIn(argv, process.env)) {
  console.error(TERMS_MESSAGE);
  process.exit(1);
} else {
  await runLive(opts);
}
