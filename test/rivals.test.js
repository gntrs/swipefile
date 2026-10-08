import { describe, it, expect } from 'vitest';
import {
  brandSlug,
  rivalAds,
  activityWindow,
  runningAt,
  daysLiveAt,
  rivalKpis,
  dailyRunning,
  weeklyRunning,
  rivalBoard,
  newPlays,
  provenPlays,
  longestRuns,
  angleMix,
  rivalDetail,
} from '../src/lib/rivals.js';
import { buildSeed } from '../src/lib/demo/seed.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DAY = 86400000;
const OWN = (b) => b === 'Driftwood Oats';
const iso = (ms) => new Date(ms).toISOString();
const ago = (days) => iso(NOW - days * DAY);
const SEED = buildSeed(NOW).tables.ads;
const opts = { isOwn: OWN, now: NOW };

let n = 0;
// A rival ad. live: started `started` days ago and still running. Stopped:
// pass days (and optionally stopped).
const ad = ({ brand = 'Rival', started, days, live, stopped, angle, hook, format, ...rest } = {}) => {
  const metrics = {};
  if (started !== undefined) metrics.started_running = started === null ? null : ago(started);
  if (days !== undefined) metrics.days_running = days;
  if (live !== undefined) metrics.live = live;
  if (stopped !== undefined) metrics.stopped_running = stopped;
  if (angle) metrics.angle = angle;
  return {
    id: `r${++n}`,
    brand,
    hook: hook ?? `hook ${n}`,
    format: format ?? 'image',
    verdict: 'unsure',
    created_at: ago(10),
    metrics,
    ...rest,
  };
};

describe('brandSlug', () => {
  it.each([
    ['Kettle & Kite', 'kettle-and-kite'],
    ['Marrow & Moss', 'marrow-and-moss'],
    ['  Lumen Loop ', 'lumen-loop'],
    ['Quillfox', 'quillfox'],
    ['A--B!!', 'a-b'],
    ['', ''],
    ['!!!', ''],
    [null, ''],
    [undefined, ''],
    [42, ''],
  ])('%j -> %j', (name, slug) => {
    expect(brandSlug(name)).toBe(slug);
  });
});

describe('rivalAds', () => {
  it.each([undefined, null, 'ads', 3, {}])('%j gives []', (input) => {
    expect(rivalAds(input, OWN)).toEqual([]);
  });
  it('drops own, blank and non object rows, keeps one per id', () => {
    const a = ad({ brand: 'Quillfox' });
    const rows = [a, { ...a }, ad({ brand: 'Driftwood Oats' }), ad({ brand: '  ' }), ad({ brand: null }), null, 'x', 7];
    expect(rivalAds(rows, OWN)).toEqual([a]);
  });
  it('keeps rows without an id', () => {
    expect(rivalAds([ad({ id: undefined }), ad({ id: undefined })], OWN)).toHaveLength(2);
  });
  it('treats a missing isOwn as nobody is own', () => {
    expect(rivalAds([ad({ brand: 'Driftwood Oats' })])).toHaveLength(1);
  });
  it('never sees own or blank brands in the seed', () => {
    const brands = new Set(rivalAds(SEED, OWN).map((a) => a.brand));
    expect(brands.has('Driftwood Oats')).toBe(false);
    expect(brands.size).toBe(7);
  });
});

