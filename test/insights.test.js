import { describe, it, expect } from 'vitest';
import {
  roasBand,
  ctrBand,
  ownAdsSummary,
  winnerLoserCompare,
  groupOwnBy,
  winnersBy,
  verdictSplit,
  libraryCounts,
  VERDICT_ORDER,
} from '../src/lib/insights.js';
import { revenueWindow, revenueDaily, revenueStats } from '../src/lib/revenue.js';
import { visitsWindow, funnelSummary, windowStart } from '../src/lib/funnel.js';
import { dashboardSummary } from '../src/lib/dashboard.js';
import { ourPerformance } from '../src/lib/performance.js';
import { splitShares } from '../src/lib/charts.js';
import { buildSeed } from '../src/lib/demo/seed.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DAY = 86400000;
const OWN = (b) => b === 'Driftwood Oats';
const NOBODY = () => false;
const seedAds = () => buildSeed(NOW).tables.ads;
const ad = (id, metrics = {}, extra = {}) => ({ id, brand: 'Us', verdict: 'testing', metrics, ...extra });
const US = (b) => b === 'Us';

describe('roasBand', () => {
  it('uses the verdict thresholds at their boundaries', () => {
    expect(roasBand(1.5)).toMatchObject({ label: 'Strong', tone: 'good' });
    expect(roasBand(1.49)).toMatchObject({ label: 'OK', tone: 'neutral' });
    expect(roasBand(0.8)).toMatchObject({ label: 'OK', tone: 'neutral' });
    expect(roasBand(0.79)).toMatchObject({ label: 'Weak', tone: 'bad' });
    expect(roasBand(0)).toMatchObject({ label: 'Weak', tone: 'bad' });
    expect(roasBand(1.5).basis).toBe('ROAS 1.5 or more');
  });
  it('is null for no value, a bad value or a negative one', () => {
    for (const v of [null, undefined, '', NaN, Infinity, 'abc', true, {}, [], -1]) expect(roasBand(v)).toBeNull();
  });
  it('reads a numeric string', () => {
    expect(roasBand('2.1')).toMatchObject({ label: 'Strong' });
  });
});

describe('ctrBand', () => {
  it('is the reachRating rule on a number', () => {
    expect(ctrBand(5)).toMatchObject({ label: 'Strong', tone: 'good' });
    expect(ctrBand(4.99)).toMatchObject({ label: 'OK', tone: 'neutral' });
    expect(ctrBand(2)).toMatchObject({ label: 'OK', tone: 'neutral' });
    expect(ctrBand(1.99)).toMatchObject({ label: 'Weak', tone: 'bad' });
  });
  it('is null for no CTR, zero, or a bad value', () => {
    for (const v of [null, undefined, '', 0, -2, NaN, 'x', false]) expect(ctrBand(v)).toBeNull();
  });
});

describe('ownAdsSummary on the demo seed', () => {
  const s = ownAdsSummary(seedAds(), { isOwn: OWN });
  it('keeps every ourPerformance field', () => {
    const p = ourPerformance(seedAds(), OWN);
    expect(s.totalSpend).toBe(p.totalSpend);
    expect(s.rows.map((r) => r.id)).toEqual(p.rows.map((r) => r.id));
    expect(s.blendedCtr).toBe(p.blendedCtr);
  });
  it('has the pinned totals', () => {
    expect(s.totalSpend).toBe(353);
    expect(s.currency).toBe('eur');
    expect(s.otherCurrencyAds).toBe(0);
    expect(s.hasNumbers).toBe(true);
    expect(s.roas.value).toBeCloseTo(561 / 335, 10);
    expect(s.roas.value).toBeCloseTo(1.6746, 4);
    expect(s.roas.spend).toBe(335);
    expect(s.roas.revenue).toBeCloseTo(561, 10);
    expect(s.roas.ads).toBe(2);
    expect(s.roasBand).toMatchObject({ label: 'Strong', tone: 'good' });
    expect(s.blendedCtr).toBeCloseTo(2.521, 3);
    expect(s.ctrBand).toMatchObject({ label: 'OK', tone: 'neutral' });
    expect(s.blendedCpc).toBeCloseTo(0.588, 3);
  });
  it('splits the spend by verdict in the fixed order', () => {
    expect(s.spendSplit).toEqual([
      { verdict: 'winner', tone: 'good', label: 'Winners', spend: 240, ads: 1 },
      { verdict: 'testing', tone: 'warn', label: 'Testing', spend: 18, ads: 1 },
      { verdict: 'loser', tone: 'bad', label: 'Losers', spend: 95, ads: 1 },
    ]);
    expect(splitShares(s.spendSplit.map((r) => r.spend))).toEqual([68, 5, 27]);
  });
  it('is empty without an own brand', () => {
    const none = ownAdsSummary(seedAds(), { isOwn: NOBODY });
    expect(none.rows).toEqual([]);
    expect(none.hasNumbers).toBe(false);
    expect(none.roas).toEqual({ value: null, spend: 0, revenue: null, ads: 0 });
    expect(none.roasBand).toBeNull();
    expect(none.ctrBand).toBeNull();
    expect(none.spendSplit).toEqual([]);
  });
});

