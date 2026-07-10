-- Migration 4: team roles.
-- Run in the Supabase SQL editor after migration 3.
--
-- role is informational for now: nothing in the app gates on it yet, it is
-- just stored ('admin' or 'member') so we can build on it later. Members
-- cannot change roles from the app: the column grant below limits which
-- columns 'authenticated' can update. Roles are set from the Supabase
-- dashboard, SQL editor, or scripts/create-users.mjs (service role).

alter table public.team
  add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

-- App users may edit their own nickname + avatar (RLS already limits them to
-- their own row), but not their role.
revoke update on public.team from authenticated;
grant update (id, email, nickname, avatar_path) on public.team to authenticated;
