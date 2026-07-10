-- Migration 8: goal deadlines + admin-only goal writes, competitor posts.
-- Run in the Supabase SQL editor after migration 7.

-- ============================ goals =================================

-- Optional date a goal should be done by. Shown next to the goal with
-- overdue / due-soon colors.
alter table public.goals add column if not exists deadline date;

-- Who is the admin? Checked against the team table (role is set only via
-- the dashboard / service role, never from the app).
create or replace function public.is_team_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team where id = auth.uid() and role = 'admin'
  );
$$;

-- Goals used to be team-wide writable (UI-only pen gating). Now the database
-- enforces it: everyone reads goals and ticks them off, only the admin
-- creates and deletes them.
drop policy if exists goals_team_all on public.goals;
drop policy if exists goals_read on public.goals;
drop policy if exists goals_insert_admin on public.goals;
drop policy if exists goals_update_team on public.goals;
drop policy if exists goals_delete_admin on public.goals;

create policy goals_read on public.goals
  for select to authenticated using (true);
create policy goals_insert_admin on public.goals
  for insert to authenticated with check (public.is_team_admin());
create policy goals_update_team on public.goals
  for update to authenticated using (true) with check (true);
create policy goals_delete_admin on public.goals
  for delete to authenticated using (public.is_team_admin());

-- RLS cannot compare old vs new values, so a trigger keeps non-admin updates
-- down to the done tick only. Title, horizon and deadline stay admin-only.
create or replace function public.goals_guard_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Service role / SQL editor sessions have no auth uid: let them through.
  if auth.uid() is null or public.is_team_admin() then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.horizon is distinct from old.horizon
     or new.deadline is distinct from old.deadline
     or new.created_by_email is distinct from old.created_by_email
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the admin can edit goals';
  end if;
  return new;
end;
$$;

drop trigger if exists goals_guard_update on public.goals;
create trigger goals_guard_update
  before update on public.goals
  for each row execute function public.goals_guard_update();

-- ============================ posts =================================

-- Competitor social posts live in the same posts table. brand null = our own
-- (your own) post, brand set = a competitor post. Shown on /competitors.
alter table public.posts add column if not exists brand text;