describe('activityWindow, runningAt, daysLiveAt', () => {
  it('a live ad has an open end', () => {
    const a = ad({ started: 10, live: true });
    expect(activityWindow(a)).toEqual({ start: NOW - 10 * DAY, end: null });
    expect(runningAt(a, NOW)).toBe(true);
    expect(runningAt(a, NOW - 11 * DAY)).toBe(false);
    expect(daysLiveAt(a, NOW)).toBe(10);
  });
  it('a stopped ad ends days_running days after its start', () => {
    const a = ad({ started: 30, days: 20, live: false });
    expect(activityWindow(a)).toEqual({ start: NOW - 30 * DAY, end: NOW - 10 * DAY });
    expect(runningAt(a, NOW)).toBe(false);
    expect(runningAt(a, NOW - 15 * DAY)).toBe(true);
    expect(daysLiveAt(a, NOW)).toBe(20);
  });
  it('stopped_running wins over days_running', () => {
    const a = ad({ started: 30, days: 20, live: false, stopped: ago(25) });
    expect(activityWindow(a).end).toBe(NOW - 25 * DAY);
    expect(daysLiveAt(a, NOW)).toBe(5);
  });
  it('a stop day string is read as that day', () => {
    const a = ad({ started: 30, live: false, stopped: '2026-09-20' });
    expect(activityWindow(a).end).toBe(Date.parse('2026-09-20'));
  });
  it('a stopped ad with no days_running has no window', () => {
    const a = ad({ started: 30, live: false });
    expect(activityWindow(a)).toBeNull();
    expect(runningAt(a, NOW)).toBeNull();
    expect(daysLiveAt(a, NOW)).toBeNull();
  });
  it.each([
    ['no metrics', { id: 'x', brand: 'R' }],
    ['no start', ad({ live: true })],
    ['bad start', { id: 'y', brand: 'R', metrics: { started_running: 'soon', live: true } }],
    ['null', null],
  ])('%s has no window', (_, a) => {
    expect(activityWindow(a)).toBeNull();
    expect(runningAt(a, NOW)).toBeNull();
    expect(daysLiveAt(a, NOW)).toBeNull();
  });
  it('an ad that starts in the future is not running and has 0 days', () => {
    const a = ad({ started: -5, live: true });
    expect(runningAt(a, NOW)).toBe(false);
    expect(daysLiveAt(a, NOW)).toBe(0);
  });
  it('a bad time gives null', () => {
    const a = ad({ started: 5, live: true });
    expect(runningAt(a, 'never')).toBeNull();
    expect(daysLiveAt(a, NaN)).toBeNull();
  });
  it('start is included, end is not', () => {
    const a = ad({ started: 10, days: 5, live: false });
    expect(runningAt(a, NOW - 10 * DAY)).toBe(true);
    expect(runningAt(a, NOW - 5 * DAY)).toBe(false);
    expect(runningAt(a, NOW - 5 * DAY - 1)).toBe(true);
  });
  it('a stored live flag missing falls back to status', () => {
    const a = { id: 's', brand: 'R', status: 'running', metrics: { started_running: ago(3) } };
    expect(activityWindow(a).end).toBeNull();
  });
});

describe('rivalKpis: the seed', () => {
  const k = rivalKpis(SEED, opts);
  it('running', () => {
    expect(k.running).toMatchObject({ value: 11, prev: 13, dated: 21, undatedRunning: 0, comparable: true });
    expect(k.running.delta).toMatchObject({ diff: -2, direction: 'down', tone: 'flat' });
  });
  it('launched, proven, stopped', () => {
    expect(k.launched).toMatchObject({ value: 8, prev: 6, live: 5 });
    expect(k.launched.delta).toMatchObject({ diff: 2, direction: 'up' });
    expect(k.provenLive).toMatchObject({ value: 4, prev: 4 });
    expect(k.provenLive.delta.direction).toBe('flat');
    expect(k.stopped).toMatchObject({ value: 10, prev: 0 });
    expect(k.stopped.delta).toMatchObject({ diff: 10, pct: null });
  });
  it('brands', () => {
    expect(k.brands).toBe(7);
    expect(k.brandsRunning).toBe(6);
  });
  it('the same list twice gives the same numbers', () => {
    expect(rivalKpis([...SEED, ...SEED], opts)).toEqual(k);
  });
  it('does not change the input', () => {
    const copy = JSON.parse(JSON.stringify(SEED));
    rivalKpis(SEED, opts);
    expect(SEED).toEqual(copy);
  });
});