describe('ownAdsSummary on its own', () => {
  it('survives bad input', () => {
    for (const v of [null, undefined, 'x', 42, {}, [null, 1, 'a']]) {
      const s = ownAdsSummary(v, { isOwn: US });
      expect(s.totalSpend).toBe(0);
      expect(s.spendSplit).toEqual([]);
    }
    expect(ownAdsSummary([ad(1, { spend: 10 })]).rows).toEqual([]);
  });
  it('counts an ad that arrives twice once and does not mutate the input', () => {
    const list = [ad(1, { spend: 10, roas: 2 }), ad(1, { spend: 10, roas: 2 })];
    const copy = JSON.parse(JSON.stringify(list));
    const s = ownAdsSummary(list, { isOwn: US });
    expect(s.totalSpend).toBe(10);
    expect(s.roas.ads).toBe(1);
    expect(list).toEqual(copy);
  });
  it('keeps ads without an id', () => {
    const s = ownAdsSummary([ad(undefined, { spend: 5 }), ad(undefined, { spend: 7 })], { isOwn: US });
    expect(s.totalSpend).toBe(12);
  });
  it('sums one currency and counts the rest apart', () => {
    const s = ownAdsSummary(
      [ad(1, { spend: 100, currency: 'EUR' }), ad(2, { spend: 40 }), ad(3, { spend: 90, currency: 'usd' })],
      { isOwn: US }
    );
    expect(s.currency).toBe('eur');
    expect(s.totalSpend).toBe(140);
    expect(s.otherCurrencyAds).toBe(1);
  });
  it('leaves an unknown verdict as not judged and drops zero spend from the split', () => {
    const s = ownAdsSummary([ad(1, { spend: 30 }, { verdict: 'weird' }), ad(2, { spend: 0 }, { verdict: 'winner' })], {
      isOwn: US,
    });
    expect(s.spendSplit).toEqual([{ verdict: 'unsure', tone: 'neutral', label: 'Not judged', spend: 30, ads: 1 }]);
    expect(s.hasNumbers).toBe(true);
  });
  it('has no numbers when own ads carry only a CTR', () => {
    const s = ownAdsSummary([ad(1, { ctr: 3 })], { isOwn: US });
    expect(s.rows).toHaveLength(1);
    expect(s.hasNumbers).toBe(false);
  });
  it('leaves ROAS out of ads that do not carry it, and a string ROAS counts', () => {
    const s = ownAdsSummary([ad(1, { spend: 50, roas: '2' }), ad(2, { spend: 50 }), ad(3, { spend: 0, roas: 9 })], {
      isOwn: US,
    });
    expect(s.roas).toEqual({ value: 2, spend: 50, revenue: 100, ads: 1 });
  });
});

describe('winnerLoserCompare', () => {
  it('has the seed numbers', () => {
    const c = winnerLoserCompare(seedAds(), { isOwn: OWN });
    expect(c.winners.ads).toBe(1);
    expect(c.winners.spend).toBe(240);
    expect(c.winners.revenue).toBeCloseTo(504, 10);
    expect(c.winners.roas).toBeCloseTo(2.1, 10);
    expect(c.winners.ctr).toBeCloseTo(3.106, 3);
    expect(c.winners.cpc).toBeCloseTo(0.48, 10);
    expect(c.losers.ads).toBe(1);
    expect(c.losers.spend).toBe(95);
    expect(c.losers.revenue).toBeCloseTo(57, 10);
    expect(c.losers.roas).toBeCloseTo(0.6, 10);
    expect(c.losers.ctr).toBeCloseTo(0.893, 3);
    expect(c.losers.cpc).toBeCloseTo(1.9, 10);
  });
  it('gives null fields for a side with nothing', () => {
    const c = winnerLoserCompare([], { isOwn: OWN });
    expect(c.winners).toEqual({ ads: 0, spend: null, revenue: null, roas: null, ctr: null, cpc: null });
    expect(c.losers).toEqual(c.winners);
    expect(winnerLoserCompare(null).winners.ads).toBe(0);
  });
  it('leaves a rate null when its halves are missing', () => {
    const c = winnerLoserCompare([ad(1, { spend: 20 }, { verdict: 'winner' })], { isOwn: US });
    expect(c.winners).toEqual({ ads: 1, spend: 20, revenue: null, roas: null, ctr: null, cpc: null });
  });
});

