-- ============================================================================
-- db-setup.sql - complete database setup for this project.
--
-- Run this once in your database's SQL editor. Safe to re-run: every statement
-- is idempotent (create table if not exists, create index if not exists,
-- create or replace function, drop-then-create policies and triggers, guarded
-- publication adds), so running it twice on the same database succeeds.
--
-- After running it, create a storage bucket named `ad-media` in your database
-- dashboard (set it to Private; the app reads media through short-lived signed
-- URLs, never public URLs).
--
-- Access model: internal team tool. Any signed-in team member can read/write
-- everything, with two exceptions enforced below: goals (admin-only
-- create/edit/delete, everyone ticks them off) and availability (read all,
-- write only your own blocks). Analytics-style tables (sales, seo_ranks,
-- trends_interest) are read-only for the team; only the service key writes.
--
-- Order: tables in dependency order (team -> ads -> posts -> comments ->
-- chat -> briefs -> goals -> the rest), functions/triggers next to the table
-- they guard, realtime publication setup grouped at the end.
-- ============================================================================


-- ============================ team ==================================
-- One profile row per member (id = auth user id). A row is auto-created by
-- the app on first login (id + email); each member can edit only their OWN
-- profile, everyone can read all (needed to show nicknames and avatars
-- across the app).
--
-- role is informational for now: nothing in the app gates on it except goals
-- (below). Members cannot change roles from the app: the column grant below
-- limits which columns 'authenticated' can update. Roles are set from the
-- database dashboard, SQL editor, or scripts/create-users.mjs (service role).

create table if not exists public.team (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nickname    text,
  avatar_path text,                 -- stored in the 'ad-media' bucket under avatars/
  role        text not null default 'member' check (role in ('admin', 'member')),
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

-- App users may edit their own nickname + avatar (RLS already limits them to
-- their own row), but not their role.
revoke update on public.team from authenticated;
grant update (id, email, nickname, avatar_path) on public.team to authenticated;

-- Who is the admin? Checked against the team table (role is set only via the
-- dashboard / service role, never from the app). Used by the goals policies
-- and trigger below.
create or replace function public.is_team_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team where id = auth.uid() and role = 'admin'
  );
$$;


-- ============================ ads ==================================
-- Own + competitor ads, one row per ad. Includes the geo transparency
-- columns: the Meta Ad Library returns DSA transparency data (EU reach,
-- per-country reach breakdown) ONLY for ads that were served in the EU/UK.
-- Filled by scripts/sync-geo.mjs (service key); the browser only reads.
--
-- geo_status keeps three genuinely different things apart:
--   'eu'      the Ad Library returned an EU transparency block -> the ad ran
--             in the EU, and `countries` / `eu_reach` are populated from it.
--   'none'    the ad WAS found in the Ad Library but carried no EU block ->
--             it did not run in the EU. This is a real, known answer.
--   'unknown' never resolved (rows imported from other sources with no Ad
--             Library match, or synced before geo tracking). NOT an answer.
-- "ran outside the EU" must never be confused with "we never checked", which
-- is why 'none' and 'unknown' are separate values rather than one null.

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
  geo_status   text not null default 'unknown'
               constraint ads_geo_status_check check (geo_status in ('eu', 'none', 'unknown')),
  countries    text[] not null default '{}',
  eu_reach     integer,
  geo_synced_at timestamptz,
  added_by       uuid references auth.users(id),
  added_by_email text,                        -- shown in the UI: who added this ad
  created_at   timestamptz default now()
);
create index if not exists ads_created_idx on public.ads (created_at desc);
create index if not exists ads_verdict_idx on public.ads (verdict);
-- Country filter on /ads ("show me everything running in ES / FR") is a
-- containment query on the array -> GIN.
create index if not exists ads_countries_gin on public.ads using gin (countries);
-- Status facet + the sync script's own "what still needs resolving" query.
create index if not exists ads_geo_status_idx on public.ads (geo_status);
-- Staleness sweep: sync-geo.mjs --since Nd orders by this.
create index if not exists ads_geo_synced_at_idx on public.ads (geo_synced_at);

alter table public.ads enable row level security;

-- Internal team tool: any authenticated user can do everything.
drop policy if exists ads_team_all on public.ads;
create policy ads_team_all on public.ads
  for all to authenticated using (true) with check (true);