describe('rivalKpis: edges', () => {
  it.each([undefined, null, [], 'x'])('%j gives zeros and no deltas', (input) => {
    const k = rivalKpis(input, { now: NOW });
    expect(k.running).toMatchObject({ value: 0, prev: 0, dated: 0, delta: null, comparable: false });
    expect(k.launched.delta).toBeNull();
    expect(k.brands).toBe(0);
  });
  it('a live ad with no start counts in value but not in the delta', () => {
    const rows = [...Array.from({ length: 10 }, () => ad({ started: 50, live: true })), ad({ live: true })];
    const k = rivalKpis(rows, { now: NOW });
    expect(k.running).toMatchObject({ value: 11, undatedRunning: 1, dated: 10, prev: 10, comparable: true });
    expect(k.running.delta).toMatchObject({ cur: 10, prev: 10, direction: 'flat' });
  });
  it('comparable flips once undated live ads pass a tenth', () => {
    const rows = [...Array.from({ length: 8 }, () => ad({ started: 50, live: true })), ad({ live: true }), ad({ live: true })];
    const k = rivalKpis(rows, { now: NOW });
    expect(k.running).toMatchObject({ value: 10, undatedRunning: 2, comparable: false, delta: null });
  });
  it('the 30 day boundary to the millisecond', () => {
    const edge = { ...ad({ live: true }), metrics: { live: true, started_running: iso(NOW - 30 * DAY) } };
    const inside = { ...ad({ live: true }), metrics: { live: true, started_running: iso(NOW - 30 * DAY + 1) } };
    const k = rivalKpis([edge, inside], { now: NOW });
    expect(k.launched.value).toBe(1);
    expect(k.launched.prev).toBe(1);
    // At exactly 30 days back the edge ad has just started, the inside one has not.
    expect(k.running.prev).toBe(1);
  });
  it('an ad that starts in the future is not running and not launched', () => {
    const k = rivalKpis([ad({ started: -3, live: true })], { now: NOW });
    expect(k.running.value).toBe(0);
    expect(k.launched.value).toBe(0);
  });
  it('own and blank brands never count', () => {
    const k = rivalKpis([ad({ brand: 'Driftwood Oats', started: 2, live: true }), ad({ brand: '', started: 2, live: true })], opts);
    expect(k.running.value).toBe(0);
    expect(k.brands).toBe(0);
  });
  it('a bad days falls back to 30', () => {
    expect(rivalKpis(SEED, { ...opts, days: -1 })).toEqual(rivalKpis(SEED, opts));
  });
});

describe('dailyRunning and weeklyRunning', () => {
  it('weekly, all rivals', () => {
    const w = weeklyRunning(SEED, opts);
    expect(w.map((p) => p.value)).toEqual([4, 5, 7, 8, 9, 9, 11, 13, 14, 16, 18, 11]);
    expect(w[0].weekEnd).toBe('2026-07-15');
    expect(w.at(-1).weekEnd).toBe('2026-09-30');
  });
  it('daily, 90 points', () => {
    const d = dailyRunning(SEED, opts);
    expect(d).toHaveLength(90);
    expect(d[0]).toEqual({ day: '2026-07-03', value: 4 });
    expect(Math.max(...d.map((p) => p.value))).toBe(18);
    expect(d.at(-1)).toEqual({ day: '2026-09-30', value: 11 });
  });
  it('one brand by name or slug', () => {
    const byName = weeklyRunning(SEED, { ...opts, brand: 'Kettle & Kite' }).map((p) => p.value);
    expect(byName).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 2, 1]);
    expect(weeklyRunning(SEED, { ...opts, brand: 'kettle-and-kite' }).map((p) => p.value)).toEqual(byName);
  });
  it('custom lengths and bad lengths', () => {
    expect(dailyRunning(SEED, { ...opts, days: 7 })).toHaveLength(7);
    expect(weeklyRunning(SEED, { ...opts, weeks: 0 })).toHaveLength(12);
    expect(dailyRunning(SEED, { ...opts, days: 'x' })).toHaveLength(90);
  });
  it('empty input gives zeros', () => {
    expect(weeklyRunning(null, { now: NOW }).every((p) => p.value === 0)).toBe(true);
  });
  it('undated ads are left out', () => {
    expect(dailyRunning([ad({ live: true })], { now: NOW, days: 3 }).map((p) => p.value)).toEqual([0, 0, 0]);
  });
});

