# Swipefile - AI agent setup playbook

You are an AI coding agent (Claude Code, Cursor, Codex, anything that can read
this file) helping a human set up their own Swipefile: a self-hosted ad swipe
file + competitor intelligence dashboard. React 18 + Vite + Tailwind on the
front, Supabase (Postgres, Auth, Storage, Realtime) behind it, deploys as a
static site. There is no backend server.

Your job: **interview the human, wire up only what they actually have, leave
everything else dormant.** The app runs fine with nothing but Supabase; every
integration is optional and the UI degrades gracefully when one is missing.
Human-readable docs live in `README.md` and `docs/SETUP.md` - use them as the
source of truth for exact steps.

## Hard rules - never break these

1. NEVER commit `.env` or any key. `.env` is gitignored; keep it that way.
2. `SUPABASE_SERVICE_KEY` and every non-`VITE_` secret is for local scripts
   only. Never in frontend code, never in Vercel/Netlify env vars.
3. Only `VITE_`-prefixed vars may reach the browser or a deploy environment.
4. Supabase "Allow new users to sign up" must stay OFF for the user. RLS
   grants every authenticated user full library access, so an open signup is
   an open library. `VITE_ALLOW_SIGNUP=1` only hides/shows the form; it is
   not the security boundary.
5. Never add media to `public/memes/` yourself; only the user's own files,
   and never commit them (the folder gitignores media).
6. Don't invent keys, mock data, or fake integrations to "make it work". If
   the user doesn't have a service, skip it and say what they'd gain by
   adding it later.

## The interview

Ask in order; skip follow-ups when an answer closes a branch. One question at
a time, plain language - assume the human may be non-technical.

### 1. Brand
"What's your brand name, exactly as you'll type it when adding your own ads?"
-> Set both `VITE_OWN_BRAND` (app) and `OWN_BRAND` (scripts) in `.env`.
This is how the app splits "our ads" from competitor ads.

### 2. Supabase (the only required piece)
"Do you have a Supabase project yet?"
- If no: walk them through supabase.com -> New project (free tier is fine).
- Then, guiding them click-by-click (you cannot click for them):
  a. SQL Editor: run `supabase-setup-all.sql` (whole database in one paste).
     Piecewise alternative: `supabase-schema.sql` then every
     `supabase-migration-*.sql` in number order (2 through 17).
  b. Storage: create a private bucket named exactly `ad-media`, then run the
     three storage policies (the SQL is in README quick start step 2).
  c. Authentication: turn "Allow new users to sign up" OFF, add their user
     under Users with auto-confirm.
- Ask them to paste the Project URL + anon key (Project Settings -> API) and
  write them to `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Only if they will run any scripts: also ask for the service_role key ->
  `SUPABASE_SERVICE_KEY`, with the warning from hard rule 2.

### 3. Integrations - "Which of these do you actually use?"
All optional. For each yes, do the setup; for each no, move on.

- **Stripe** (revenue card): restricted read-only key -> `STRIPE_API_KEY`,
  then `node scripts/stripe-pull.mjs` to backfill sales.
- **Meta ads** (their own ads' real numbers): `META_ACCESS_TOKEN` +
  `META_AD_ACCOUNT_ID` -> `node scripts/import-meta-ads.mjs`. The token
  how-to is in that script's header comment. The CSV fallback is
  `scripts/import-ads-csv.mjs`.
- **PostHog** (site funnel card): `POSTHOG_API_KEY` + `POSTHOG_PROJECT_ID`
  (+ `POSTHOG_HOST` if not on eu.posthog.com). IMPORTANT: the funnel stage
  event names shipped in `src/components/FunnelCard.jsx` (STAGES) and
  `scripts/snapshot-kpis.mjs` are placeholders - ask what their real funnel
  events are called and rename BOTH files consistently.
- **Foreplay** (competitor swipe-file import): `FOREPLAY_API_KEY` ->
  `node scripts/import-foreplay.mjs`.
- **Brave Search** (creator finder for outreach): `BRAVE_API_KEY`, then ask
  for their niche and rewrite `DEFAULT_QUERIES` + `NICHE_RE` at the top of
  `scripts/scrape-creators.mjs` (the shipped queries are fitness examples).

### 4. Automation - "Do you have a machine that can run scheduled jobs?"
A server, NAS, always-on PC, anything with cron.

- **Yes**: adapt the `scripts/*-cron.sh` wrappers: fix the repo path, set
  `CLAUDE_BIN` if they use the Claude-CLI ones (`ads-cron.sh`,
  `watch-chat-cron.sh` need the Claude Code CLI installed there), then add
  crontab lines (examples in docs/SETUP.md part 5).
- **No**: offer two options.
  (a) Run the pull scripts manually whenever they want fresh numbers.
  (b) Create a GitHub Actions workflow that runs the node scripts on a
      schedule. If they want this, build it: repo secrets mirror the needed
      `.env` values, `schedule:` cron trigger, job = checkout + Node 18+ +
      `node scripts/<script>.mjs`. Remind them Actions minutes are free for
      public repos but their secrets live in GitHub - service key included,
      so they must be comfortable with that.

### 5. Deploy - "Want it online now?"
Vercel or Netlify: import their fork, add `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_OWN_BRAND`. Nothing else. Any static host
works: `npm run build` -> serve `dist/`. It's an installable PWA on phones.

### 6. Party mode - "Want a meme to play fullscreen when a sale lands?"
Desktop only, off by default, ships with zero clips. They provide their own
`.mp4` files -> `public/memes/`, you register them in the `MEMES` array in
`src/lib/celebration.js` (per-meme options are documented there). Remind them
about media rights; never commit the files.

## Verify before you call it done

- `npm install && npm run dev` -> http://localhost:3100 loads, login works.
- Add a test ad WITH an image: proves the `ad-media` bucket + policies.
- Each wired integration: run its script once, confirm the card/rows show up.
- `npm run build` exits clean.

## Repo map

```
src/pages/          screens (Dashboard, Library, HookBank, Competitors, ...)
src/components/      Layout, AdCard, RevenueCard, FunnelCard, StatCard, ...
src/lib/            supabase client, brand helpers (isOwnBrand), celebration
src/contexts/       Auth + Team providers
scripts/            optional local admin/import scripts (Node, service key)
supabase-*.sql      schema + numbered migrations (new changes = new number)
docs/SETUP.md       human-readable beginner-to-advanced guide
```

Conventions if you edit code: Tailwind utilities with the existing tokens
(`cream`, `ink`, `card`, `line`), comments explain why not what, database
changes ship as a new `supabase-migration-<next>.sql`, mobile layout is
first-class (test phone width).
