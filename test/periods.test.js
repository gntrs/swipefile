import { describe, it, expect } from 'vitest';
import { rollingWindows, inWindow, dayWindows, deltaOf, toMs } from '../src/lib/periods.js';
import { heatStep, splitShares } from '../src/lib/charts.js';
import { formatMoneyShort, currencySymbol, formatPct } from '../src/lib/format.js';
import { windowStart } from '../src/lib/funnel.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DAY = 86400000;

describe('toMs', () => {
  it('reads a number, a Date and a date string, and nothing else', () => {
    expect(toMs(NOW)).toBe(NOW);
    expect(toMs(new Date(NOW))).toBe(NOW);
    expect(toMs('2026-09-30T12:00:00Z')).toBe(NOW);
    for (const bad of [null, undefined, '', '  ', 'soon', NaN, Infinity, new Date('x'), {}, [], true]) {
      expect(toMs(bad), String(bad)).toBeNull();
    }
  });
});

describe('rollingWindows', () => {
  it('splits the last 30 days and the 30 before at now minus 30 days', () => {
    const w = rollingWindows(30, NOW);
    expect(w.days).toBe(30);
    expect(w.cur).toEqual({ from: NOW - 30 * DAY, to: NOW });
    expect(w.prev).toEqual({ from: NOW - 60 * DAY, to: NOW - 30 * DAY });
  });
  it('takes now as a Date or a string', () => {
    expect(rollingWindows(7, new Date(NOW))).toEqual(rollingWindows(7, NOW));
    expect(rollingWindows(7, '2026-09-30T12:00:00Z')).toEqual(rollingWindows(7, NOW));
  });
  it('is null for zero, negative, NaN, a string number or a bad now', () => {
    for (const d of [0, -1, NaN, Infinity, '30', null, undefined]) expect(rollingWindows(d, NOW), String(d)).toBeNull();
    expect(rollingWindows(30, 'never')).toBeNull();
    expect(rollingWindows(30, null)).toBeNull();
  });
  it('allows part days', () => {
    expect(rollingWindows(0.5, NOW).cur.from).toBe(NOW - DAY / 2);
  });
});

describe('inWindow', () => {
  const w = rollingWindows(30, NOW);
  it('holds the end to the millisecond and not the start', () => {
    expect(inWindow(NOW, w.cur)).toBe(true);
    expect(inWindow(NOW - 30 * DAY, w.cur)).toBe(false);
    expect(inWindow(NOW - 30 * DAY + 1, w.cur)).toBe(true);
    expect(inWindow(NOW - 30 * DAY, w.prev)).toBe(true);
    expect(inWindow(NOW + 1, w.cur)).toBe(false);
  });
  it('so a moment is in exactly one of the two windows', () => {
    for (const t of [NOW, NOW - 30 * DAY, NOW - 30 * DAY + 1, NOW - 45 * DAY, NOW - 60 * DAY + 1]) {
      expect(Number(inWindow(t, w.cur)) + Number(inWindow(t, w.prev)), String(t)).toBe(1);
    }
  });
  it('reads dates and strings like rollingWindows does', () => {
    expect(inWindow('2026-09-20T00:00:00Z', w.cur)).toBe(true);
    expect(inWindow(new Date('2026-08-20T00:00:00Z'), w.prev)).toBe(true);
  });
  it('is false for a bad time or a bad window', () => {
    for (const t of [null, undefined, '', 'x', NaN]) expect(inWindow(t, w.cur)).toBe(false);
    expect(inWindow(NOW, null)).toBe(false);
    expect(inWindow(NOW, {})).toBe(false);
    expect(inWindow(NOW, { from: 'a', to: 'b' })).toBe(false);
  });
});