describe('groupOwnBy', () => {
  it('groups the seed by angle, most spend first', () => {
    const rows = groupOwnBy(seedAds(), 'angle', { isOwn: OWN });
    expect(rows.map((r) => [r.label, r.spend])).toEqual([
      ['Social proof', 240],
      ['Story', 95],
      ['Offer', 18],
    ]);
    expect(rows[0]).toMatchObject({ id: 'social_proof', ads: 1 });
    expect(rows[0].roas).toBeCloseTo(2.1, 10);
    expect(rows[2].roas).toBeNull();
    expect(rows[2].ctr).toBeCloseTo((50 / 2100) * 100, 10);
  });
  it('groups the seed by format', () => {
    const rows = groupOwnBy(seedAds(), 'format', { isOwn: OWN });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'image', label: 'Image', ads: 3, spend: 353 });
  });
  it('puts ads with no angle or format in one row with id null', () => {
    const list = [ad(1, { spend: 5 }), ad(2, { spend: 6 }, { format: '  ' }), ad(3, { spend: 7, angle: 'nope' })];
    expect(groupOwnBy(list, 'angle', { isOwn: US })).toEqual([
      expect.objectContaining({ id: null, label: 'No angle', ads: 3, spend: 18 }),
    ]);
    expect(groupOwnBy(list, 'format', { isOwn: US })[0]).toMatchObject({ id: null, label: 'No format', ads: 3 });
  });
  it('is empty for an unknown key or bad input', () => {
    expect(groupOwnBy(seedAds(), 'brand', { isOwn: OWN })).toEqual([]);
    expect(groupOwnBy(seedAds(), undefined, { isOwn: OWN })).toEqual([]);
    expect(groupOwnBy(null, 'angle', { isOwn: OWN })).toEqual([]);
  });
});

describe('winnersBy', () => {
  it('counts the whole library by format', () => {
    expect(winnersBy(seedAds(), 'format')).toEqual({
      rows: [
        { id: 'image', label: 'Image', count: 6 },
        { id: 'video', label: 'Video', count: 1 },
      ],
      none: 0,
    });
  });
  it('matches dashboardSummary angles', () => {
    const d = dashboardSummary(seedAds(), { now: NOW, isOwn: OWN });
    const w = winnersBy(seedAds(), 'angle');
    expect(w.rows).toEqual(d.angles);
    expect(w.none).toBe(d.noAngle);
    expect(w.rows.slice(0, 4).map((r) => [r.label, r.count])).toEqual([
      ['Social proof', 2],
      ['Authority', 1],
      ['Curiosity', 1],
      ['Identity', 1],
    ]);
    expect(w.none).toBe(1);
  });
  it('counts an ad twice listed once, and is empty for a bad key or input', () => {
    const list = [ad(1, {}, { verdict: 'winner', format: 'video' })];
    expect(winnersBy([...list, ...list], 'format').rows).toEqual([{ id: 'video', label: 'Video', count: 1 }]);
    expect(winnersBy(list, 'hook')).toEqual({ rows: [], none: 0 });
    expect(winnersBy(undefined, 'angle')).toEqual({ rows: [], none: 0 });
  });
});

describe('verdictSplit', () => {
  it('counts the seed in the fixed order', () => {
    expect(verdictSplit(seedAds()).map((r) => [r.verdict, r.tone, r.label, r.count])).toEqual([
      ['winner', 'good', 'Winners', 7],
      ['testing', 'warn', 'Testing', 6],
      ['loser', 'bad', 'Losers', 4],
      ['unsure', 'neutral', 'Not judged', 7],
    ]);
  });
  it('keeps zero rows, files unknown verdicts as not judged, and survives bad input', () => {
    expect(verdictSplit([ad(1, {}, { verdict: null }), ad(2, {}, { verdict: 'x' })]).map((r) => r.count)).toEqual([0, 0, 0, 2]);
    expect(verdictSplit('nope').map((r) => r.count)).toEqual([0, 0, 0, 0]);
    expect(VERDICT_ORDER).toEqual(['winner', 'testing', 'loser', 'unsure']);
  });
});

