import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../src/lib/csv/parse.js';
import { metaColumns, isMetaExport, aggregateMeta, metaRowFor, metaRows } from '../../src/lib/csv/meta.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/csv/${name}`, import.meta.url), 'utf8');
const TODAY = '2026-09-29';

// Produced by running the parse and sum code of the original
// scripts/import-ads-csv.mjs on the same files, before it moved. The moved
// code must give exactly this.
const EXPECTED_DAILY = [
  {
    name: 'Sample_breakfast_static_v1',
    fresh: {
      ad_name: 'Sample_breakfast_static_v1', source: 'meta-csv', spend: 36.45, impressions: 4415, clicks: 89,
      results: 6, ctr: 2.02, cpc: 0.41, reach: 3910, landing_page_views: 63, frequency: 1.13, delivery: 'active',
      roas: 1.96, currency: 'EUR', last_csv_import: TODAY,
    },
    status: 'running',
  },
  {
    name: 'Sample_reviews_ugc_v2, cut B',
    fresh: {
      ad_name: 'Sample_reviews_ugc_v2, cut B', source: 'meta-csv', spend: 58.5, impressions: 8000, clicks: 221,
      results: 11, ctr: 2.76, cpc: 0.26, reach: 6800, landing_page_views: 167, frequency: 1.17, video_plays_3s: 4000,
      delivery: 'archived', roas: 2.3, currency: 'EUR', last_csv_import: TODAY,
    },
    status: 'dead',
  },
  {
    name: 'Sample_founder_video_v3',
    fresh: {
      ad_name: 'Sample_founder_video_v3', source: 'meta-csv', spend: 11.25, impressions: 1750, clicks: 10,
      results: 0, ctr: 0.57, cpc: 1.13, reach: 1660, landing_page_views: 8, frequency: 1.06, video_plays_3s: 970,
      delivery: 'not delivering', roas: 0.48, currency: 'EUR', last_csv_import: TODAY,
    },
    status: 'dead',
  },
];

const EXPECTED_RATIO = [
  {
    name: 'Sample_ratio_only_v1',
    fresh: {
      ad_name: 'Sample_ratio_only_v1', source: 'meta-csv', spend: 30, impressions: 3436, clicks: 41, results: 0,
      ctr: 1.7, cpc: 0.73, cpm: 8.73, delivery: 'active', roas: null, last_csv_import: TODAY,
    },
    status: 'running',
  },
  {
    name: 'Sample_ratio_only_v2',
    fresh: {
      ad_name: 'Sample_ratio_only_v2', source: 'meta-csv', spend: 0, impressions: 0, clicks: 0, results: 0,
      ctr: 1, cpc: null, delivery: 'inactive', roas: null, last_csv_import: TODAY,
    },
    status: 'dead',
  },
];

// JSON round trip drops undefined keys, exactly like the rows written to the
// database.
const asJson = (v) => JSON.parse(JSON.stringify(v));

describe('Meta export helpers, moved from the script', () => {
  it('sums a daily export per ad name exactly like the original script', () => {
    expect(asJson(metaRows(parseCsv(fixture('meta-daily.csv')), { today: TODAY }))).toEqual(EXPECTED_DAILY);
  });
  it('fills counts back from ratio only columns exactly like the original script', () => {
    expect(asJson(metaRows(parseCsv(fixture('meta-ratio.csv')), { today: TODAY }))).toEqual(EXPECTED_RATIO);
  });
  it('the pieces compose the same way the script uses them', () => {
    const rows = parseCsv(fixture('meta-daily.csv'));
    const col = metaColumns(rows[0]);
    const byName = aggregateMeta(rows.slice(1), col);
    expect([...byName.keys()]).toEqual(EXPECTED_DAILY.map((r) => r.name));
    const one = metaRowFor('Sample_founder_video_v3', byName.get('Sample_founder_video_v3'), TODAY);
    expect(asJson(one)).toEqual({ fresh: EXPECTED_DAILY[2].fresh, status: 'dead' });
  });
  it('skips rows with no ad name', () => {
    const rows = parseCsv(fixture('meta-daily.csv'));
    const byName = aggregateMeta(rows.slice(1), metaColumns(rows[0]));
    expect(byName.has('')).toBe(false);
  });
  it('no delivery column means no status', () => {
    const rows = parseCsv('Ad name,Amount spent (EUR)\nA,5\nA,2.5');
    expect(asJson(metaRows(rows, { today: TODAY }))).toEqual([
      { name: 'A', fresh: { ad_name: 'A', source: 'meta-csv', spend: 7.5, impressions: 0, clicks: 0, results: 0, ctr: null, cpc: null, roas: null, last_csv_import: TODAY } },
    ]);
  });
  it('metaColumns matches loosely and reports missing columns as -1', () => {
    const col = metaColumns(['  AD NAME ', 'Amount spent (USD)', 'Clicks (all)', 'CTR (all)']);
    expect(col.name).toBe(0);
    expect(col.spend).toBe(1);
    expect(col.clicks).toBe(2);
    expect(col.ctr).toBe(3);
    expect(col.impressions).toBe(-1);
    expect(col.delivery).toBe(-1);
  });
  it('isMetaExport needs an ad name plus spend, impressions or results', () => {
    expect(isMetaExport(['Ad name', 'Amount spent (EUR)'])).toBe(true);
    expect(isMetaExport(['Ad name', 'Impressions'])).toBe(true);
    expect(isMetaExport(['Ad name', 'Results'])).toBe(true);
    expect(isMetaExport(['Ad name', 'Reach'])).toBe(false);
    expect(isMetaExport(['brand', 'spend'])).toBe(false);
    expect(isMetaExport([])).toBe(false);
    expect(isMetaExport(undefined)).toBe(false);
  });
  it('metaRows on empty input or without an ad name column gives nothing', () => {
    expect(metaRows([])).toEqual([]);
    expect(metaRows([['brand'], ['x']])).toEqual([]);
  });
});