describe('rivalBoard', () => {
  const b = rivalBoard(SEED, opts);
  it('rows in order with running and prev', () => {
    expect(b.rows.map((r) => [r.brand, r.running, r.runningPrev])).toEqual([
      ['Quillfox', 2, 1],
      ['Lumen Loop', 2, 2],
      ['Marrow & Moss', 2, 2],
      ['Sundial Skin', 2, 2],
      ['Northpaw', 2, 3],
      ['Kettle & Kite', 1, 1],
      ['Brightbarn', 0, 2],
    ]);
    expect(b.max).toBe(3);
  });
  it('strips', () => {
    const strips = Object.fromEntries(b.rows.map((r) => [r.brand, r.weeks.join(',')]));
    expect(strips).toEqual({
      Quillfox: '1,1,1,1,1,1,1,1,1,2,2,2',
      'Lumen Loop': '1,1,1,1,1,1,2,2,2,2,3,2',
      'Marrow & Moss': '0,0,0,1,1,1,2,2,2,2,3,2',
      'Sundial Skin': '0,0,1,1,1,1,1,2,2,3,3,2',
      Northpaw: '0,1,1,1,2,2,2,3,3,3,3,2',
      'Kettle & Kite': '1,1,1,1,1,1,1,1,2,3,2,1',
      Brightbarn: '1,1,2,2,2,2,2,2,2,1,2,0',
    });
  });
  it('quiet, slug, deltas, counts', () => {
    const by = Object.fromEntries(b.rows.map((r) => [r.brand, r]));
    expect(b.rows.filter((r) => r.quiet).map((r) => r.brand)).toEqual(['Brightbarn']);
    expect(by['Kettle & Kite'].slug).toBe('kettle-and-kite');
    expect(by.Quillfox.delta).toMatchObject({ diff: 1, direction: 'up' });
    expect(by.Northpaw.delta).toMatchObject({ diff: -1, direction: 'down' });
    expect(by['Lumen Loop']).toMatchObject({ launched: 1, provenLive: 1, winners: 1, total: 3, lastSeen: NOW });
    expect(by.Brightbarn.lastSeen).toBe(NOW - 5 * DAY);
  });
  it('a brand with no dates has no strip and no delta', () => {
    const r = rivalBoard([ad({ brand: 'Undated', live: true })], { now: NOW });
    expect(r.rows[0]).toMatchObject({ brand: 'Undated', running: 1, weeks: null, delta: null, quiet: false });
    expect(r.max).toBe(0);
  });
  it('empty input', () => {
    expect(rivalBoard(undefined, { now: NOW })).toEqual({ rows: [], max: 0 });
  });
  it('one brand written two ways is one row', () => {
    const r = rivalBoard([ad({ brand: 'Kettle & Kite', started: 3, live: true }), ad({ brand: 'kettle and kite ', started: 4, live: true })], { now: NOW });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].running).toBe(2);
  });
});

describe('newPlays', () => {
  it('the seed, newest first', () => {
    expect(newPlays(SEED, opts).map((p) => [p.ad.brand, p.startedDaysAgo, p.live])).toEqual([
      ['Quillfox', 5, true],
      ['Brightbarn', 7, false],
      ['Marrow & Moss', 8, true],
      ['Lumen Loop', 12, true],
      ['Kettle & Kite', 14, false],
      ['Sundial Skin', 18, true],
      ['Quillfox', 19, false],
      ['Kettle & Kite', 21, true],
    ]);
  });
  it('liveOnly and limit', () => {
    expect(newPlays(SEED, { ...opts, liveOnly: true, limit: 3 }).map((p) => p.ad.hook)).toEqual([
      'What do pro planners write on page one?',
      'A candle that smells like the forest after rain',
      'Headaches after 3pm? Check your desk light',
    ]);
    expect(newPlays(SEED, { ...opts, limit: 0 })).toEqual([]);
  });
  it('empty and undated', () => {
    expect(newPlays(null, { now: NOW })).toEqual([]);
    expect(newPlays([ad({ live: true })], { now: NOW })).toEqual([]);
  });
});

describe('provenPlays', () => {
  it('the seed', () => {
    expect(provenPlays(SEED, opts).map((p) => [p.ad.brand, p.days, p.newlyProven])).toEqual([
      ['Quillfox', 140, false],
      ['Lumen Loop', 96, false],
      ['Northpaw', 74, true],
      ['Sundial Skin', 63, true],
    ]);
  });
  it('live only, limit, a custom line', () => {
    expect(provenPlays(SEED, { ...opts, limit: 2 })).toHaveLength(2);
    expect(provenPlays(SEED, { ...opts, minDays: 100 }).map((p) => p.days)).toEqual([140]);
    expect(provenPlays([ad({ started: 200, days: 150, live: false })], { now: NOW })).toEqual([]);
  });
  it('two ads with the same brand and hook collapse to the longer run', () => {
    const rows = [ad({ hook: 'Same', started: 70, live: true }), ad({ hook: ' same ', started: 90, live: true })];
    const p = provenPlays(rows, { now: NOW });
    expect(p).toHaveLength(1);
    expect(p[0].days).toBe(90);
  });
  it('an undated live ad uses days_running', () => {
    expect(provenPlays([ad({ live: true, days: 61 })], { now: NOW }).map((p) => p.days)).toEqual([61]);
  });
});

