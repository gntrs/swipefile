// The numbers behind Market intel, pure so they can be tested. Two sources
// with traps in them:
//
// seo_ranks: a null position with a `scanned` count means "looked at N results
// and we were not there". That is not a rank and is never drawn as one.
//
// trends_interest: Google scales every request 0 to 100 against the peak of
// the terms fetched together (one scale_group) over the timeframe. Values only
// compare inside one group, and the newest week is often partial and reads low.

const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

// Our rank for one term in one market over time, oldest first, one entry per
// day: { day, position (null when not found), scanned }.
export function rankHistory(rows, { market, term }) {
  const seen = new Map();
  for (const r of rows || []) {
    if (!r || !r.is_ours || r.market !== market || r.term !== term || !r.day) continue;
    const pos = Number(r.position);
    seen.set(r.day, {
      day: r.day,
      position: r.position != null && Number.isFinite(pos) && pos > 0 ? pos : null,
      scanned: Number.isFinite(Number(r.scanned)) ? Number(r.scanned) : null,
    });
  }
  return [...seen.values()].sort(byDay);
}

// How the latest check compares with the first one in the history. null when
// there is only one check. `climbed` is positive when we moved up the page.
export function rankChange(history) {
  const h = (history || []).filter(Boolean);
  if (h.length < 2) return null;
  const first = h[0];
  const last = h[h.length - 1];
  if (first.position != null && last.position != null) {
    return { kind: 'moved', from: first, to: last, climbed: first.position - last.position };
  }
  if (first.position == null && last.position != null) return { kind: 'entered', from: first, to: last };
  if (first.position != null && last.position == null) return { kind: 'dropped', from: first, to: last };
  return { kind: 'absent', from: first, to: last };
}

// A short plain sentence for rankChange, with the date formatter passed in.
export function rankChangeText(change, fmt = (d) => d) {
  if (!change) return '';
  const since = fmt(change.from.day);
  switch (change.kind) {
    case 'moved':
      if (change.climbed > 0) return `up ${change.climbed} since ${since}`;
      if (change.climbed < 0) return `down ${-change.climbed} since ${since}`;
      return `same as ${since}`;
    case 'entered':
      return `not found on ${since}`;
    case 'dropped':
      return `was #${change.from.position} on ${since}`;
    default:
      return `not found since ${since}`;
  }
}

// The latest complete week per scale group per geo. Each group keeps its own
// date and timeframe, because a value only means something inside its group.
// Partial points are skipped; when a group has nothing else the partial point
// is used and marked.
export function latestTrends(rows) {
  const geos = new Map();
  for (const r of rows || []) {
    if (!r || !r.geo || !r.term || !r.point_date) continue;
    const key = r.scale_group || `${r.geo}:${r.timeframe || ''}`;
    if (!geos.has(r.geo)) geos.set(r.geo, new Map());
    const groups = geos.get(r.geo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const [geo, groups] of geos) {
    const list = [];
    for (const [key, points] of groups) {
      const complete = points.filter((p) => !p.is_partial);
      const pool = complete.length ? complete : points;
      const date = pool.reduce((mx, p) => (p.point_date > mx ? p.point_date : mx), pool[0].point_date);
      const terms = pool
        .filter((p) => p.point_date === date)
        .map((p) => {
          const v = Number(p.value);
          const hasData = p.has_data !== false && Number.isFinite(v);
          return { term: p.term, value: hasData ? Math.max(0, Math.min(100, v)) : null };
        })
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.term.localeCompare(b.term));
      list.push({ key, date, timeframe: pool[0].timeframe || null, partial: !complete.length, terms });
    }
    list.sort((a, b) => a.key.localeCompare(b.key));
    out.push({ geo, groups: list });
  }
  return out;
}

// "12-m" style Google timeframes in words, for the chart title.
export function timeframeText(tf) {
  const m = /^today\s+(\d+)-m$/i.exec(String(tf || '').trim());
  if (m) return `last ${m[1]} months`;
  const d = /^now\s+(\d+)-d$/i.exec(String(tf || '').trim());
  if (d) return `last ${d[1]} days`;
  return tf ? String(tf) : 'the pulled period';
}
