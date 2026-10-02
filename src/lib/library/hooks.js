// Hook bank helpers. Pure.
import { angleOf } from '../angles.js';

// The hook to show for an ad. Prefer the headline; when it is blank (Ad
// Library and Foreplay-Spyder rows often carry no headline, only body copy),
// fall back to the first line of the copy so those ads - hundreds of them,
// many proven - still land in the bank. Capped so a hook stays a hook and
// not a whole paragraph.
export function hookText(a) {
  const headline = (a.hook || '').trim();
  if (headline) return headline;
  const firstLine = (a.ad_copy || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return firstLine.length > 140 ? `${firstLine.slice(0, 137).trimEnd()}...` : firstLine;
}

// The angle of a hook: the angle of its best ad, or null.
export function hookAngle(hook) {
  return angleOf(hook?.best) || null;
}

// Angle chip counts over a list of hooks: [{ id, count }] for every angle in
// use, plus none (hooks with no angle yet), in the order given.
export function angleCounts(hooks, ids) {
  const counts = new Map();
  let none = 0;
  for (const h of hooks || []) {
    const g = hookAngle(h);
    if (g) counts.set(g, (counts.get(g) || 0) + 1);
    else none++;
  }
  return { none, angles: ids.filter((id) => counts.has(id)).map((id) => ({ id, count: counts.get(id) })) };
}
