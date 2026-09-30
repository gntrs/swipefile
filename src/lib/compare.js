// Parsing /compare?ids=... Pure, so it can be tested without the page.
export const MAX_COMPARE = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// -> { ids, invalid, dropped }
//   ids      up to MAX_COMPARE unique uuids, in the order given (these get queried)
//   invalid  entries that are not uuids (reported as not found, never queried)
//   dropped  how many valid ids were over the limit
export function parseCompareIds(raw, max = MAX_COMPARE) {
  const ids = [];
  const invalid = [];
  let dropped = 0;
  for (const part of String(raw || '').split(',')) {
    const id = part.trim();
    if (!id) continue;
    if (!UUID.test(id)) {
      if (!invalid.includes(id)) invalid.push(id);
      continue;
    }
    const lower = id.toLowerCase();
    if (ids.includes(lower)) continue;
    if (ids.length >= max) dropped += 1;
    else ids.push(lower);
  }
  return { ids, invalid, dropped };
}

// Which column holds the best value in a Compare row. -1 unless at least two
// ads have a value and one of them is strictly best: a lone value is not a
// winner, and a tie at the top has no single winner.
export function bestIndex(values, dir) {
  if (dir !== 'max' && dir !== 'min') return -1;
  const known = [];
  (values || []).forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) known.push([v, i]);
  });
  if (known.length < 2) return -1;
  known.sort((a, b) => (dir === 'max' ? b[0] - a[0] : a[0] - b[0]));
  if (known[0][0] === known[1][0]) return -1;
  return known[0][1];
}
