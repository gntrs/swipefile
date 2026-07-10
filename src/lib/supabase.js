import { createClient } from '@supabase/supabase-js';

// Client-side Supabase. Uses the ANON key (Row Level Security must be ON in the
// dashboard). Values come from .env (see .env.example).
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Loud in dev so setup mistakes are obvious.
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.'
  );
}

export const supabase = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Supabase caps a single select at 1000 rows. We have thousands of ads, so a
// plain `.select('*')` silently drops everything past the first 1000 - the ad
// library, hook bank and competitor views were all blind to the rest. This
// pages through with `.range()` until the table is exhausted.
//
// Usage:  const ads = await fetchAll((q) => q.order('created_at', { ascending: false }), 'ads');
// `build` receives the base `supabase.from(table).select('*')` query and adds
// ordering/filters; it must NOT set its own range or limit.
const PAGE = 1000;
export async function fetchAll(build, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(supabase.from(table).select('*')).range(from, from + PAGE - 1);
    if (error) {
      console.warn(`[fetchAll] ${table} load error:`, error.message);
      break;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

