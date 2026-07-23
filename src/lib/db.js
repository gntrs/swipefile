import { createClient } from '@supabase/supabase-js';

// Client-side database access. Uses the ANON key (Row Level Security must be
// ON for every table). Values come from .env (see .env.example).
// import.meta.env only exists under Vite; guard it so this module can also be
// imported by plain Node scripts (e.g. scripts/rescore-verdicts.mjs, which pulls
// in ads.js -> this file but supplies its own service-key client).
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const url = env.VITE_DB_URL || env.VITE_SUPABASE_URL;
const anon = env.VITE_DB_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Loud in dev so setup mistakes are obvious.
  console.warn(
    '[db] Missing VITE_DB_URL / VITE_DB_ANON_KEY. Copy .env.example to .env and fill them in.'
  );
}

export const db = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

// The API caps a single select at 1000 rows. We have thousands of ads, so a
// plain `.select('*')` silently drops everything past the first 1000 - the ad
// library, hook bank and competitor views were all blind to the rest. This
// pages through with `.range()` until the table is exhausted.
//
// Usage:  const ads = await fetchAll((q) => q.order('created_at', { ascending: false }), 'ads');
// `build` receives the base `db.from(table).select('*')` query and adds
// ordering/filters; it must NOT set its own range or limit.
const PAGE = 1000;
export async function fetchAll(build, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(db.from(table).select('*')).range(from, from + PAGE - 1);
    if (error) {
      console.warn(`[fetchAll] ${table} load error:`, error.message);
      break;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Detect "this table does not exist yet" errors from the database client, so
// widgets added ahead of their schema can show a friendly setup card instead
// of crashing. PostgREST surfaces a missing table as PGRST205 ("Could not find
// the table ... in the schema cache") on current stacks, or as Postgres
// 42P01 ("relation ... does not exist") on older stacks / raw queries.
export function isMissingTable(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  );
}

// Same idea, for a single column ahead of its schema (e.g. chat_messages
// .mentions before db-setup.sql has been re-run) - PostgREST's "schema
// cache" error for an unknown column on insert/select.
export function isMissingColumn(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === 'PGRST204' || /could not find the .* column/i.test(msg) || /column .* does not exist/i.test(msg);
}