comment on column public.ads.geo_status is 'eu | none | unknown - see the ads section of db-setup.sql';
comment on column public.ads.countries is 'ISO-3166-1 alpha-2 codes the ad is known to have run in (EU/UK only - Meta exposes no others)';
comment on column public.ads.eu_reach is 'eu_total_reach from the Ad Library, null unless geo_status = eu';
comment on column public.ads.geo_synced_at is 'last successful Ad Library geo lookup, null = never resolved';


-- ============================ posts =================================
-- Organic posts. brand null = our own post, brand set = a competitor's post
-- (competitor posts are shown on /competitors).

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
  brand          text,                        -- null = our own post, set = competitor's
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


-- ========================== comments ================================
-- Team notes on an ad OR a post: exactly one of ad_id / post_id is set.

create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  ad_id        uuid references public.ads(id) on delete cascade,
  post_id      uuid references public.posts(id) on delete cascade,
  body         text not null,
  author_id    uuid references auth.users(id),
  author_email text,
  created_at   timestamptz default now()
);
create index if not exists comments_ad_idx on public.comments (ad_id);
create index if not exists comments_post_idx on public.comments (post_id);

alter table public.comments enable row level security;
drop policy if exists comments_team_all on public.comments;
create policy comments_team_all on public.comments
  for all to authenticated using (true) with check (true);


-- ======================= chat_messages ==============================
-- Quick team chat on the dashboard. mentions: typing @name in the composer
-- resolves to the mentioned person's email and is stored alongside the
-- message so it can be queried without parsing the body text (used to
-- highlight "you were mentioned" in the UI, and by scripts/chat.mjs
-- --mentions so Claude can check whether it was tagged).

create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  body         text not null,
  author_id    uuid references auth.users(id),
  author_email text,
  mentions     text[] default '{}',
  created_at   timestamptz default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);
create index if not exists chat_messages_mentions_idx on public.chat_messages using gin (mentions);

alter table public.chat_messages enable row level security;
drop policy if exists chat_messages_team_all on public.chat_messages;
create policy chat_messages_team_all on public.chat_messages
  for all to authenticated using (true) with check (true);


-- ======================= chat_reactions =============================
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


-- ============================ briefs ================================
-- Claude's analysis summaries, saved into the dashboard. Every time Claude
-- Code delivers an analysis (ads autopsy, funnel findings, competitor read),
-- a copy lands here via scripts/add-brief.mjs so the team can reread it and
-- Claude can reread it next session.

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
-- Team goals on the dashboard. Claude writes action items here too
-- (created_by_email 'claude@analysis', shown as "by Claude"). urgent = red
-- tag in the UI; brief_id links a goal to the brief that explains it -
-- tapping the goal opens that brief expanded and highlighted.
--
-- This is the one table where the admin role is enforced in the database:
-- everyone reads goals and ticks them off, only the admin creates and
-- deletes them (policies below + trigger guard).

create table if not exists public.goals (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  horizon          text not null check (horizon in ('1w', '2w', '1m')),  -- 1 week | 2 weeks | 1 month
  done             boolean default false,
  deadline         date,                    -- optional; overdue / due-soon colors in the UI
  urgent           boolean default false,
  brief_id         uuid references public.briefs(id) on delete set null,
  created_by_email text,
  created_at       timestamptz default now()
);
create index if not exists goals_created_idx on public.goals (created_at desc);

alter table public.goals enable row level security;

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


-- =========================== outreach ===============================
-- Creator outreach tracker. One row per creator contacted for a collab:
-- who, where, and how far the conversation got. Everyone logged in can read
-- and write (internal tool, same posture as ads/posts/comments).

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


-- ========================= availability =============================
-- Team availability calendar. Each row is one block of time on one day for
-- one person: "in office", "work from home", or "out". Times are stored as
-- minutes-from-midnight (wall-clock, timezone-free) so a weekly schedule
-- stays simple: a block is just day + start_min..end_min + status. Everyone
-- can read the whole team's week; you may only add / change / remove your
-- OWN blocks.

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