describe('libraryCounts', () => {
  it('has the seed counts', () => {
    const c = libraryCounts(seedAds(), { now: NOW });
    expect(c.total).toBe(24);
    expect(c.saved.value).toBe(12);
    expect(c.saved.prev).toBe(12);
    expect(c.saved.delta).toMatchObject({ direction: 'flat', tone: 'flat' });
    expect(c.winners).toBe(7);
    expect(c.winnersLive).toBe(5);
    expect(c.starred).toBe(4);
  });
  it('places an ad saved exactly 30 days ago in the previous window', () => {
    const c = libraryCounts([{ id: 1, created_at: new Date(NOW - 30 * DAY).toISOString() }], { now: NOW });
    expect(c.saved.value).toBe(0);
    expect(c.saved.prev).toBe(1);
  });
  it('gives no saved count for a bad window', () => {
    const c = libraryCounts([], { now: NOW, days: 0 });
    expect(c.saved).toEqual({ value: null, prev: null, delta: null });
  });
});

describe('demo seed own ads', () => {
  it('stores CTR close to clicks over impressions', () => {
    for (const a of seedAds().filter((x) => OWN(x.brand))) {
      const m = a.metrics;
      expect(Math.abs(m.ctr - (m.clicks / m.impressions) * 100)).toBeLessThan(0.05);
    }
  });
});

// Revenue and visits have no seed rows: fixtures.
const sale = (daysAgo, amount, currency = 'eur') => ({
  paid_at: new Date(NOW - daysAgo * DAY).toISOString(),
  amount,
  currency,
});

describe('revenueWindow', () => {
  it('sums the two windows and gives an up change in green', () => {
    const r = revenueWindow([sale(1, 10), sale(29, 15), sale(31, 5), sale(59, 5), sale(70, 1)], { now: NOW });
    expect(r).toMatchObject({ currency: 'eur', cur: 25, prev: 10, count: 2, prevCount: 2, comparable: true });
    expect(r.delta).toMatchObject({ diff: 15, direction: 'up', tone: 'good' });
  });
  it('a drop is red', () => {
    const r = revenueWindow([sale(1, 5), sale(40, 20)], { now: NOW });
    expect(r.delta).toMatchObject({ direction: 'down', tone: 'bad' });
  });
  it('puts a sale exactly on the boundary in the window that ends there', () => {
    const r = revenueWindow([sale(30, 7), sale(0, 3), sale(60, 100)], { now: NOW });
    expect(r.cur).toBe(3);
    expect(r.prev).toBe(7);
    expect(r.count).toBe(1);
    expect(r.prevCount).toBe(1);
  });
  it('gives no change when the history starts inside the current window', () => {
    const r = revenueWindow([sale(3, 10), sale(10, 4)], { now: NOW });
    expect(r).toMatchObject({ cur: 14, prev: 0, prevCount: 0, comparable: false, delta: null });
  });
  it('an empty previous window after earlier sales is a real zero', () => {
    const r = revenueWindow([sale(2, 10), sale(90, 4)], { now: NOW });
    expect(r.comparable).toBe(true);
    expect(r.delta).toMatchObject({ prev: 0, direction: 'up', tone: 'good', pct: null });
  });
  it('never adds a second currency, and counts it only inside the windows', () => {
    const list = [sale(1, 10), sale(2, 10), sale(3, 500, 'usd'), sale(40, 9, 'USD'), sale(200, 9, 'usd')];
    const r = revenueWindow(list, { now: NOW });
    expect(r.currency).toBe('usd');
    expect(r.cur).toBe(500);
    expect(r.otherCurrencySales).toBe(2);
    const e = revenueWindow(list, { now: NOW, currency: 'EUR' });
    expect(e.currency).toBe('eur');
    expect(e.cur).toBe(20);
    expect(e.otherCurrencySales).toBe(2);
  });
  it('survives bad input', () => {
    const r = revenueWindow([null, 'x', { amount: 'abc', paid_at: new Date(NOW - DAY).toISOString() }, { amount: 5, paid_at: 'nope' }], {
      now: NOW,
    });
    expect(r).toMatchObject({ cur: 0, count: 1, comparable: false, delta: null });
    expect(revenueWindow(undefined, { now: NOW })).toMatchObject({ cur: 0, prev: 0, delta: null });
    expect(revenueWindow([], { now: NOW, days: -1 })).toMatchObject({ cur: null, delta: null });
  });
  it('ignores future sales and does not mutate the input', () => {
    const list = [sale(-2, 50), sale(1, 5), sale(45, 5)];
    const copy = JSON.parse(JSON.stringify(list));
    expect(revenueWindow(list, { now: NOW }).cur).toBe(5);
    expect(list).toEqual(copy);
  });
  it('leaves revenueStats as it was', () => {
    expect(revenueStats([sale(0, 5)], null, new Date(NOW)).total).toBe(5);
  });
});

