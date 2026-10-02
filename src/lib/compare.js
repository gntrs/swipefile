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
