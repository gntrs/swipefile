-- Swipefile: complete database setup in one file.
-- Fresh install? Paste this whole thing into the Supabase SQL Editor and run once.
-- (It is the base schema + every numbered migration, concatenated in order.
--  Existing installs should run only the individual migrations they are missing.)

-- ============ supabase-schema.sql ============
-- Ad Tracker - database schema.
-- Run this in the Supabase SQL editor once, then create the storage bucket
-- (see README). Team-shared model: any signed-in team member can read/write all
-- rows (it's an internal tool, not a public product). Tighten later if needed.

-- ============================ ads ==================================
create table if not exists public.ads (
  id           uuid primary key default gen_random_uuid(),
  brand        text,
  platform     text,
  format       text default 'image',       -- image | video
  media_path   text,                        -- path in the 'ad-media' storage bucket
  hook         text,
  ad_copy      text,
  landing_url  text,
  status       text default 'running',      -- running | dead | saved
  verdict      text default 'unsure',       -- winner | loser | testing | unsure
  tags         text[] default '{}',
  metrics      jsonb default '{}'::jsonb,    -- optional { spend, ctr, cpc, roas, ... }
  added_by       uuid references auth.users(id),
  added_by_email text,                        -- shown in the UI: who added this ad
  created_at   timestamptz default now()
);
create index if not exists ads_created_idx on public.ads (created_at desc);
create index if not exists ads_verdict_idx on public.ads (verdict);

-- ========================== comments ================================
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  ad_id        uuid references public.ads(id) on delete cascade,
  body         text not null,
  author_id    uuid references auth.users(id),
  author_email text,
  created_at   timestamptz default now()
);
create index if not exists comments_ad_idx on public.comments (ad_id);

-- ============================ RLS ===================================
alter table public.ads enable row level security;
alter table public.comments enable row level security;

-- Internal team tool: any authenticated user can do everything.
drop policy if exists ads_team_all on public.ads;
create policy ads_team_all on public.ads
  for all to authenticated using (true) with check (true);

drop policy if exists comments_team_all on public.comments;
create policy comments_team_all on public.comments
  for all to authenticated using (true) with check (true);

-- ============ supabase-migration-2.sql ============
-- Migration 2: organic posts + comments on posts.
-- Run AFTER supabase-schema.sql, in the Supabase SQL editor.

-- ========================== posts ==================================
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  platform       text,                        -- Facebook | Instagram | TikTok | YouTube | Other
  post_type      text default 'post',         -- post | story | reel | video | other
  url            text,
  title          text,                        -- short label / the hook line
  copy           text,                        -- full caption / text
  media_path     text,                        -- optional screenshot in 'ad-media' bucket
  posted_at      date,
  verdict        text default 'unsure',       -- winner | loser | testing | unsure
  tags           text[] default '{}',
  metrics        jsonb default '{}'::jsonb,    -- { views, likes, comments, shares, saves, clicks, signups }
  notes          text,
  added_by       uuid references auth.users(id),
  added_by_email text,
  created_at     timestamptz default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_posted_idx  on public.posts (posted_at desc);

alter table public.posts enable row level security;
drop policy if exists posts_team_all on public.posts;
create policy posts_team_all on public.posts
  for all to authenticated using (true) with check (true);

-- ==================== comments -> posts too =========================
alter table public.comments
  add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.comments
  alter column ad_id drop not null;
create index if not exists comments_post_idx on public.comments (post_id);

-- ============ supabase-migration-3.sql ============
-- Migration 3: team profiles (nickname + avatar).
-- Run in the Supabase SQL editor after migration 2.
-- A row is auto-created by the app on first login (id + email); each member can
-- edit only their OWN profile, everyone can read all (needed to show nicknames
-- and avatars across the app).

create table if not exists public.team (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nickname    text,
  avatar_path text,                 -- stored in the 'ad-media' bucket under avatars/
  created_at  timestamptz default now()
);

alter table public.team enable row level security;

drop policy if exists team_read_all on public.team;
create policy team_read_all on public.team
  for select to authenticated using (true);

drop policy if exists team_insert_own on public.team;
create policy team_insert_own on public.team
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists team_update_own on public.team;
create policy team_update_own on public.team
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ============ supabase-migration-4.sql ============
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

-- ============ supabase-migration-5.sql ============
-- Migration 5: team board - quick chat + goals on the dashboard.
-- Run in the Supabase SQL editor after migration 4.
-- Both tables are simple team-wide lists: everyone logged in can read and
-- write everything (internal tool, same posture as ads/posts/comments).