-- ========================= creator_leads ============================
-- Creator finder: scraped Instagram creator leads + the job queue that lets
-- a dashboard button trigger the scraper on the cron worker.
--
-- Flow: the Outreach page inserts a scrape_jobs row (status 'pending');
-- scripts/creators-cron.sh polls every couple of minutes, runs
-- scripts/scrape-creators.mjs --job (Brave Search API), and fills
-- creator_leads. The page streams new leads in and offers one-tap
-- "add to outreach".
--
-- Contact emails: scripts/scrape-emails.mjs fills email/email_source/
-- email_checked_at - it looks for the business email a creator publishes
-- (bio snippet already stored, their linktr.ee / beacons page, then one
-- Brave search) and records where it found it.
-- email_checked_at set + email null = looked and found nothing, do not retry.

create table if not exists public.creator_leads (
  id               uuid primary key default gen_random_uuid(),
  handle           text not null unique,       -- instagram handle, no @
  name             text,                       -- display name from the page title
  url              text not null,              -- instagram.com/<handle>
  platform         text not null default 'instagram',
  followers        integer,                    -- null = count not found in search snippets
  tier             text check (tier in ('nano', 'small', 'mid', 'big')),
  -- nano: under 50k · small: 50-100k · mid: 100-250k · big: 250k+.
  -- Null tier = followers unknown, check manually.
  bio              text,                       -- search result snippet
  source_query     text,                       -- which search found them
  status           text not null default 'new' check (status in ('new', 'outreached', 'dismissed')),
  email            text,
  email_source     text,
  email_checked_at timestamptz,
  added_by_email   text default 'scraper@import',
  created_at       timestamptz default now()
);
create index if not exists creator_leads_created_idx on public.creator_leads (created_at desc);

alter table public.creator_leads enable row level security;
drop policy if exists creator_leads_team_all on public.creator_leads;
create policy creator_leads_team_all on public.creator_leads
  for all to authenticated using (true) with check (true);


-- ========================== scrape_jobs =============================
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

alter table public.scrape_jobs enable row level security;
drop policy if exists scrape_jobs_team_all on public.scrape_jobs;
create policy scrape_jobs_team_all on public.scrape_jobs
  for all to authenticated using (true) with check (true);


-- ========================== competitors =============================
-- Which brands the Ad Library importer auto-tracks.
--
-- Flow: scripts/import-ad-library.mjs resolves each brand's Meta page_id by
-- searching the Ad Library, then pulls every EU-reached ad per page daily
-- (ads-cron). The team adds/edits brands on /competitors (paste an Ad
-- Library link or a page id); ig_handle feeds
-- scripts/scrape-competitor-posts.mjs weekly.

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


-- ========================= kpi_snapshots ============================
-- One row per day of the numbers that matter, so the dashboard can draw
-- funnel + traffic + revenue trends the frontend can read directly.
--
-- Why a table: the analytics API is not reachable from the browser, so the
-- daily cron pulls the numbers and stamps one snapshot row here for the app
-- to read.
--
-- One row = one day. `metrics` is an open jsonb so new number sources slot
-- in WITHOUT a schema change - it holds `traffic`, `funnel` and `revenue`
-- keys. scripts/snapshot-kpis.mjs writes it (service key, merges keys so
-- different sources never clobber each other).

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


-- ============================ sales =================================
-- One row per Stripe payment, the live feed behind the dashboard revenue
-- counter + per-sale confetti. Filled by scripts/stripe-pull.mjs (cron,
-- service key); the browser only reads. Aggregates (MRR, lifetime gross)
-- live in kpi_snapshots.metrics.revenue.

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
drop policy if exists "sales readable by team" on public.sales;
create policy "sales readable by team"
  on public.sales for select
  to authenticated
  using (true);


-- ========================== seo_ranks ===============================
-- Daily SEO rank tracking. One row per (day, market, term, domain). We
-- record OUR domain and every tracked competitor domain from the SAME SERP,
-- because the useful number is relative position, not the absolute one.
--
-- position NULL means "not present in the top `scanned` results" - i.e.
-- worse than `scanned`, NOT "we have no data". A row that is missing
-- entirely is "never checked". Those two are deliberately different, same
-- reasoning as ads.geo_status 'none' vs 'unknown' above.
--
-- Written by scripts/seo-rank-pull.mjs (service key). The browser only reads.