describe('longestRuns', () => {
  it('all, the eight in the spec', () => {
    expect(longestRuns(SEED, { isOwn: OWN }).map((r) => [r.ad.brand, r.days, r.live])).toEqual([
      ['Quillfox', 140, true],
      ['Kettle & Kite', 118, false],
      ['Brightbarn', 101, false],
      ['Lumen Loop', 96, true],
      ['Northpaw', 74, true],
      ['Sundial Skin', 63, true],
      ['Brightbarn', 60, false],
      ['Marrow & Moss', 52, false],
    ]);
  });
  it('live and stopped filters', () => {
    expect(longestRuns(SEED, { isOwn: OWN, filter: 'live' }).every((r) => r.live)).toBe(true);
    expect(longestRuns(SEED, { isOwn: OWN, filter: 'stopped' }).every((r) => !r.live)).toBe(true);
    expect(longestRuns(SEED, { isOwn: OWN, filter: 'live', limit: 3 }).map((r) => r.days)).toEqual([140, 96, 74]);
  });
  it('dedupes by brand plus hook and skips ads with no days', () => {
    const rows = [ad({ hook: 'H', days: 10, live: false }), ad({ hook: 'H', days: 40, live: false }), ad({ hook: 'X' })];
    expect(longestRuns(rows).map((r) => r.days)).toEqual([40]);
  });
  it('empty input', () => {
    expect(longestRuns(undefined)).toEqual([]);
  });
});

describe('angleMix', () => {
  it('running now', () => {
    const m = angleMix(SEED, opts);
    expect(m.rows.map((r) => [r.label, r.count])).toEqual([
      ['Curiosity', 2],
      ['Comparison', 1],
      ['How to', 1],
      ['Identity', 1],
      ['Offer', 1],
      ['Pain point', 1],
      ['Social proof', 1],
      ['Story', 1],
    ]);
    expect(m.none).toBe(2);
    expect(m.total).toBe(11);
    expect(m.rows[0].id).toBe('curiosity');
  });
  it('new and ran30 sets', () => {
    expect(angleMix(SEED, { ...opts, set: 'new' }).total).toBe(8);
    const ran = angleMix(SEED, { ...opts, set: 'ran30' });
    expect(ran.total).toBe(12);
    expect(angleMix(SEED, { ...opts, set: 'all' }).total).toBe(21);
  });
  it('an unknown angle counts as none', () => {
    expect(angleMix([ad({ started: 2, live: true, angle: 'vibes' })], { now: NOW })).toEqual({ rows: [], none: 1, total: 1 });
  });
  it('empty input', () => {
    expect(angleMix(null, { now: NOW })).toEqual({ rows: [], none: 0, total: 0 });
  });
});

describe('rivalDetail', () => {
  it('lumen-loop', () => {
    const d = rivalDetail(SEED, 'lumen-loop', opts);
    expect(d.brand).toBe('Lumen Loop');
    expect(d.ads).toHaveLength(3);
    expect(d.kpis.running).toMatchObject({ value: 2, prev: 2 });
    expect(d.kpis.launched).toMatchObject({ value: 1, prev: 1 });
    expect(d.kpis.provenLive.value).toBe(1);
    expect(d.kpis.winners).toBe(1);
    expect(d.countries.rows.map((c) => c.code)).toEqual(['DE', 'NL', 'FR', 'ES', 'IT']);
    expect(d.countries).toMatchObject({ withData: 2, total: 3 });
    expect(d.formats.rows).toEqual([{ id: 'image', label: 'Image', count: 3 }]);
    expect(d.daily).toHaveLength(90);
    expect(d.daily.at(-1).value).toBe(2);
    expect(d.longest.map((r) => r.days)).toEqual([96, 34, 12]);
    expect(d.fresh.map((p) => p.startedDaysAgo)).toEqual([12]);
    expect(d.angles.total).toBe(3);
  });
  it('unknown, blank or own slugs give null', () => {
    expect(rivalDetail(SEED, 'nobody', opts)).toBeNull();
    expect(rivalDetail(SEED, '', opts)).toBeNull();
    expect(rivalDetail(SEED, null, opts)).toBeNull();
    expect(rivalDetail(SEED, 'driftwood-oats', opts)).toBeNull();
    expect(rivalDetail(null, 'lumen-loop', opts)).toBeNull();
  });
  it('ads are newest first and the input is not reordered', () => {
    const before = SEED.map((a) => a.id);
    const d = rivalDetail(SEED, 'brightbarn', opts);
    expect(SEED.map((a) => a.id)).toEqual(before);
    const times = d.ads.map((a) => Date.parse(a.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(d.kpis.running.value).toBe(0);
  });
});
