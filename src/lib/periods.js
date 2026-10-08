// Two periods side by side: the one that ends now and the one just before it,
// and the change between a number in each. Pure, `now` is always passed in so
// the rules can be tested against a fixed clock.

import { windowStart } from './funnel.js';

const DAY = 86400000;

// A timestamp in ms from a number, a Date or a date string. null when it is
// none of those.
export function toMs(value) {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

const goodDays = (days) => typeof days === 'number' && Number.isFinite(days) && days > 0;

// The last `days` days up to now, and the `days` days before them, in ms.
// A window holds t when from < t <= to, so the two never share a moment.
export function rollingWindows(days, now = Date.now()) {
  const end = toMs(now);
  if (!goodDays(days) || end === null) return null;
  const span = days * DAY;
  return {
    days,
    cur: { from: end - span, to: end },
    prev: { from: end - 2 * span, to: end - span },
  };
}

// True when t falls inside the window: after its start, up to and including
// its end. False for anything that is not a time.
export function inWindow(t, w) {
  const ms = toMs(t);
  if (ms === null || !w || !Number.isFinite(w.from) || !Number.isFinite(w.to)) return false;
  return ms > w.from && ms <= w.to;
}

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// The same two windows as whole UTC days ('YYYY-MM-DD', both ends included),
// for tables keyed by day. The current window is today and the days - 1
// before it, the rule windowStart already uses.
export function dayWindows(days, now = Date.now()) {
  const end = toMs(now);
  if (!goodDays(days) || end === null || !Number.isInteger(days)) return null;
  const curFrom = windowStart(days, end);
  const prevTo = dayOf(Date.parse(`${curFrom}T00:00:00Z`) - DAY);
  return {
    days,
    cur: { from: curFrom, to: dayOf(end) },
    prev: { from: windowStart(2 * days, end), to: prevTo },
  };
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// The change from prev to cur. polarity says which direction is better for
// you: 'up' (revenue, visits), 'down' (CPC) or 'none' (a count that is not
// good or bad either way). Only polarity decides the tone, never the caller.
// pct is null when prev is 0 or less, where a percent means nothing.
export function deltaOf(cur, prev, { polarity = 'none' } = {}) {
  if (!finite(cur) || !finite(prev)) return null;
  const diff = cur - prev;
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  let tone = 'flat';
  if (direction !== 'flat' && polarity === 'up') tone = direction === 'up' ? 'good' : 'bad';
  if (direction !== 'flat' && polarity === 'down') tone = direction === 'down' ? 'good' : 'bad';
  return { cur, prev, diff, pct: prev > 0 ? (diff / prev) * 100 : null, direction, tone };
}
