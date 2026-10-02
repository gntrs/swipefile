-- Brief provenance columns (0.3.0): defaults, old style inserts, edits.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c3', 'c@example.com')
on conflict (id) do nothing;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);

-- 1. An old style insert (title and body only) works and gets empty arrays.
insert into public.briefs (title, body) values ('Old style brief', 'Body only');
do $$
declare r record;
begin
  select * into r from public.briefs where title = 'Old style brief';
  assert r.source_ad_ids = '{}'::uuid[], 'source_ad_ids defaults to an empty array';
  assert r.source_hooks = '{}'::text[], 'source_hooks defaults to an empty array';
  assert r.requested_by_email is null, 'requested_by_email defaults to null';
  assert r.updated_at is null, 'updated_at defaults to null';
  assert r.updated_by_email is null, 'updated_by_email defaults to null';
  assert r.added_by_email = 'claude@analysis', 'added_by_email keeps its default';
end $$;

-- 2. The ai function's insert, with every new column.
insert into public.briefs (title, body, added_by_email, requested_by_email, source_ad_ids, source_hooks)
values ('Generated brief', 'Goal: more trials.', 'claude@analysis', 'c@example.com',
        array['00000000-0000-4000-8000-000000000001']::uuid[], array['First hook', 'Second hook']);
do $$
begin
  assert (select cardinality(source_ad_ids) from public.briefs where title = 'Generated brief') = 1, 'source ads stored';
  assert (select source_hooks[2] from public.briefs where title = 'Generated brief') = 'Second hook', 'source hooks stored in order';
  assert exists (select 1 from public.briefs where source_ad_ids @> array['00000000-0000-4000-8000-000000000001']::uuid[]),
    'containment lookup on source ads works';
end $$;

-- 3. authenticated can edit a brief and stamp the edit.
update public.briefs
   set title = 'Old style brief, edited', updated_at = now(), updated_by_email = 'c@example.com'
 where title = 'Old style brief';
do $$
begin
  assert exists (
    select 1 from public.briefs
     where title = 'Old style brief, edited' and updated_at is not null and updated_by_email = 'c@example.com'
  ), 'edit saved with its stamp';
end $$;

-- 4. The arrays are never null.
do $$
begin
  begin
    insert into public.briefs (title, body, source_ad_ids) values ('Null sources', 'x', null);
    raise exception 'a null source_ad_ids should have been refused';
  exception when not_null_violation then
    null;
  end;
end $$;

rollback;

-- 5. Both indexes exist.
do $$
begin
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'briefs_source_ads_gin'), 'briefs_source_ads_gin exists';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ads_angle_idx'), 'ads_angle_idx exists';
end $$;