-- ======================= chat_messages ==============================
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  body         text not null,
  author_id    uuid references auth.users(id),
  author_email text,
  created_at   timestamptz default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;
drop policy if exists chat_messages_team_all on public.chat_messages;
create policy chat_messages_team_all on public.chat_messages
  for all to authenticated using (true) with check (true);

-- Live chat: broadcast new rows over Supabase Realtime so messages appear
-- without a refresh. Safe to re-run (skips if already added).
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;

-- =========================== goals ==================================
create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  horizon          text not null check (horizon in ('1w', '2w', '1m')),  -- 1 week | 2 weeks | 1 month
  done             boolean default false,
  created_by_email text,
  created_at       timestamptz default now()
);
create index if not exists goals_created_idx on public.goals (created_at desc);

alter table public.goals enable row level security;
drop policy if exists goals_team_all on public.goals;
create policy goals_team_all on public.goals
  for all to authenticated using (true) with check (true);

-- ============ supabase-migration-6.sql ============
-- Migration 6: creator outreach tracker.
-- Run in the Supabase SQL editor after migration 5.
-- One row per creator contacted for a collab: who, where, and how far the
-- conversation got. Everyone logged in can read and write (internal tool,
-- same posture as ads/posts/comments).

create table if not exists public.outreach (
  id             uuid primary key default gen_random_uuid(),
  creator        text not null,  -- name or @handle
  platform       text not null check (platform in ('email', 'instagram', 'tiktok', 'youtube', 'other')),
  status         text not null default 'sent' check (status in ('sent', 'followup', 'replied', 'deal', 'dead')),
  link           text,           -- profile or thread url
  notes          text,
  added_by       uuid references auth.users(id),
  added_by_email text,
  created_at     timestamptz default now()
);
create index if not exists outreach_created_idx on public.outreach (created_at desc);

alter table public.outreach enable row level security;
drop policy if exists outreach_team_all on public.outreach;
create policy outreach_team_all on public.outreach
  for all to authenticated using (true) with check (true);

-- ============ supabase-migration-7.sql ============
-- Migration 7: team availability calendar.
-- Run in the Supabase SQL editor after migration 6.
--
-- Each row is one block of time on one day for one person: "in office",
-- "work from home", or "out". Times are stored as minutes-from-midnight
-- (wall-clock, timezone-free) so a weekly schedule stays simple: a block is
-- just day + start_min..end_min + status. Everyone can read the whole team's
-- week; you may only add / change / remove your OWN blocks.

create table if not exists public.availability (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,                        -- shown in the UI: whose block this is
  day        date not null,               -- the calendar day
  start_min  int  not null,               -- minutes from midnight, 0..1440
  end_min    int  not null,               -- minutes from midnight, > start_min
  status     text not null default 'in_office'
             check (status in ('in_office', 'wfh', 'out')),
  note       text,
  created_at timestamptz default now(),
  check (start_min >= 0 and end_min <= 1440 and end_min > start_min)
);
create index if not exists availability_day_idx on public.availability (day);
create index if not exists availability_user_idx on public.availability (user_id);

alter table public.availability enable row level security;

-- Everyone on the team sees everyone's week.
drop policy if exists availability_read_all on public.availability;
create policy availability_read_all on public.availability
  for select to authenticated using (true);

-- You may only create / edit / delete your own blocks.
drop policy if exists availability_insert_own on public.availability;
create policy availability_insert_own on public.availability
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists availability_update_own on public.availability;
create policy availability_update_own on public.availability
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists availability_delete_own on public.availability;
create policy availability_delete_own on public.availability
  for delete to authenticated using (auth.uid() = user_id);

-- ============ supabase-migration-8.sql ============
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

-- ============ supabase-migration-9.sql ============
-- Migration 9: briefs - Claude's analysis summaries, saved into the dashboard.
-- Run in the Supabase SQL editor after migration 8.
--
-- Every time Claude Code delivers an analysis (ads autopsy, funnel findings,
-- competitor read), a copy lands here via scripts/add-brief.mjs so the team
-- can reread it on their phones and Claude can reread it next session.

create table if not exists public.briefs (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text not null,          -- plain text, whitespace preserved
  added_by_email text default 'claude@analysis',
  created_at     timestamptz default now()
);
create index if not exists briefs_created_idx on public.briefs (created_at desc);

alter table public.briefs enable row level security;
drop policy if exists briefs_team_all on public.briefs;
create policy briefs_team_all on public.briefs
  for all to authenticated using (true) with check (true);

