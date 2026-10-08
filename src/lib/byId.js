// Narrows an update or delete on a table to one id or a list of ids, with
// `select` first in the address.
//
// supabase-js puts filters in the address in call order, so
// `db.from('ads').update(x).eq('id', id)` asks for `/rest/v1/ads?id=eq.<id>`.
// Common ad blocker lists drop any request whose address contains `/ads?id=`,
// so with a blocker on the save never leaves the browser and the app only
// sees "Failed to fetch". PostgREST reads the parameters in any order, and
// `/rest/v1/ads?select=id&id=eq.<id>` goes through.
//
// Returns the builder, so the caller awaits it as before. The rows come back
// as `data` (id only), which callers are free to ignore.
export function byId(builder, ids) {
  const q = builder.select('id');
  return Array.isArray(ids) ? q.in('id', ids) : q.eq('id', ids);
}
