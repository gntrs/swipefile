-- A member can create and edit their own team row but never pick their role.
-- Column privileges and row level security both refuse with SQLSTATE 42501
-- (insufficient_privilege).

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'b@example.com')
on conflict (id) do nothing;
delete from public.team where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- 1. Inserting your own row with a role is refused.
do $$
begin
  begin
    insert into public.team (id, email, role) values ('00000000-0000-4000-8000-0000000000a1', 'a@example.com', 'admin');
    raise exception 'insert with a role should have been refused';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- 2. The app's own upsert works, twice, and leaves the role at member.
insert into public.team (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'a@example.com')
  on conflict (id) do update set id = excluded.id, email = excluded.email;
insert into public.team (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'a@example.com')
  on conflict (id) do update set id = excluded.id, email = excluded.email;
do $$
begin
  assert (select role from public.team where id = '00000000-0000-4000-8000-0000000000a1') = 'member', 'upsert leaves role member';
end $$;

-- 3. Updating your own role is refused.
do $$
begin
  begin
    update public.team set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'role update should have been refused';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- 4. An upsert whose conflict branch sets the role is refused.
do $$
begin
  begin
    insert into public.team (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'a@example.com')
      on conflict (id) do update set role = 'admin';
    raise exception 'upsert setting role should have been refused';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- 5. Creating someone else's row is refused by row level security.
do $$
begin
  begin
    insert into public.team (id, email) values ('00000000-0000-4000-8000-0000000000b2', 'b@example.com');
    raise exception 'insert for another member should have been refused';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