-- ============================ goals =================================
-- Claude writes action items straight into goals (created_by_email
-- 'claude@analysis', shown as "by Claude"). urgent = red tag in the UI;
-- brief_id links a goal to the brief that explains it - tapping the goal
-- opens that brief expanded and highlighted.
alter table public.goals add column if not exists urgent boolean default false;
alter table public.goals add column if not exists brief_id uuid references public.briefs(id) on delete set null;

-- ============ supabase-migration-10.sql ============
-- Migration 10: chat reactions.
-- Run in the Supabase SQL editor after migration 9.
--
-- One row = one person reacting with one emoji to one chat message.
-- Tapping the same emoji again removes the row (toggle). Claude reacts too,
-- via scripts/chat.mjs --react (author_email 'claude@analysis').

create table if not exists public.chat_reactions (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages(id) on delete cascade,
  emoji        text not null,
  author_email text not null,
  created_at   timestamptz default now(),
  unique (message_id, emoji, author_email)
);
create index if not exists chat_reactions_msg_idx on public.chat_reactions (message_id);

alter table public.chat_reactions enable row level security;
drop policy if exists chat_reactions_team_all on public.chat_reactions;
create policy chat_reactions_team_all on public.chat_reactions
  for all to authenticated using (true) with check (true);

-- Live reactions over realtime, same as the messages themselves.
do $$
begin
  alter publication supabase_realtime add table public.chat_reactions;
exception
  when duplicate_object then null;
end $$;

-- ============ supabase-migration-11.sql ============
-- Migration 11: @mentions in team chat.
-- Run in the Supabase SQL editor after migration 10.
--
-- Typing @name in the chat composer resolves to the mentioned person's email
-- and is stored alongside the message so it can be queried without parsing
-- the body text (used to highlight "you were mentioned" in the UI, and by
-- scripts/chat.mjs --mentions so Claude can check whether it was tagged).

alter table public.chat_messages add column if not exists mentions text[] default '{}';
create index if not exists chat_messages_mentions_idx on public.chat_messages using gin (mentions);

-- ============ supabase-migration-12.sql ============
-- Migration 12: live goals - broadcast goal changes over Supabase Realtime so
-- new/edited/deleted goals show up on the dashboard without a page refresh
-- (same mechanism as chat_messages in migration 5). Safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.goals;
exception
  when duplicate_object then null;
end $$;

-- ============ supabase-migration-13.sql ============
-- Migration 13: creator finder - scraped Instagram creator leads + the job
-- queue that lets a dashboard button trigger the scraper on your cron box.
-- Run in the Supabase SQL editor after migration 12. Safe to re-run.
--
-- Flow: the Outreach page inserts a scrape_jobs row (status 'pending');
-- creators-cron.sh on your cron box polls every couple of minutes, runs
-- scripts/scrape-creators.mjs --job (Brave Search API), and fills
-- creator_leads. The page streams new leads in and offers one-tap
-- "add to outreach".

create table if not exists public.creator_leads (
  id             uuid primary key default gen_random_uuid(),
  handle         text not null unique,       -- instagram handle, no @
  name           text,                       -- display name from the page title
  url            text not null,              -- instagram.com/<handle>
  platform       text not null default 'instagram',
  followers      integer,                    -- null = count not found in search snippets
  tier           text check (tier in ('nano', 'small', 'mid', 'big')),
  -- nano: under 50k (the ~25k group) · small: 50-100k · mid: 100-250k ·
  -- big: 250k+ (the ~1M group). Null tier = followers unknown, check manually.
  bio            text,                       -- search result snippet
  source_query   text,                       -- which search found them
  status         text not null default 'new' check (status in ('new', 'outreached', 'dismissed')),
  added_by_email text default 'scraper@import',
  created_at     timestamptz default now()
);
create index if not exists creator_leads_created_idx on public.creator_leads (created_at desc);

create table if not exists public.scrape_jobs (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null default 'creators',
  status             text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  params             jsonb default '{}'::jsonb,  -- {queries: [...]} to override the builtin niche queries
  note               text,                       -- result summary or error message
  requested_by_email text,
  created_at         timestamptz default now(),
  finished_at        timestamptz
);
create index if not exists scrape_jobs_status_idx on public.scrape_jobs (status, created_at);

alter table public.creator_leads enable row level security;
drop policy if exists creator_leads_team_all on public.creator_leads;
create policy creator_leads_team_all on public.creator_leads
  for all to authenticated using (true) with check (true);