describe('dayWindows', () => {
  it('starts the current window where windowStart does', () => {
    const w = dayWindows(30, NOW);
    expect(w.cur).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(w.cur.from).toBe(windowStart(30, NOW));
    expect(w.prev).toEqual({ from: '2026-08-02', to: '2026-08-31' });
  });
  it('a one day window is today and yesterday', () => {
    expect(dayWindows(1, NOW)).toEqual({ days: 1, cur: { from: '2026-09-30', to: '2026-09-30' }, prev: { from: '2026-09-29', to: '2026-09-29' } });
  });
  it('crosses a month and a year end', () => {
    const w = dayWindows(7, Date.parse('2027-01-03T08:00:00Z'));
    expect(w.cur).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    expect(w.prev).toEqual({ from: '2026-12-21', to: '2026-12-27' });
  });
  it('is null for part days and bad input', () => {
    for (const d of [0, -3, 1.5, NaN, '30']) expect(dayWindows(d, NOW), String(d)).toBeNull();
    expect(dayWindows(30, 'x')).toBeNull();
  });
});

describe('deltaOf', () => {
  it('pins the spec cases', () => {
    const a = deltaOf(11, 13);
    expect(a).toMatchObject({ cur: 11, prev: 13, diff: -2, direction: 'down', tone: 'flat' });
    expect(a.pct).toBeCloseTo(-15.38, 2);
    expect(deltaOf(10, 0, { polarity: 'up' })).toMatchObject({ direction: 'up', tone: 'good', pct: null });
    expect(deltaOf(5, 5, { polarity: 'up' })).toMatchObject({ direction: 'flat', tone: 'flat', diff: 0, pct: 0 });
    expect(deltaOf(3, 5, { polarity: 'down' })).toMatchObject({ direction: 'down', tone: 'good' });
  });
  it('gives every direction and polarity its tone', () => {
    const table = [
      [2, 1, 'up', 'up', 'good'],
      [1, 2, 'up', 'down', 'bad'],
      [2, 1, 'down', 'up', 'bad'],
      [1, 2, 'down', 'down', 'good'],
      [2, 1, 'none', 'up', 'flat'],
      [1, 2, 'none', 'down', 'flat'],
      [2, 1, 'sideways', 'up', 'flat'],
      [1, 1, 'down', 'flat', 'flat'],
    ];
    for (const [cur, prev, polarity, direction, tone] of table) {
      expect(deltaOf(cur, prev, { polarity }), `${cur} ${prev} ${polarity}`).toMatchObject({ direction, tone });
    }
    expect(deltaOf(2, 1).tone).toBe('flat');
  });
  it('has no percent from zero or a negative before', () => {
    expect(deltaOf(8, 0).pct).toBeNull();
    expect(deltaOf(0, 0).pct).toBeNull();
    expect(deltaOf(1, -4).pct).toBeNull();
    expect(deltaOf(0, 4).pct).toBe(-100);
  });
  it('is null unless both are finite numbers', () => {
    for (const [c, p] of [[null, 1], [1, null], [undefined, 1], [NaN, 1], [1, Infinity], ['3', 1], [1, '2']]) {
      expect(deltaOf(c, p), `${c} ${p}`).toBeNull();
    }
  });
  it('handles fractions without rounding them', () => {
    expect(deltaOf(0.36, 0.62, { polarity: 'down' }).diff).toBeCloseTo(-0.26, 10);
  });
});

describe('heatStep', () => {
  it('pins the spec cases', () => {
    expect([[0, 3], [1, 3], [2, 3], [3, 3], [1, 1], [9, 3]].map(([v, m]) => heatStep(v, m))).toEqual([0, 1, 3, 5, 5, 5]);
  });
  it('spreads the steps evenly over a wider scale', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => heatStep(v, 9))).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(heatStep(18, 18)).toBe(5);
  });
  it('is 0 for zero, negative and anything that is not a number', () => {
    for (const v of [0, -2, NaN, null, undefined, 'x', {}]) expect(heatStep(v, 3), String(v)).toBe(0);
  });
  it('is 5 for any count when the scale is 1 or broken', () => {
    for (const m of [1, 0, -1, NaN, null, undefined]) expect(heatStep(2, m), String(m)).toBe(5);
  });
  it('never leaves 1 to 5 for a positive count', () => {
    for (let v = 0.1; v < 30; v += 0.7) {
      const s = heatStep(v, 12);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(5);
    }
  });
});

