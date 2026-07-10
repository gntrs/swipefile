// Detect "this table does not exist yet" errors from supabase-js, so widgets
// added ahead of their migration can show a friendly setup card instead of
// crashing. PostgREST surfaces a missing table as PGRST205 ("Could not find
// the table ... in the schema cache") on current Supabase, or as Postgres
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

// Same idea, for a single column ahead of its migration (e.g. chat_messages
// .mentions before supabase-migration-11.sql runs) - PostgREST's "schema
// cache" error for an unknown column on insert/select.
export function isMissingColumn(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === 'PGRST204' || /could not find the .* column/i.test(msg) || /column .* does not exist/i.test(msg);
}
