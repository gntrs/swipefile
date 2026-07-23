#!/usr/bin/env node
// Stars the genuinely elite ads already sitting in the `ads` table, so the team
// can open one short list and copy the angles instead of scrolling ~2,700 rows.
//
// The star is metrics.starred (see src/lib/ads.js setStarred / isStarred). This
// script is PURELY ADDITIVE: it merges { starred: true } into the existing
// metrics object and never unstars, never clears, never touches another column.
// A human curation can only ever grow, never be destroyed by a re-run.
//
// Thresholds are not invented here. The winner cutoffs come from VERDICT_RULES
// and scoreVerdict() in src/lib/ads.js (the one place those live), reach ratings
// come from reachRating(). What this script adds is the CUT: how far up the real
// distribution "elite" starts, plus the two things a ranked list needs to stay
// useful, a copy-quality gate and a per-brand cap.
//
// WHAT THE SURVEY FOUND (run --survey to reproduce): reach is almost absent in
// this table. 2,652 of 2,690 rows came from the Foreplay Spyder importer, which
// never wrote reach; the eu_reach column is empty everywhere and metrics.reach
// exists on only 10 rows (our own Meta CSV ads). So reach cannot carry the
// selection today. Run length on live ads carries it instead, which is exactly
// what VERDICT_RULES is built on: a rival who keeps paying is the proof. Reach
// stays wired in as a gate and a ranking signal so this script gets sharper for
// free once scripts/import-ad-library.mjs starts filling eu_total_reach.
//
// Usage:
//   node scripts/star-winners.mjs --survey     # read-only distribution, exits
//   node scripts/star-winners.mjs --dry-run    # full ranked table, writes nothing
//   node scripts/star-winners.mjs              # applies the stars
//   node scripts/star-winners.mjs --per-brand 10 --limit 40
//   node scripts/star-winners.mjs --help
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY (service role, local
// only, gitignored, same rules as export.mjs).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { hasPerformance, isStarred, reachRating, scoreVerdict, VERDICT_RULES } from '../src/lib/ads.js';

// Tiny .env loader (no dotenv dep), same as the other scripts.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ------------------------------ args ---------------------------------
const argv = process.argv.slice(2);
// Accepts both idioms the other scripts use: "--limit 40" and "--limit=40".
function argVal(name, fallback) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return fallback;
}
const argNum = (name, fallback) => {
  const raw = argVal(name, null);
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`Bad value for ${name}: "${raw}" is not a number.`);
    process.exit(1);
  }
  return n;
};

const HELP = `star-winners.mjs - star the top tier of ads that already exist in the table

  --survey             print the read-only distribution and exit (writes nothing)
  --dry-run            print the full ranked table of what WOULD be starred
  --min-reach N        reach floor, applied ONLY to rows that have reach at all
                       (eu_reach column, metrics.eu_reach or metrics.reach). Rows
                       with no reach anywhere are judged on run length. (default 2500)
  --min-reach-per-day N  reach per day that counts as a signal (default 700)
  --min-signals N      how many of the 5 winner signals an ad must carry (default 2)
  --min-days N         minimum days_running when the row has that field (default 14)
  --min-copy N         minimum characters of hook + ad_copy. An ad with no copy is
                       nothing to copy, so it cannot be a swipe. Waived for rows
                       with real spend data, where the money is the evidence and
                       the ad is identified by metrics.ad_name. (default 25)
  --live-days N        live this long is the long-live signal (default ${VERDICT_RULES.LIVE_WINNER_DAYS}, VERDICT_RULES.LIVE_WINNER_DAYS)
  --dead-days N        ran this long at all is the long-run signal (default ${VERDICT_RULES.DEAD_WINNER_DAYS}, VERDICT_RULES.DEAD_WINNER_DAYS)
  --verdict a,b        acceptable verdicts, comma separated (default winner)
  --per-brand N        max starred ads per brand so one advertiser cannot own the
                       list (default 15)
  --limit N            hard cap on how many ads get starred (default 60)
  --help               this text

The 5 signals counted by --min-signals:
  1. verdict is a winner (the stored verdict, or scoreVerdict() agrees)
  2. reachRating() says AMAZING
  3. reach per day at or above --min-reach-per-day
  4. live and running at least --live-days
  5. ran at least --dead-days, live or not

Also enforced, and not overridable because they are correctness not taste:
  near duplicate copy is collapsed (same angle re-uploaded keeps its best row).

Env (.env): VITE_DB_URL, DB_SERVICE_KEY.`;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const surveyOnly = argv.includes('--survey');
const dryRun = argv.includes('--dry-run');