alter table public.scrape_jobs enable row level security;
drop policy if exists scrape_jobs_team_all on public.scrape_jobs;
create policy scrape_jobs_team_all on public.scrape_jobs
  for all to authenticated using (true) with check (true);

-- Live updates on the Outreach page (same mechanism as chat/goals).
do $$
begin
  alter publication supabase_realtime add table public.creator_leads;
exception
  when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.scrape_jobs;
exception
  when duplicate_object then null;
end $$;

-- ============ supabase-migration-14.sql ============
-- Migration 14: contact emails for scraped creator leads.
-- Run in the Supabase SQL editor after migration 13. Safe to re-run.
--
-- scripts/scrape-emails.mjs fills these: it looks for the business email a
-- creator publishes (bio snippet already stored, their linktr.ee / beacons
-- page, then one Brave search) and records where it found it.
-- email_checked_at set + email null = looked and found nothing, do not retry.

alter table public.creator_leads add column if not exists email text;
alter table public.creator_leads add column if not exists email_source text;
alter table public.creator_leads add column if not exists email_checked_at timestamptz;

-- ============ supabase-migration-15.sql ============
-- Migration 15: competitors registry - which brands we auto-track, now that
-- competitor ads come straight from the Meta Ad Library API instead of
-- Foreplay. Run in the Supabase SQL editor after migration 14. Safe to re-run.
--
-- Flow: scripts/import-ad-library.mjs seeds this from the old Foreplay Spyder
-- brands on first run, resolves each brand's Meta page_id by searching the
-- Ad Library, then pulls every EU-reached ad per page daily (ads-cron).
-- The team adds/edits brands on /competitors (paste an Ad Library link or a
-- page id); ig_handle feeds scripts/scrape-competitor-posts.mjs weekly.

create table if not exists public.competitors (
  id              uuid primary key default gen_random_uuid(),
  brand           text not null unique,   -- display name, matches ads.brand
  page_id         text,                   -- Meta page id; null = not resolved yet
  ig_handle       text,                   -- instagram handle, no @; feeds the posts scraper
  active          boolean not null default true,  -- false = keep the rows, stop scraping
  notes           text,
  added_by_email  text default 'adlib@import',
  created_at      timestamptz default now(),
  last_scraped_at timestamptz             -- last successful ad/post pull
);

alter table public.competitors enable row level security;
drop policy if exists competitors_team_all on public.competitors;
create policy competitors_team_all on public.competitors
  for all to authenticated using (true) with check (true);

-- ============ supabase-migration-16.sql ============
-- Migration 16: kpi_snapshots - one row per day of the numbers that matter,
-- so the dashboard can draw funnel + traffic (and later revenue) trends the
-- frontend can read directly. Run in the Supabase SQL editor after migration
-- 15. Safe to re-run.
--
-- Why a table: PostHog is not reachable from the browser here (RLS-free anon
-- key can't query it, and the account differs - see CLAUDE.md), so the daily
-- cron pulls the numbers and stamps one snapshot row here for the app to read.
--
-- One row = one day. `metrics` is an open jsonb so new number sources slot in
-- WITHOUT a schema change - today it holds `traffic` and `funnel`; when Stripe
-- lands it just gains a `revenue` key. scripts/snapshot-kpis.mjs writes it
-- (service key, merges keys so different sources never clobber each other).

create table if not exists public.kpi_snapshots (
  day        date primary key,
  metrics    jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.kpi_snapshots enable row level security;
drop policy if exists kpi_snapshots_team_all on public.kpi_snapshots;
create policy kpi_snapshots_team_all on public.kpi_snapshots
  for all to authenticated using (true) with check (true);

-- ============ supabase-migration-17.sql ============
-- Migration 17: sales - one row per Stripe payment, the live feed behind the
-- dashboard revenue counter + per-sale confetti. Filled by
-- scripts/stripe-pull.mjs (cron, service key); the browser only reads.
-- Aggregates (MRR, lifetime gross) live in kpi_snapshots.metrics.revenue,
-- exactly the key migration 16 reserved for Stripe.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  stripe_id text not null unique,          -- Stripe charge id (dedupe key)
  amount numeric not null,                 -- major units, e.g. 12.99
  currency text not null default 'eur',
  product text,                            -- price nickname / product name if known
  paid_at timestamptz not null,            -- Stripe charge created time
  created_at timestamptz not null default now()
);

alter table public.sales enable row level security;

-- Internal tool: any logged-in teammate can read; only the service key writes.
create policy "sales readable by team"
  on public.sales for select
  to authenticated
  using (true);

-- Live per-sale events for the dashboard confetti.
alter publication supabase_realtime add table public.sales;