create table if not exists public.seo_ranks (
  day          date        not null,
  market       text        not null,              -- 'ES' | 'FR' | 'US' (SERP country)
  lang         text,                              -- 'es' | 'fr' | 'en'
  term         text        not null,              -- the search query, verbatim
  domain       text        not null,              -- registrable host, e.g. 'example.com'
  is_ours      boolean     not null default false,
  position     int,                               -- 1-based; NULL = not in top `scanned`
  url          text,
  title        text,
  scanned      int         not null default 0,    -- how many organic results we looked at
  engine       text        not null default 'brave',
  checked_at   timestamptz not null default now(),
  constraint seo_ranks_pkey primary key (day, market, term, domain)
);

-- "chart this term in this country over time"
create index if not exists seo_ranks_term_market_day_idx
  on public.seo_ranks (term, market, day desc);
-- "what did the whole board look like on day X"
create index if not exists seo_ranks_day_idx
  on public.seo_ranks (day desc);
-- "just our own positions, latest first"
create index if not exists seo_ranks_ours_idx
  on public.seo_ranks (market, day desc) where is_ours;

alter table public.seo_ranks enable row level security;

drop policy if exists "seo_ranks readable by team" on public.seo_ranks;
create policy "seo_ranks readable by team"
  on public.seo_ranks for select
  to authenticated
  using (true);
-- No insert/update/delete policy on purpose: only the service key writes.

comment on table  public.seo_ranks is 'Daily Brave-Search organic position per term/market/domain - see the seo_ranks section of db-setup.sql';
comment on column public.seo_ranks.position is 'NULL = domain absent from the top `scanned` results, not "unknown"';
comment on column public.seo_ranks.scanned is 'organic results inspected; bounds how bad a NULL position can be';


-- ======================== trends_interest ===========================
-- Google Trends interest-over-time. One row per (term, geo, timeframe,
-- point_date). Interest-over-time is a SERIES, so point_date is the date of
-- the data point and fetched_at is when we pulled it. Re-pulling the same
-- window overwrites values on purpose - Google rescales and revises recent
-- points - which is why point_date is in the PK and the fetch day is not.
--
-- Written by scripts/trends-pull.mjs (service key). The browser only reads.

create table if not exists public.trends_interest (
  term         text        not null,
  geo          text        not null,              -- 'ES' | 'FR' | 'US' (Trends geo)
  timeframe    text        not null,              -- e.g. 'today 12-m'
  point_date   date        not null,              -- date of the data point
  value        int,                               -- 0..100 relative interest
  has_data     boolean     not null default true, -- false = Google had no data for this bucket
  is_partial   boolean     not null default false,-- Google flags the trailing point as partial
  scale_group  text        not null default '',   -- terms sharing this were pulled in ONE request
  source       text        not null default 'trends-unofficial',
  fetched_at   timestamptz not null default now(),
  constraint trends_interest_pkey primary key (term, geo, timeframe, point_date)
);

create index if not exists trends_interest_geo_point_idx
  on public.trends_interest (geo, point_date desc);
create index if not exists trends_interest_term_idx
  on public.trends_interest (term, geo, point_date desc);

alter table public.trends_interest enable row level security;

drop policy if exists "trends_interest readable by team" on public.trends_interest;
create policy "trends_interest readable by team"
  on public.trends_interest for select
  to authenticated
  using (true);

comment on table  public.trends_interest is 'Google Trends interest-over-time, unofficial endpoint - see the trends_interest section of db-setup.sql';
comment on column public.trends_interest.value is '0-100, RELATIVE to the peak of its scale_group. Comparable across terms ONLY within the same (geo, timeframe, scale_group).';
comment on column public.trends_interest.has_data is 'false = Google reported no data for the bucket (it renders as 0 but is not a measured 0)';
comment on column public.trends_interest.is_partial is 'true = Google marked the point incomplete; it will change on the next pull';
comment on column public.trends_interest.scale_group is 'terms fetched in one comparison request share a normalisation basis; cross-group value comparison is meaningless';


-- =========================== realtime ===============================
-- Broadcast row changes over the `supabase_realtime` publication so the
-- dashboard updates without a page refresh: live chat + reactions, live
-- goals, streaming creator leads + job status, per-sale confetti, and live
-- SEO/trends charts. Each add is guarded so re-running this file is safe.

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_reactions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.goals;
exception
  when duplicate_object then null;
end $$;

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

do $$
begin
  alter publication supabase_realtime add table public.sales;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.seo_ranks;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.trends_interest;
exception
  when duplicate_object then null;
end $$;
