// The arithmetic every chart in the app shares, kept pure so the rules can be
// tested without a browser. Bars start at zero, a missing value is never drawn
// as zero, and a line needs at least three real points before it is a line.

const DAY = 86400000;

export const MIN_LINE_POINTS = 3;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Width of a bar as a percentage of the scale maximum. Zero and negative
// values draw nothing; there is no minimum sliver, so a bar that is not there
// is not drawn.
export function barPct(value, max) {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || v <= 0 || m <= 0) return 0;
  return Math.min(100, (v / m) * 100);
}

// The top of a zero based axis: the smallest 1, 2, 2.5 or 5 times a power of
// ten at or above the largest value. 0 or less gives 1 so a flat zero series
// still has a scale.
export function niceMax(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * pow >= v - 1e-9) return step * pow;
  }
  return 10 * pow;
}

// UTC day string (YYYY-MM-DD) for a date or timestamp, '' when it is not one.
export const dayKey = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10);
};

// One entry per calendar day from `from` to `to` inclusive, value null where
// the rows have no entry for that day. A day with no row is unknown, not zero.
export function dailySeries(rows, { from, to, day = (r) => r.day, value }) {
  const byDay = new Map();
  for (const r of rows || []) {
    if (!r) continue;
    const k = day(r);
    if (!k) continue;
    const v = Number(value(r));
    if (Number.isFinite(v)) byDay.set(String(k).slice(0, 10), v);
  }
  const start = Date.parse(`${dayKey(from)}T00:00:00Z`);
  const end = Date.parse(`${dayKey(to)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const out = [];
  for (let t = start; t <= end; t += DAY) {
    const k = dayKey(t);
    out.push({ day: k, value: byDay.has(k) ? byDay.get(k) : null });
  }
  return out;
}

export const knownPoints = (series) => (series || []).filter((p) => finite(p?.value)).length;

// Enough real points for a line to say something about direction.
export const enoughForLine = (series) => knownPoints(series) >= MIN_LINE_POINTS;

// SVG path for a zero based line in a w by h box. A null breaks the line, so a
// missing day shows as a gap instead of a straight segment across it.
export function linePath(series, { width, height, max }) {
  const n = (series || []).length;
  if (!n || !(max > 0)) return '';
  const step = n > 1 ? width / (n - 1) : 0;
  let d = '';
  let pen = false;
  series.forEach((p, i) => {
    if (!finite(p?.value)) {
      pen = false;
      return;
    }
    const x = i * step;
    const y = height - (Math.max(0, p.value) / max) * height;
    d += `${pen ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
    pen = true;
  });
  return d.trim();
}

// Index of the series entry nearest a horizontal position (0 to 1).
export function nearestIndex(series, fraction) {
  const n = (series || []).length;
  if (!n) return -1;
  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  return Math.round(f * (n - 1));
}

// Which of the five heat steps a value takes on a shared scale. 0 is the bare
// track and only ever means zero (or nothing known). From 1 the steps spread
// evenly up to the scale maximum, so 1 is the lowest real count and max is 5.
export function heatStep(value, max) {
  const v = Number(value);
  if (value === null || value === undefined || !Number.isFinite(v) || v <= 0) return 0;
  const m = Number(max);
  if (!Number.isFinite(m) || m <= 1) return 5;
  return Math.min(5, Math.max(1, 1 + Math.round(((v - 1) / (m - 1)) * 4)));
}

// Whole percents for the parts of a total that add up to exactly 100, by the
// largest remainder: every part is floored, then the points left over go to
// the largest remainders (the earlier part wins a tie). A zero, negative or
// missing part stays 0. All zero gives all 0.
export function splitShares(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return [];
  const clean = list.map((v) => {
    const n = Number(v);
    return v !== null && Number.isFinite(n) && n > 0 ? n : 0;
  });
  const total = clean.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return clean.map(() => 0);
  const raw = clean.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .filter((x) => clean[x.i] > 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}
