// Meta Ads Manager exports (your own ads): which columns hold what, summing
// the rows of one ad name, and the metrics an ad row gets. Moved unchanged
// from scripts/import-ads-csv.mjs, which now imports it, so the browser import
// and the script write exactly the same numbers. Plain relative imports only.

// Meta renames columns depending on locale/metric setup, so match loosely.
function findCol(headers, ...patterns) {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i !== -1) return i;
  }
  return -1;
}

export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Header row (as in the file) -> index of each column, -1 when missing.
export function metaColumns(rawHeaders) {
  const headers = (rawHeaders || []).map((h) => String(h ?? '').trim().toLowerCase());
  return {
    name: findCol(headers, /^ad name$/, /ad name/),
    spend: findCol(headers, /amount spent/, /^spend/),
    impressions: findCol(headers, /^impressions$/),
    clicks: findCol(headers, /^link clicks$/, /clicks \(all\)/, /^clicks$/),
    results: findCol(headers, /^results$/),
    roas: findCol(headers, /purchase roas/, /roas/),
    currency: findCol(headers, /^currency$/),
    // Ratio columns: some exports carry CTR/CPC/CPM directly instead of raw
    // impressions/clicks. Read them too and spend-weight when summing rows.
    ctr: findCol(headers, /ctr.*link click/, /^ctr/),
    cpc: findCol(headers, /cpc \(cost per link click/, /^cpc/),
    cpm: findCol(headers, /^cpm/),
    reach: findCol(headers, /^reach$/),
    lpv: findCol(headers, /landing page views/),
    freq: findCol(headers, /^frequency$/),
    plays3s: findCol(headers, /3-second video plays/),
    delivery: findCol(headers, /^ad delivery$/),
  };
}

// An Ads Manager export: an ad name column plus spend, impressions or results.
export function isMetaExport(headers) {
  const col = metaColumns(headers);
  return col.name !== -1 && (col.spend !== -1 || col.impressions !== -1 || col.results !== -1);
}

// Data rows (no header) -> Map of ad name -> running sums. Day and placement
// breakdowns collapse into totals.
export function aggregateMeta(rows, col) {
  const byName = new Map();
  for (const r of rows || []) {
    const name = (r[col.name] || '').trim();
    if (!name) continue;
    const a =
      byName.get(name) ||
      { spend: 0, impressions: 0, clicks: 0, results: 0, roasSpend: 0, roasSum: 0, currency: null,
        reach: 0, lpv: 0, plays3s: 0, delivery: null, w: {} };
    const rowSpend = col.spend !== -1 ? num(r[col.spend]) : 0;
    a.spend += rowSpend;
    a.impressions += col.impressions !== -1 ? num(r[col.impressions]) : 0;
    a.clicks += col.clicks !== -1 ? num(r[col.clicks]) : 0;
    a.results += col.results !== -1 ? num(r[col.results]) : 0;
    a.reach += col.reach !== -1 ? num(r[col.reach]) : 0;
    a.lpv += col.lpv !== -1 ? num(r[col.lpv]) : 0;
    a.plays3s += col.plays3s !== -1 ? num(r[col.plays3s]) : 0;
    if (col.delivery !== -1 && r[col.delivery]) {
      // Active is the live truth: if ANY row for this ad name is active (e.g. a
      // live ad plus an archived duplicate of the same name), the ad is active.
      // Otherwise the last non-empty delivery wins.
      const dlv = r[col.delivery].trim().toLowerCase();
      if (a.delivery !== 'active') a.delivery = dlv;
    }
    if (col.roas !== -1 && r[col.roas] !== '') {
      a.roasSum += num(r[col.roas]) * (rowSpend || 1);
      a.roasSpend += rowSpend || 1;
    }
    // Spend-weighted averages for the ratio columns.
    for (const k of ['ctr', 'cpc', 'cpm', 'freq']) {
      if (col[k] !== -1 && r[col[k]] !== '') {
        a.w[k] = a.w[k] || { sum: 0, spend: 0 };
        a.w[k].sum += num(r[col[k]]) * (rowSpend || 1);
        a.w[k].spend += rowSpend || 1;
      }
    }
    if (col.currency !== -1 && r[col.currency]) a.currency = r[col.currency].trim();
    byName.set(name, a);
  }
  return byName;
}

// One ad name's sums -> { fresh, status }: the metrics to write (merged over
// what an existing row has) and the status from Meta's delivery column
// (undefined when the export has none).
export function metaRowFor(name, a, today) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const weighted = (k) => (a.w[k]?.spend ? round2(a.w[k].sum / a.w[k].spend) : null);
  // Prefer raw counts; fall back to the export's own ratio columns, and
  // estimate the counts back from them so sorting has numbers to work with.
  const ctr = a.impressions ? round2((a.clicks / a.impressions) * 100) : weighted('ctr');
  const cpc = a.clicks ? round2(a.spend / a.clicks) : weighted('cpc');
  const cpm = weighted('cpm');
  const clicks = a.clicks || (cpc ? Math.round(a.spend / cpc) : 0);
  const impressions = a.impressions || (cpm ? Math.round((a.spend / cpm) * 1000) : 0);
  const fresh = {
    ad_name: name,
    source: 'meta-csv',
    spend: round2(a.spend),
    impressions,
    clicks,
    results: a.results,
    ctr,
    cpc,
    cpm: cpm ?? undefined,
    reach: a.reach || undefined,
    landing_page_views: a.lpv || undefined,
    frequency: weighted('freq') ?? undefined,
    video_plays_3s: a.plays3s || undefined,
    delivery: a.delivery || undefined,
    roas: a.roasSpend ? round2(a.roasSum / a.roasSpend) : null,
    currency: a.currency || undefined,
    last_csv_import: today,
  };
  // Meta's delivery column is the live truth for our own ads.
  const status = a.delivery === 'active' ? 'running' : a.delivery ? 'dead' : undefined;
  return { fresh, status };
}

// The whole file at once: [{ name, fresh, status }] in file order.
export function metaRows(rows, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!rows || rows.length < 1) return [];
  const col = metaColumns(rows[0]);
  if (col.name === -1) return [];
  return [...aggregateMeta(rows.slice(1), col)].map(([name, a]) => ({ name, ...metaRowFor(name, a, today) }));
}
