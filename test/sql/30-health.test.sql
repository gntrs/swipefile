-- swipefile_health() answers before sign in and gives away no data.

insert into public.ads (brand, hook) values ('Health Check Brand', 'not visible to anon');

begin;
set local role anon;

do $$
declare h jsonb := public.swipefile_health();
begin
  assert (h ->> 'schema_version')::int = 3, format('schema_version is 3, got %s', h ->> 'schema_version');
  assert h ? 'bucket_exists', 'health has bucket_exists';
  assert h ? 'bucket_public', 'health has bucket_public';
  assert (h ->> 'bucket_exists')::boolean = true, 'bucket exists';
  assert (h ->> 'bucket_public')::boolean = false, 'bucket is private';
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.ads;
  assert n = 0, format('anon must see no ads, saw %s', n);
end $$;

rollback;

delete from public.ads where brand = 'Health Check Brand';
