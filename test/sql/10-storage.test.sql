-- The ad-media bucket and its policies, as db-setup.sql creates them.
-- Two members, A and B. Everything that switches role runs inside a
-- transaction that is rolled back, so the test leaves no rows behind.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'b@example.com')
on conflict (id) do nothing;

-- The bucket: private, 50 MB, images and video only.
do $$
declare b record;
begin
  select * into b from storage.buckets where id = 'ad-media';
  assert found, 'bucket ad-media exists';
  assert b.public = false, 'bucket ad-media is private';
  assert b.file_size_limit = 52428800, 'bucket limit is 50 MB';
  assert b.allowed_mime_types = array['image/*', 'video/*'], 'bucket takes images and video only';
end $$;

begin;
set local role authenticated;

-- As A: own folder and own avatar are allowed, everything else is refused.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name) values ('ad-media', '00000000-0000-4000-8000-0000000000a1/1.jpg');
insert into storage.objects (bucket_id, name) values ('ad-media', 'avatars/00000000-0000-4000-8000-0000000000a1-17.jpg');

do $$
declare
  refused text[] := array[
    '00000000-0000-4000-8000-0000000000b2/1.jpg',
    'avatars/00000000-0000-4000-8000-0000000000b2-17.jpg',
    'avatars/x/00000000-0000-4000-8000-0000000000a1-17.jpg',
    'root.jpg'
  ];
  p text;
begin
  foreach p in array refused loop
    begin
      insert into storage.objects (bucket_id, name) values ('ad-media', p);
      raise exception 'upload to % should have been refused', p;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end $$;

-- As B: reads A's files, cannot delete them, can delete its own.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name) values ('ad-media', '00000000-0000-4000-8000-0000000000b2/2.jpg');

do $$
declare n int;
begin
  select count(*) into n from storage.objects where name like '00000000-0000-4000-8000-0000000000a1/%';
  assert n = 1, 'B can read A''s upload';
  delete from storage.objects where name = '00000000-0000-4000-8000-0000000000a1/1.jpg';
  get diagnostics n = row_count;
  assert n = 0, 'B cannot delete A''s upload';
  delete from storage.objects where name = '00000000-0000-4000-8000-0000000000b2/2.jpg';
  get diagnostics n = row_count;
  assert n = 1, 'B can delete its own upload';
end $$;

rollback;

-- A bucket someone made public goes back to private on the next run.
update storage.buckets set public = true where id = 'ad-media';
\ir ../../db-setup.sql

do $$
declare n int;
begin
  assert (select public from storage.buckets where id = 'ad-media') = false, 're-running db-setup.sql makes the bucket private';
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'ad_media_%';
  assert n = 3, format('exactly three ad_media policies, found %s', n);
end $$;