const MIN_REACH = argNum('--min-reach', 2500);
const MIN_RPD = argNum('--min-reach-per-day', 700);
const MIN_SIGNALS = argNum('--min-signals', 2);
const MIN_DAYS = argNum('--min-days', 14);
const MIN_COPY = argNum('--min-copy', 25);
const LIVE_DAYS = argNum('--live-days', VERDICT_RULES.LIVE_WINNER_DAYS);
const DEAD_DAYS = argNum('--dead-days', VERDICT_RULES.DEAD_WINNER_DAYS);
const PER_BRAND = argNum('--per-brand', 15);
const LIMIT = argNum('--limit', 60);
const VERDICTS = String(argVal('--verdict', 'winner'))
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

// ------------------------------ env ----------------------------------
const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const serviceKey = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!url || !serviceKey) {
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
}
console.log(`Service key loaded (ends ...${String(serviceKey).slice(-4)}).`);

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// The database API caps one select at 1000 rows, so page through the whole table.
async function fetchAllAds() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('ads').select('*').range(from, from + 999);
    if (error) {
      console.error(`Could not read ads: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// ---------------------------- readers --------------------------------
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Reach lives in three places depending on which importer wrote the row: the
// eu_reach COLUMN (scripts/sync-geo.mjs), metrics.eu_reach (older geo writes)
// and metrics.reach (the Meta CSV import and the Ad Library importers, which
// store eu_total_reach there). They mean the same thing, so take whichever is
// populated and remember where it came from so --survey can report the split.
function resolveReach(ad) {
  const col = num(ad?.eu_reach);
  if (col) return { value: col, source: 'eu_reach column' };
  const metaEu = num(ad?.metrics?.eu_reach);
  if (metaEu) return { value: metaEu, source: 'metrics.eu_reach' };
  const mr = num(ad?.metrics?.reach);
  if (mr) return { value: mr, source: 'metrics.reach' };
  return { value: null, source: null };
}

const daysRunning = (ad) => num(ad?.metrics?.days_running);
const isLive = (ad) =>
  typeof ad?.metrics?.live === 'boolean' ? ad.metrics.live : ad?.status === 'running';

function reachPerDay(ad, reach) {
  const stored = num(ad?.metrics?.reach_per_day);
  if (stored) return stored;
  const d = daysRunning(ad);
  if (reach && d) return Math.round(reach / d);
  return null;
}

const copyText = (ad) => `${ad?.hook || ''} ${ad?.ad_copy || ''}`.replace(/\s+/g, ' ').trim();

// Dedupe key for "the same angle uploaded twice". Punctuation and case are
// noise; the first 120 characters are where the hook lives.
const angleKey = (ad) =>
  copyText(ad).toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

const permalink = (ad) => ad?.metrics?.ad_permalink || ad?.metrics?.source_url || '';

const pct = (sorted, p) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
};

// ---------------------------- survey ---------------------------------
function survey(ads) {
  const reachSources = new Map();
  const verdicts = new Map();
  const ratings = new Map();
  const sources = new Map();
  const reaches = [];
  const rpds = [];
  const dayVals = [];
  let live = 0;
  let withDays = 0;
  let withCopy = 0;
  let starredNow = 0;

  for (const ad of ads) {
    const { value, source } = resolveReach(ad);
    if (source) reachSources.set(source, (reachSources.get(source) || 0) + 1);
    if (value) reaches.push(value);
    const v = ad.verdict || '(none)';
    verdicts.set(v, (verdicts.get(v) || 0) + 1);
    const r = reachRating(ad);
    const label = r ? r.label : '(no reach or ctr data)';
    ratings.set(label, (ratings.get(label) || 0) + 1);
    const src = ad.metrics?.source || ad.added_by_email || '(unknown)';
    sources.set(src, (sources.get(src) || 0) + 1);
    const d = daysRunning(ad);
    if (d) { withDays++; dayVals.push(d); }
    if (isLive(ad)) live++;
    if (copyText(ad).length >= MIN_COPY) withCopy++;
    const rpd = reachPerDay(ad, value);
    if (rpd) rpds.push(rpd);
    if (isStarred(ad)) starredNow++;
  }

  reaches.sort((a, b) => a - b);
  rpds.sort((a, b) => a - b);
  dayVals.sort((a, b) => a - b);

  const line = (k, v) => console.log(`  ${String(k).padEnd(30)} ${v}`);
  console.log('');
  console.log('=== SURVEY (read only) ======================================');
  line('rows in `ads`', ads.length);
  line('already starred', starredNow);
  line(`with >= ${MIN_COPY} chars of copy`, withCopy);
  console.log('');
  console.log('Where the rows came from:');
  for (const [s, n] of [...sources.entries()].sort((a, b) => b[1] - a[1])) line(s, n);
  console.log('');
  console.log('Reach data, by where it lives (first populated wins):');
  for (const [src, n] of [...reachSources.entries()].sort((a, b) => b[1] - a[1])) line(src, n);
  line('no reach anywhere', ads.length - reaches.length);
  if (reaches.length) {
    console.log('');
    console.log(`Reach percentiles (the ${reaches.length} rows that have reach):`);
    for (const p of [10, 25, 50, 75, 90, 95, 99]) line(`p${p}`, pct(reaches, p).toLocaleString('en-US'));
    line('max', (reaches[reaches.length - 1] || 0).toLocaleString('en-US'));
  }
  console.log('');
  console.log('Reach per day (stored, or reach / days_running):');
  line('rows with reach/day', rpds.length);
  for (const p of [50, 90, 99]) line(`p${p}`, pct(rpds, p).toLocaleString('en-US'));
  line('max', (rpds[rpds.length - 1] || 0).toLocaleString('en-US'));
  console.log('');
  console.log('Verdicts:');
  for (const [v, n] of [...verdicts.entries()].sort((a, b) => b[1] - a[1])) line(v, n);
  console.log('');
  console.log('reachRating() labels:');
  for (const [v, n] of [...ratings.entries()].sort((a, b) => b[1] - a[1])) line(v, n);
  console.log('');
  console.log('Run length:');
  line('live now', live);
  line('has days_running', withDays);
  for (const p of [50, 75, 90, 95, 99]) line(`days p${p}`, pct(dayVals, p));
  line('max days', dayVals[dayVals.length - 1] || 0);
  for (const t of [30, LIVE_DAYS, DEAD_DAYS, 120, 180]) {
    line(`live and >= ${t}d`, ads.filter((a) => isLive(a) && (daysRunning(a) || 0) >= t).length);
  }
  console.log('=============================================================');
  console.log('');
}

// ---------------------------- selection ------------------------------
// Five independent winner signals. An ad must carry --min-signals of them, so a
// bare verdict label alone never buys a star and neither does raw reach.
function evaluate(ad) {
  const { value: reach } = resolveReach(ad);
  const days = daysRunning(ad);
  const rpd = reachPerDay(ad, reach);
  const rating = reachRating(ad);
  const scored = scoreVerdict(ad);
  const live = isLive(ad);

  const signals = [];
  if (VERDICTS.includes(String(ad.verdict || '').toLowerCase()) || VERDICTS.includes(scored.verdict))
    signals.push('verdict');
  if (rating && rating.label === 'AMAZING') signals.push('amazing');
  if (rpd && rpd >= MIN_RPD) signals.push('reach/day');
  if (live && days && days >= LIVE_DAYS) signals.push('long-live');
  if (days && days >= DEAD_DAYS) signals.push('long-run');

  return {
    ad,
    reach,
    days,
    rpd,
    live,
    rating: rating ? rating.label : '',
    verdict: ad.verdict || scored.verdict,
    reason: scored.reason,
    signals,
  };
}

function select(ads) {
  const reasons = new Map();
  const bump = (why) => reasons.set(why, (reasons.get(why) || 0) + 1);

  const eligible = [];
  for (const ad of ads) {
    const r = evaluate(ad);
    // An ad with no copy is nothing to copy. This comes first: it is the whole
    // point of the list. The one exception is our own ads imported from the Meta
    // CSV, which carry real spend and CTR but often no creative text at all. For
    // those the money IS the evidence, and the team finds them by
    // metrics.ad_name in Ads Manager, so they are not junk rows.
    if (copyText(ad).length < MIN_COPY && !hasPerformance(ad)) {
      bump(`under --min-copy ${MIN_COPY} chars`);
      continue;
    }
    // Reach floor applies only where reach exists at all. Rows with no reach
    // data are not penalised for an importer that never wrote the field.
    if (r.reach != null && r.reach < MIN_REACH) { bump(`reach below --min-reach ${MIN_REACH}`); continue; }
    if (r.days != null && r.days < MIN_DAYS) { bump(`ran under --min-days ${MIN_DAYS}`); continue; }
    if (r.signals.length < MIN_SIGNALS) { bump(`under --min-signals ${MIN_SIGNALS}`); continue; }
    eligible.push(r);
  }

  // Rank: signal count first (a four-signal ad beats a two-signal one), then
  // reach per day, this repo's own "spending hard on something that works"
  // measure, then run length, then absolute reach.
  const rank = (a, b) =>
    b.signals.length - a.signals.length ||
    (b.rpd || 0) - (a.rpd || 0) ||
    (b.days || 0) - (a.days || 0) ||
    (b.reach || 0) - (a.reach || 0);
  eligible.sort(rank);

  // Collapse re-uploads of the same angle, keeping the best ranked instance.
  const seenAngle = new Set();
  const unique = [];
  let dupes = 0;
  for (const r of eligible) {
    const key = angleKey(r.ad);
    if (key && seenAngle.has(key)) { dupes++; continue; }
    if (key) seenAngle.add(key);
    unique.push(r);
  }

  // Per-brand cap, applied on the ranked order so each brand keeps its best.
  const perBrand = new Map();
  const capped = [];
  let brandDropped = 0;
  for (const r of unique) {
    const key = String(r.ad.brand || 'Unknown').toLowerCase();
    const n = perBrand.get(key) || 0;
    if (n >= PER_BRAND) { brandDropped++; continue; }
    perBrand.set(key, n + 1);
    capped.push(r);
  }

  const overflow = Math.max(0, capped.length - LIMIT);
  return { picked: capped.slice(0, LIMIT), eligible, unique, reasons, dupes, brandDropped, overflow };
}

// ------------------------------ run ----------------------------------
const ads = await fetchAllAds();
survey(ads);
if (surveyOnly) process.exit(0);

console.log(
  `Cut: copy >= ${MIN_COPY} chars, reach >= ${MIN_REACH} where present, days >= ${MIN_DAYS}, ` +
    `signals >= ${MIN_SIGNALS} of 5 (live-days ${LIVE_DAYS}, dead-days ${DEAD_DAYS}, ` +
    `reach/day ${MIN_RPD}), verdicts [${VERDICTS.join(', ')}], max ${PER_BRAND}/brand, limit ${LIMIT}` +
    `${dryRun ? '  [DRY RUN, nothing is written]' : ''}`
);

const { picked, eligible, unique, reasons, dupes, brandDropped, overflow } = select(ads);

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
const padNum = (s, n) => String(s ?? '').padStart(n);
console.log('');
console.log(
  `${pad('#', 3)} ${pad('BRAND', 26)} ${padNum('REACH', 8)} ${padNum('DAYS', 5)} ${padNum('R/DAY', 7)} ` +
    `${pad('LIVE', 5)} ${pad('VERDICT', 8)} ${pad('RATING', 8)} ${pad('SIGNALS', 30)} ${pad('STAR', 5)} LINK`
);
console.log('-'.repeat(170));
picked.forEach((r, i) => {
  console.log(
    `${pad(i + 1, 3)} ${pad(r.ad.brand, 26)} ${padNum(r.reach ? r.reach.toLocaleString('en-US') : '-', 8)} ` +
      `${padNum(r.days ?? '-', 5)} ${padNum(r.rpd ? r.rpd.toLocaleString('en-US') : '-', 7)} ` +
      `${pad(r.live ? 'yes' : 'no', 5)} ${pad(r.verdict, 8)} ${pad(r.rating || '-', 8)} ` +
      `${pad(r.signals.join('+'), 30)} ${pad(isStarred(r.ad) ? 'was' : 'new', 5)} ${permalink(r.ad) || '(no link)'}`
  );
});
if (!picked.length) console.log('(nothing cleared the cut)');
console.log('');
console.log('Hooks, so the cut can be judged on the writing and not just the numbers:');
picked.forEach((r, i) => {
  const text = copyText(r.ad) || (r.ad.metrics?.ad_name ? `[ad name] ${r.ad.metrics.ad_name}` : '(no copy stored)');
  console.log(`${padNum(i + 1, 3)}. ${r.ad.brand}: ${text.slice(0, 110)}`);
});
console.log('');

if (reasons.size) {
  console.log('Not eligible:');
  for (const [why, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n} x ${why}`);
}
if (dupes) console.log(`  ${dupes} x same angle already in the list (re-upload collapsed)`);
if (brandDropped) console.log(`  ${brandDropped} x over the ${PER_BRAND}/brand cap`);
if (overflow) console.log(`  ${overflow} x ranked below --limit ${LIMIT}`);
console.log(
  `eligible ${eligible.length}, distinct angles ${unique.length}, kept ${picked.length} of ${ads.length} row(s).`
);
const brandTally = new Map();
for (const r of picked) brandTally.set(r.ad.brand, (brandTally.get(r.ad.brand) || 0) + 1);
console.log('Brand spread of the kept list:');
for (const [b, n] of [...brandTally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${pad(b, 44)} ${n}`);
console.log('');

if (dryRun) {
  const already = picked.filter((r) => isStarred(r.ad)).length;
  console.log(`--dry-run: would star ${picked.length - already} new ad(s), ${already} already starred. Nothing written.`);
  process.exit(0);
}

// ----------------------------- writing -------------------------------
// Sequential on purpose: this is a shared table and there is no reason to race.
// Additive only: metrics is spread first so nothing else in it is clobbered, an
// already starred row is skipped rather than rewritten, and no other column is
// ever part of the update payload.
let starred = 0;
let skipped = 0;
let failed = 0;
const failures = [];

for (let i = 0; i < picked.length; i++) {
  const r = picked[i];
  const label = `${String(i + 1).padStart(3)}/${picked.length} ${r.ad.brand}`;
  if (isStarred(r.ad)) {
    skipped++;
    console.log(`  ${label}: already starred, skipped`);
    continue;
  }
  const metrics = { ...(r.ad.metrics || {}), starred: true };
  const { error } = await sb.from('ads').update({ metrics }).eq('id', r.ad.id);
  if (error) {
    failed++;
    failures.push(`${r.ad.id} (${r.ad.brand}): ${error.message}`);
    console.error(`  ${label}: FAILED ${error.message}`);
    continue;
  }
  starred++;
  console.log(`  ${label}: starred`);
}

console.log('');
console.log(`starred ${starred}, already starred ${skipped}, failed ${failed}`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  ${f}`));
}

// Verification: re-read the table and count metrics.starred = true for real.
const { count, error: verifyErr } = await sb
  .from('ads')
  .select('id', { count: 'exact', head: true })
  .eq('metrics->>starred', 'true');
if (verifyErr) console.error(`Verification query failed: ${verifyErr.message}`);
else console.log(`verification: ${count} row(s) in \`ads\` now have metrics.starred = true`);
