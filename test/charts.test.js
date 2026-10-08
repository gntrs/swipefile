import { describe, it, expect } from 'vitest';
import { barPct, niceMax, dailySeries, enoughForLine, knownPoints, linePath, nearestIndex } from '../src/lib/charts.js';
import { ourPerformance, rivalPressure, adClicks } from '../src/lib/performance.js';
import { funnelSummary, windowStart, parseFunnelStages } from '../src/lib/funnel.js';
import { rankHistory, rankChange, rankChangeText, latestTrends, timeframeText } from '../src/lib/intel.js';
import { bestIndex } from '../src/lib/compare.js';
import { revenueStats } from '../src/lib/revenue.js';
import { reachRating } from '../src/lib/ads.js';
import { dashboardSummary } from '../src/lib/dashboard.js';
import { buildSeed } from '../src/lib/demo/seed.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const OWN = (b) => b === 'Driftwood Oats';
const seedAds = () => buildSeed(NOW).tables.ads;

describe('barPct: bars start at zero and never fake a sliver', () => {
  it.each([
    [0, 10, 0],
    [-3, 10, 0],
    [5, 10, 50],
    [10, 10, 100],
    [12, 10, 100],
    [3, 0, 0],
    [3, -1, 0],
    [null, 10, 0],
    [undefined, 10, 0],
    ['x', 10, 0],
    ['4', '8', 50],
    [NaN, 10, 0],
    [5, Infinity, 0],
  ])('barPct(%s, %s) is %s', (v, m, out) => {
    expect(barPct(v, m)).toBe(out);
  });
});

describe('niceMax', () => {
  it.each([
    [0, 1],
    [-5, 1],
    [null, 1],
    ['x', 1],
    [1, 1],
    [3, 5],
    [7, 10],
    [11, 20],
    [23, 25],
    [240, 250],
    [251, 500],
    [1000, 1000],
    [0.3, 0.5],
  ])('niceMax(%s) is %s', (v, out) => {
    expect(niceMax(v)).toBeCloseTo(out, 9);
  });
  it('is never below the value', () => {
    for (let v = 0.01; v < 5000; v *= 1.37) expect(niceMax(v)).toBeGreaterThanOrEqual(v);
  });
});