describe('revenueDaily', () => {
  it('is null before the first sale and 0 on quiet days after it', () => {
    const s = revenueDaily([sale(3, 10), sale(3, 2.5), sale(1, 4)], { now: NOW });
    expect(s).toHaveLength(30);
    expect(s[0].day).toBe(windowStart(30, NOW));
    expect(s[29]).toEqual({ day: '2026-09-30', value: 0 });
    expect(s[26]).toEqual({ day: '2026-09-27', value: 12.5 });
    expect(s[27].value).toBe(0);
    expect(s[28].value).toBe(4);
    expect(s[25].value).toBeNull();
  });
  it('a sale before the window makes every day a number', () => {
    const s = revenueDaily([sale(90, 1)], { now: NOW });
    expect(s.every((p) => p.value === 0)).toBe(true);
  });
  it('one currency only', () => {
    const s = revenueDaily([sale(1, 4), sale(1, 400, 'usd')], { now: NOW, currency: 'eur' });
    expect(s[28].value).toBe(4);
  });
  it('survives bad input', () => {
    expect(revenueDaily(null, { now: NOW }).every((p) => p.value === null)).toBe(true);
    expect(revenueDaily([], { now: NOW, days: 0 })).toEqual([]);
    expect(revenueDaily([{ amount: 3, paid_at: 'no' }], { now: NOW }).every((p) => p.value === null)).toBe(true);
  });
});

const snaps = (from, to, visitors = 10) => {
  const out = [];
  for (let d = from; d <= to; d += 1) {
    out.push({ day: new Date(NOW - d * DAY).toISOString().slice(0, 10), metrics: { traffic: { visitors } } });
  }
  return out;
};

describe('visitsWindow', () => {
  it('compares two full windows, up is good', () => {
    const v = visitsWindow([...snaps(0, 29, 20), ...snaps(30, 59, 10)], { now: NOW });
    expect(v).toMatchObject({ cur: 600, prev: 300, curDays: 30, prevDays: 30, comparable: true });
    expect(v.delta).toMatchObject({ diff: 300, direction: 'up', tone: 'good' });
  });
  it('needs 24 snapshot days in both windows', () => {
    const ok = visitsWindow([...snaps(0, 23), ...snaps(30, 53)], { now: NOW });
    expect([ok.curDays, ok.prevDays, ok.comparable]).toEqual([24, 24, true]);
    const short = visitsWindow([...snaps(0, 23), ...snaps(30, 52)], { now: NOW });
    expect([short.prevDays, short.comparable, short.delta]).toEqual([23, false, null]);
    expect(short.cur).toBe(240);
  });
  it('places each day by its UTC date, both ends included', () => {
    const v = visitsWindow([...snaps(29, 29, 1), ...snaps(30, 30, 2), ...snaps(59, 59, 4), ...snaps(60, 60, 8)], { now: NOW });
    expect([v.cur, v.prev]).toEqual([1, 6]);
  });
  it('counts a day once and skips rows without visitors', () => {
    const rows = [...snaps(0, 0, 5), ...snaps(0, 0, 9), { day: '2026-09-29', metrics: {} }, { day: '2026-09-28', metrics: { traffic: { visitors: 'x' } } }, null, { metrics: { traffic: { visitors: 3 } } }];
    expect(visitsWindow(rows, { now: NOW })).toMatchObject({ cur: 5, curDays: 1 });
  });
  it('survives bad input', () => {
    expect(visitsWindow(null, { now: NOW })).toEqual({ cur: 0, prev: 0, curDays: 0, prevDays: 0, comparable: false, delta: null });
    expect(visitsWindow(snaps(0, 3), { now: NOW, days: NaN }).comparable).toBe(false);
  });
  it('leaves funnelSummary as it was', () => {
    expect(funnelSummary([], [{ key: 'a', label: 'A' }]).days).toBe(0);
  });
});
