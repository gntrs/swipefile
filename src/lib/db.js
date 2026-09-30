import { createClient } from '@supabase/supabase-js';
import { readDbConfig } from './dbConfig.js';
import { createDemoClient } from './demo/client.js';

// Client-side database access. Uses the ANON key (Row Level Security must be
// ON for every table). Values come from .env (see .env.example).
// import.meta.env only exists under Vite; guard it so this module can also be
// imported by plain Node scripts (e.g. scripts/rescore-verdicts.mjs, which pulls
// in ads.js -> this file but supplies its own service-key client).
//
// With no .env at all the app runs in demo mode on an in memory client full of
// sample ads. A half or wrongly filled .env also gets that inert client, but
// the setup check keeps every page behind /setup until it is fixed.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const DB_CONFIG = readDbConfig(env);
export const DB_MODE = DB_CONFIG.mode; // 'live' | 'demo' | 'misconfigured'
export const IS_DEMO = DB_MODE === 'demo';

export const db =
  DB_MODE === 'live'
    ? createClient(DB_CONFIG.url, DB_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : createDemoClient();

// The API caps a single select at 1000 rows. We have thousands of ads, so a
// plain `.select('*')` silently drops everything past the first 1000: the ad
// library, hook bank and competitor views were all blind to the rest. This
// pages through with `.range()` until the table is exhausted.
//
// Usage:  const ads = await fetchAll((q) => q.order('created_at', { ascending: false }), 'ads');
// `build` receives the base `db.from(table).select('*')` query and adds
// ordering/filters; it must NOT set its own range or limit.
//
// A page that fails is retried twice (after 500 ms, then 1000 ms). If it still
// fails, the rows loaded so far are returned with two extra, non enumerable
// properties: `rows.error` (the last error) and `rows.partial` (true), so the
// caller can say what is missing instead of pretending the list is complete.
const PAGE = 1000;
const RETRY_DELAYS = [500, 1000];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchAll(build, table, { client = db, pageSize = PAGE, delays = RETRY_DELAYS } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let result = null;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await build(client.from(table).select('*')).range(from, from + pageSize - 1);
      } catch (err) {
        result = { data: null, error: { message: err?.message || String(err) } };
      }
      if (!result?.error || attempt >= delays.length) break;
      await wait(delays[attempt]);
    }
    const { data, error } = result || {};
    if (error) {
      console.warn(`[fetchAll] ${table} load error:`, error.message);
      Object.defineProperties(rows, {
        error: { value: error, enumerable: false },
        partial: { value: true, enumerable: false },
      });
      return rows;
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
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
// .mentions before db-setup.sql has been re-run): PostgREST's "schema
// cache" error for an unknown column on insert/select.
export function isMissingColumn(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === 'PGRST204' || /could not find the .* column/i.test(msg) || /column .* does not exist/i.test(msg);
}