describe('dailySeries: a missing day is unknown, not zero', () => {
  const rows = [
    { day: '2026-09-01', v: 10 },
    { day: '2026-09-03', v: 0 },
    { day: '2026-09-03', v: 7 }, // the same day twice: the last row wins, never summed
    { day: '2026-09-04', v: 'bad' },
    { day: null, v: 5 },
    null,
  ];
  const s = dailySeries(rows, { from: '2026-09-01', to: '2026-09-04', value: (r) => r.v });
  it('has one entry per calendar day, inclusive', () => {
    expect(s.map((p) => p.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  });
  it('keeps real zeros and leaves gaps null', () => {
    expect(s.map((p) => p.value)).toEqual([10, null, 7, null]);
    expect(dailySeries([{ day: '2026-09-02', v: 0 }], { from: '2026-09-02', to: '2026-09-02', value: (r) => r.v })[0].value).toBe(0);
  });
  it('returns nothing for a reversed or bad window', () => {
    expect(dailySeries(rows, { from: '2026-09-05', to: '2026-09-01', value: (r) => r.v })).toEqual([]);
    expect(dailySeries(rows, { from: 'nope', to: '2026-09-01', value: (r) => r.v })).toEqual([]);
    expect(dailySeries(null, { from: '2026-09-01', to: '2026-09-02', value: (r) => r.v })).toEqual([
      { day: '2026-09-01', value: null },
      { day: '2026-09-02', value: null },
    ]);
  });
});

describe('line rules', () => {
  const pts = (...vals) => vals.map((value, i) => ({ day: `d${i}`, value }));
  it('needs three real points before it is a line', () => {
    expect(enoughForLine(pts(1, 2))).toBe(false);
    expect(enoughForLine(pts(1, null, 2, null))).toBe(false);
    expect(enoughForLine(pts(1, null, 2, 0))).toBe(true);
    expect(enoughForLine([])).toBe(false);
    expect(enoughForLine(null)).toBe(false);
    expect(knownPoints(pts(0, 0, null))).toBe(2);
  });
  it('draws from a zero baseline and breaks at gaps', () => {
    const d = linePath(pts(0, 5, null, 10), { width: 30, height: 10, max: 10 });
    expect(d).toBe('M0.00,10.00 L10.00,5.00 M30.00,0.00');
  });
  it('draws nothing without a scale', () => {
    expect(linePath(pts(1, 2, 3), { width: 30, height: 10, max: 0 })).toBe('');
    expect(linePath([], { width: 30, height: 10, max: 5 })).toBe('');
  });
  it('snaps the pointer to the nearest day', () => {
    const s = pts(1, 2, 3, 4, 5);
    expect(nearestIndex(s, 0)).toBe(0);
    expect(nearestIndex(s, 0.49)).toBe(2);
    expect(nearestIndex(s, 1)).toBe(4);
    expect(nearestIndex(s, 7)).toBe(4);
    expect(nearestIndex(s, -1)).toBe(0);
    expect(nearestIndex([], 0.5)).toBe(-1);
  });
});

describe('dashboard numbers on the demo seed, worked out by hand', () => {
  const s = dashboardSummary(seedAds(), { now: NOW, isOwn: OWN, top: 7 });
  it('counts the ads, winners, running and this week', () => {
    expect(s.total).toBe(24);
    expect(s.winners).toBe(7); // ads 2, 4, 7, 10, 13, 16, 19
    // 11 rival ads are live, plus our 3, which carry status running and no live flag
    expect(s.running).toBe(14);
    // created 1h, 2.5d and 5d ago; the fourth is 7.5d old
    expect(s.newThisWeek).toBe(3);
  });
  it('winners by angle: social proof twice, four angles once, one winner untagged', () => {
    expect(s.angles.map((a) => [a.label, a.count])).toEqual([
      ['Social proof', 2],
      ['Authority', 1],
      ['Curiosity', 1],
      ['Identity', 1],
      ['Story', 1],
    ]);
    expect(s.noAngle).toBe(1);
    expect(s.angles.reduce((n, a) => n + a.count, 0) + s.noAngle).toBe(s.winners);
  });
});

describe('ourPerformance', () => {
  it('matches the seed by hand: 353 spent, 600 clicks, 23,800 impressions', () => {
    const p = ourPerformance(seedAds(), OWN);
    expect(p.rows.map((r) => r.spend)).toEqual([240, 95, 18]);
    expect(p.totalSpend).toBe(353);
    expect(p.blendedCtr).toBeCloseTo((600 / 23800) * 100, 6); // 2.52%
    expect(p.blendedCpc).toBeCloseTo(353 / 600, 6); // 0.59
    expect(p.best.name).toBe('DO_reviews_ugc_v1');
    expect(p.maxCtr).toBe(3.1);
    expect(p.ctrAds).toBe(3);
  });
  it('an ad with spend but no clicks never inflates CPC', () => {
    const ads = [
      { id: 1, brand: 'Us', metrics: { spend: 100, clicks: 50, impressions: 1000 } },
      { id: 2, brand: 'Us', metrics: { spend: 900 } },
    ];
    const p = ourPerformance(ads, (b) => b === 'Us');
    expect(p.blendedCpc).toBe(2);
    expect(p.blendedCtr).toBe(5);
    expect(p.totalSpend).toBe(1000);
  });
  it('falls back to CTR times impressions when clicks are missing', () => {
    expect(adClicks({ ctr: 2, impressions: 1000 })).toBe(20);
    expect(adClicks({ clicks: 0, ctr: 2, impressions: 1000 })).toBe(0);
    expect(adClicks({ ctr: 2 })).toBe(null);
    expect(adClicks({ clicks: '' })).toBe(null);
    expect(adClicks()).toBe(null);
  });
  it('names no best when only one ad has a CTR', () => {
    const p = ourPerformance([{ id: 1, brand: 'Us', metrics: { ctr: 4, spend: 1 } }], (b) => b === 'Us');
    expect(p.best).toBe(null);
  });
  it('survives junk input', () => {
    for (const bad of [null, undefined, 'x', [null, 3, {}]]) {
      const p = ourPerformance(bad, () => true);
      expect(p.rows).toEqual([]);
      expect(p.blendedCtr).toBe(null);
      expect(p.blendedCpc).toBe(null);
    }
  });
});

describe('rivalPressure', () => {
  it('matches the seed by hand', () => {
    const p = rivalPressure(seedAds(), OWN);
    expect(p.running).toBe(11);
    expect(p.proven).toBe(12); // ran 30 days or more, whatever the verdict
    expect(p.top.map((b) => [b.brand, b.running, b.proven])).toEqual([
      ['Northpaw', 2, 3],
      ['Lumen Loop', 2, 2],
      ['Marrow & Moss', 2, 2],
      ['Quillfox', 2, 1],
      ['Sundial Skin', 2, 1],
      ['Kettle & Kite', 1, 1],
    ]);
    expect(p.more).toBe(0);
  });
  it('uses the live flag before status, like the rest of the app', () => {
    const p = rivalPressure([{ brand: 'R', status: 'running', metrics: { live: false } }], () => false);
    expect(p.running).toBe(0);
    expect(p.top).toEqual([]);
  });
  it('counts a rival with no brand nowhere and never lists our own brand', () => {
    const p = rivalPressure([{ brand: ' ', metrics: { live: true } }, { brand: 'Us', metrics: { live: true } }], (b) => b === 'Us');
    expect(p.running).toBe(0);
  });
});

describe('funnelSummary', () => {
  const stages = parseFunnelStages('a:A,b:B,c:C');
  it('sums each stage over the days and gives the share of the step above', () => {
    const rows = [
      { metrics: { funnel: { a: 100, b: 40, c: 10 } } },
      { metrics: { funnel: { a: 100, b: 20, c: 'x' } } },
      { metrics: {} },
      null,
    ];
    const f = funnelSummary(rows, stages);
    expect(f.stages.map((s) => s.value)).toEqual([200, 60, 10]);
    expect(f.stages.map((s) => s.ofPrev)).toEqual([null, 30, (10 / 60) * 100]);
    expect(f.max).toBe(200);
    expect(f.days).toBe(4);
  });
  it('shows a step over 100% as it is, because the counts are events', () => {
    const f = funnelSummary([{ metrics: { funnel: { a: 10, b: 15 } } }], stages);
    expect(f.stages[1].ofPrev).toBe(150);
  });
  it('has no share when the step above is zero', () => {
    const f = funnelSummary([{ metrics: { funnel: { a: 0, b: 5 } } }], stages);
    expect(f.stages[1].ofPrev).toBe(null);
    expect(f.stages[2].ofPrev).toBe(0 / 5 * 100);
  });
  it('an empty window is all zero', () => {
    expect(funnelSummary(undefined, stages).stages.map((s) => s.value)).toEqual([0, 0, 0]);
  });
  it('a 30 day window starts 29 days before today', () => {
    expect(windowStart(30, NOW)).toBe('2026-09-01');
    expect(windowStart(1, NOW)).toBe('2026-09-30');
  });
});

describe('search rank history', () => {
  const rows = [
    { day: '2026-09-03', market: 'DE', term: 't', is_ours: true, position: 4, scanned: 20 },
    { day: '2026-09-01', market: 'DE', term: 't', is_ours: true, position: 9, scanned: 20 },
    { day: '2026-09-02', market: 'DE', term: 't', is_ours: true, position: null, scanned: 20 },
    { day: '2026-09-03', market: 'DE', term: 't', is_ours: false, position: 1, scanned: 20 },
    { day: '2026-09-03', market: 'FR', term: 't', is_ours: true, position: 2, scanned: 20 },
  ];
  it('keeps our rows for the market and term, oldest first, a miss as null', () => {
    expect(rankHistory(rows, { market: 'DE', term: 't' }).map((h) => h.position)).toEqual([9, null, 4]);
  });
  it('compares only the first and the latest check, in words', () => {
    const c = rankChange(rankHistory(rows, { market: 'DE', term: 't' }));
    expect(c.kind).toBe('moved');
    expect(c.climbed).toBe(5);
    expect(rankChangeText(c)).toBe('up 5 since 2026-09-01');
  });
  it.each([
    [[4, 9], 'down 5 since d0'],
    [[3, 3], 'same as d0'],
    [[null, 3], 'not found on d0'],
    [[3, null], 'was #3 on d0'],
    [[null, null], 'not found since d0'],
  ])('%j reads %s', (positions, text) => {
    const h = positions.map((position, i) => ({ day: `d${i}`, position }));
    expect(rankChangeText(rankChange(h))).toBe(text);
  });
  it('says nothing with a single check', () => {
    expect(rankChange([{ day: 'd', position: 3 }])).toBe(null);
    expect(rankChange(null)).toBe(null);
    expect(rankChangeText(null)).toBe('');
  });
});

describe('latestTrends', () => {
  const p = (over) => ({ geo: 'DE', term: 'a', value: 50, has_data: true, is_partial: false, scale_group: 'g1', timeframe: 'today 12-m', ...over });
  it('takes the latest complete week, not the partial one', () => {
    const out = latestTrends([
      p({ point_date: '2026-09-14', value: 60 }),
      p({ point_date: '2026-09-21', value: 70 }),
      p({ point_date: '2026-09-28', value: 12, is_partial: true }),
    ]);
    expect(out[0].groups[0].date).toBe('2026-09-21');
    expect(out[0].groups[0].terms).toEqual([{ term: 'a', value: 70 }]);
    expect(out[0].groups[0].partial).toBe(false);
  });
  it('keeps separate request groups apart', () => {
    const out = latestTrends([
      p({ point_date: '2026-09-21', term: 'a', scale_group: 'g1' }),
      p({ point_date: '2026-09-21', term: 'b', scale_group: 'g2', value: 90 }),
    ]);
    expect(out[0].groups.map((g) => g.key)).toEqual(['g1', 'g2']);
  });
  it('marks too small to measure as null, not zero', () => {
    const out = latestTrends([p({ point_date: '2026-09-21', value: 0, has_data: false })]);
    expect(out[0].groups[0].terms[0].value).toBe(null);
  });
  it('uses a partial week only when there is nothing else, and says so', () => {
    const out = latestTrends([p({ point_date: '2026-09-28', is_partial: true })]);
    expect(out[0].groups[0].partial).toBe(true);
  });
  it('clamps to the 0 to 100 scale and skips junk rows', () => {
    const out = latestTrends([p({ point_date: '2026-09-21', value: 140 }), null, { geo: 'DE' }]);
    expect(out[0].groups[0].terms[0].value).toBe(100);
    expect(latestTrends(undefined)).toEqual([]);
  });
  it('words the timeframe', () => {
    expect(timeframeText('today 12-m')).toBe('last 12 months');
    expect(timeframeText('now 7-d')).toBe('last 7 days');
    expect(timeframeText(null)).toBe('the pulled period');
  });
});

describe('Compare bestIndex', () => {
  it.each([
    [[1, 3, 2], 'max', 1],
    [[1, 3, 2], 'min', 0],
    [[null, 3, null], 'max', -1],
    [[3, 3, 1], 'max', -1],
    [[3, 1, 1], 'min', -1],
    [[null, 2, 5], 'min', 1],
    [[1, 2], null, -1],
    [[], 'max', -1],
    [undefined, 'max', -1],
    [['5', 2], 'max', -1],
  ])('%j %s -> %s', (values, dir, out) => {
    expect(bestIndex(values, dir)).toBe(out);
  });
});

describe('revenueStats', () => {
  const now = new Date('2026-09-30T15:00:00');
  const sale = (amount, currency, paid_at) => ({ amount, currency, paid_at });
  it('never adds amounts in different currencies', () => {
    const s = revenueStats(
      [sale(10, 'eur', '2026-09-30T10:00:00'), sale(99, 'usd', '2026-09-30T11:00:00'), sale(5, 'eur', '2026-09-01T10:00:00')],
      null,
      now,
    );
    expect(s.currency).toBe('usd'); // the most money, by amount
    expect(s.total).toBe(99);
    expect(s.otherCurrencySales).toBe(2);
  });
  it('uses the snapshot currency and total when there is one', () => {
    const s = revenueStats(
      [sale(10, 'eur', '2026-09-30T10:00:00'), sale(99, 'usd', '2026-09-30T11:00:00')],
      { currency: 'eur', total_gross: 1234.5, mrr: 80, sales_count: 40 },
      now,
    );
    expect(s).toMatchObject({ currency: 'eur', total: 1234.5, mrr: 80, count: 40, todayCount: 1, todayAmount: 10, otherCurrencySales: 1 });
  });
  it('rounds to cents and ignores bad amounts and dates', () => {
    const s = revenueStats([sale(0.1, 'eur', '2026-09-30T01:00:00'), sale(0.2, 'eur', '2026-09-30T02:00:00'), sale('x', 'eur', 'bad')], null, now);
    expect(s.total).toBe(0.3);
    expect(s.todayAmount).toBe(0.3);
    expect(s.todayCount).toBe(2);
  });
  it('an empty list is zero in euro', () => {
    expect(revenueStats(null, null, now)).toMatchObject({ currency: 'eur', total: 0, count: 0, mrr: null, last: null });
  });
});

describe('click rating', () => {
  it('rates our ads by CTR only', () => {
    const ads = seedAds();
    expect(reachRating(ads[0]).label).toBe('OK'); // 2.4%
    expect(reachRating(ads[1]).label).toBe('OK'); // 3.1%
    expect(reachRating(ads[2]).label).toBe('Weak'); // 0.9%
    expect(reachRating({ metrics: { ctr: 5 } })).toMatchObject({ label: 'Strong', tone: 'good' });
  });
  it('never rates reach: no rival ad gets a rating', () => {
    for (const ad of seedAds().slice(3)) expect(reachRating(ad)).toBe(null);
    expect(reachRating({ metrics: { reach: 99999 } })).toBe(null);
    expect(reachRating({ metrics: { ctr: 0 } })).toBe(null);
    expect(reachRating(null)).toBe(null);
  });
});

describe('demo reach is internally consistent', () => {
  const rivals = seedAds().filter((a) => a.metrics.reach);
  it('reach is days times the daily rate, and EU reach never exceeds it', () => {
    for (const a of rivals) {
      expect(a.metrics.reach).toBe(a.metrics.days_running * a.metrics.reach_per_day);
      if (a.eu_reach != null) expect(a.eu_reach).toBeLessThanOrEqual(a.metrics.reach);
    }
  });
  it('a two day test does not out reach a four month run', () => {
    const byDays = [...rivals].sort((x, y) => x.metrics.days_running - y.metrics.days_running);
    expect(byDays[0].metrics.reach).toBeLessThan(byDays[byDays.length - 1].metrics.reach);
  });
});