describe('splitShares', () => {
  it('pins the spec cases', () => {
    expect(splitShares([240, 18, 95])).toEqual([68, 5, 27]);
    expect(splitShares([1, 1, 1])).toEqual([34, 33, 33]);
  });
  it('always sums to 100 when anything is above zero', () => {
    for (const list of [[7, 6, 4, 7], [1, 2], [1, 1, 1, 1, 1, 1, 1], [0.1, 0.2, 0.3], [999, 1], [5]]) {
      expect(splitShares(list).reduce((a, b) => a + b, 0), list.join(',')).toBe(100);
    }
    expect(splitShares([7, 6, 4, 7])).toEqual([29, 25, 17, 29]);
  });
  it('keeps zeros and bad parts at 0 and in place', () => {
    expect(splitShares([0, 3, 1])).toEqual([0, 75, 25]);
    expect(splitShares([null, 'x', -5, 2])).toEqual([0, 0, 0, 100]);
    expect(splitShares([0, 0])).toEqual([0, 0]);
  });
  it('gives [] for nothing and does not touch its input', () => {
    expect(splitShares([])).toEqual([]);
    expect(splitShares(null)).toEqual([]);
    expect(splitShares('abc')).toEqual([]);
    const input = [240, 18, 95];
    splitShares(input);
    expect(input).toEqual([240, 18, 95]);
    expect(splitShares(input)).toEqual(splitShares(input));
  });
  it('a tiny part never takes a point from a zero', () => {
    expect(splitShares([1000, 1, 0])).toEqual([100, 0, 0]);
  });
});

describe('formatMoneyShort', () => {
  it('cents under 100, whole units to 10,000, then short', () => {
    expect(formatMoneyShort(353)).toBe('€353');
    expect(formatMoneyShort(18)).toBe('€18.00');
    expect(formatMoneyShort(0.588)).toBe('€0.59');
    expect(formatMoneyShort(1240)).toBe('€1,240');
    expect(formatMoneyShort(12400)).toBe('€12.4k');
    expect(formatMoneyShort(10000)).toBe('€10k');
    expect(formatMoneyShort(2_500_000)).toBe('€2.5M');
    expect(formatMoneyShort(0)).toBe('€0.00');
  });
  it('picks the step on the rounded figure at each boundary', () => {
    expect(formatMoneyShort(99.99)).toBe('€99.99');
    expect(formatMoneyShort(99.999)).toBe('€100');
    expect(formatMoneyShort(9999.4)).toBe('€9,999');
    expect(formatMoneyShort(9999.6)).toBe('€10k');
    expect(formatMoneyShort(999_960)).toBe('€1M');
  });
  it('puts the sign before the symbol', () => {
    expect(formatMoneyShort(-5)).toBe('-€5.00');
  });
  it('takes the currency', () => {
    expect(formatMoneyShort(353, 'usd')).toBe('$353');
    expect(formatMoneyShort(353, 'GBP')).toBe('£353');
    expect(formatMoneyShort(353, 'sek')).toBe('SEK 353');
    expect(formatMoneyShort(353, null)).toBe('353');
  });
  it('a hyphen for anything that is not a number', () => {
    for (const v of [null, undefined, '', 'x', NaN, Infinity]) expect(formatMoneyShort(v), String(v)).toBe('-');
    expect(formatMoneyShort('353')).toBe('€353');
  });
});

describe('currencySymbol', () => {
  it('maps the three common codes and spells the rest', () => {
    expect(currencySymbol('eur')).toBe('€');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('usd')).toBe('$');
    expect(currencySymbol('gbp')).toBe('£');
    expect(currencySymbol('chf')).toBe('CHF ');
    expect(currencySymbol(' sek ')).toBe('SEK ');
  });
  it('is empty for no code', () => {
    for (const c of [null, undefined, '', '  ', 3, {}]) expect(currencySymbol(c)).toBe('');
  });
});

describe('formatPct', () => {
  it('fixed decimals and a percent sign', () => {
    expect(formatPct(2.521)).toBe('2.52%');
    expect(formatPct(3.106, 1)).toBe('3.1%');
    expect(formatPct(5, 0)).toBe('5%');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(-1.5)).toBe('-1.50%');
    expect(formatPct(2.521, -1)).toBe('2.52%');
  });
  it('a hyphen for anything that is not a number', () => {
    for (const v of [null, undefined, '', 'x', NaN]) expect(formatPct(v)).toBe('-');
  });
});
