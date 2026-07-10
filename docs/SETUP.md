# Swipefile setup guide

Everything from absolute zero to a fully wired dashboard. The
[README](../README.md) quick start covers the happy path; this guide assumes
nothing and also documents every optional integration.

- [Part 1: Beginner walkthrough](#part-1-beginner-walkthrough) - never used Node or Supabase
- [Part 2: Deploying it online](#part-2-deploying-it-online)
- [Part 3: Configuration reference](#part-3-configuration-reference) - every env var
- [Part 4: Optional integrations](#part-4-optional-integrations) - Stripe, Meta, PostHog, Foreplay, AI, party mode
- [Part 5: Scripts and automation](#part-5-scripts-and-automation)
- [Troubleshooting](#troubleshooting)

---

## Part 1: Beginner walkthrough

### 1.1 Install the tools (once)

1. **Node.js** - go to [nodejs.org](https://nodejs.org), download the LTS
   version, run the installer with defaults. Verify: open a terminal
   (Windows: PowerShell, Mac: Terminal) and type `node -v` - you should see
   `v18` or higher.
2. **Git** - [git-scm.com/downloads](https://git-scm.com/downloads), install
   with defaults. Verify with `git --version`.

### 1.2 Get the code

```bash
git clone https://github.com/gntrs/swipefile
cd swipefile
npm install
```

`npm install` downloads the app's dependencies; it takes a minute.

### 1.3 Create your free Supabase project

Supabase is the database + login + file storage. The free tier is plenty.

1. Go to [supabase.com](https://supabase.com), sign up, click **New project**.
2. Pick any name and a strong database password (you won't need the password
   again for this app). Wait ~2 minutes while it provisions.

### 1.4 Create the database tables

1. In your Supabase project, open **SQL Editor** (left sidebar).
2. **Easy way**: open `supabase-setup-all.sql` from this repo in any text
   editor, copy ALL of it, paste into the SQL editor, press **Run**. That's
   the entire database in one go - done, skip to 1.5.
3. **Piece-by-piece way** (only if you prefer): run `supabase-schema.sql`,
   then every `supabase-migration-*.sql` **in number order** (2, 3, ... 17).
   If one says "already exists", you probably ran it twice - safe to continue.

### 1.5 Create the media bucket

1. **Storage** (left sidebar) -> **New bucket** -> name it exactly `ad-media`
   -> keep it private -> Create.
2. Back in **SQL Editor**, run:
   ```sql
   create policy "team read ad-media"   on storage.objects for select to authenticated using (bucket_id = 'ad-media');
   create policy "team write ad-media"  on storage.objects for insert to authenticated with check (bucket_id = 'ad-media');
   create policy "team delete ad-media" on storage.objects for delete to authenticated using (bucket_id = 'ad-media');
   ```
   This lets logged-in teammates upload/see ad creatives, and nobody else.

### 1.6 Create your login

1. **Authentication** -> **Sign In / Up** (or Providers) -> make sure
   **"Allow new users to sign up" is OFF**. Your library stays private.
2. **Authentication** -> **Users** -> **Add user** -> enter your email and a
   password, tick **Auto Confirm User**, create.
3. Repeat for each teammate (or use the script in
   [Part 5](#part-5-scripts-and-automation) to batch-create accounts with
   temp passwords).

### 1.7 Connect the app

1. In Supabase: **Project Settings** -> **API**. You need two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / publishable key** (a long string - this one is safe to expose)
2. In the repo folder:
   ```bash
   cp .env.example .env     # Windows PowerShell: copy .env.example .env
   ```
3. Open `.env` in a text editor and fill in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_OWN_BRAND=Your Brand Name
   OWN_BRAND=Your Brand Name
   ```
   `VITE_OWN_BRAND` is how the app tells YOUR ads apart from competitors' -
   use the exact brand name you'll type when adding your own ads.

### 1.8 Run it

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100), log in with the user
from 1.6, and add your first ad with the **+** button. That's the whole setup.

---

## Part 2: Deploying it online

The app is a static site - after `npm run build` everything lives in `dist/`.
No server, no Docker.

### Vercel (easiest)

1. Push your fork to GitHub.
2. [vercel.com](https://vercel.com) -> **New Project** -> import the repo.
   Vercel auto-detects Vite; keep the defaults.
3. Under **Environment Variables** add `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, and `VITE_OWN_BRAND`.
4. Deploy. Add a custom domain later if you want.

Netlify works identically. Any static host works: `npm run build`, upload `dist/`.

**Never** add `SUPABASE_SERVICE_KEY` (or any non-`VITE_` secret) to your
hosting provider - those are for local scripts only.

### Install it like an app (PWA)

On your phone, open your deployed URL, then **Share -> Add to Home Screen**
(iOS Safari) or the install prompt (Android Chrome). You get a standalone
app with a bottom tab bar.

---

## Part 3: Configuration reference

All configuration lives in `.env` (copy of `.env.example`). Restart
`npm run dev` after changing it.

| Variable | Required | Used by | What it does |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | app | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | app | public client key (RLS protects data) |
| `VITE_OWN_BRAND` | recommended | app | your brand name; splits "ours" vs competitors |
| `OWN_BRAND` | recommended | scripts | same, for the import scripts |
| `VITE_ALLOW_SIGNUP` | no | app | `1` shows a self-signup form on the login page. Leave unset in production |
| `SUPABASE_SERVICE_KEY` | for scripts | scripts | service_role key; bypasses RLS. **Local only, never deploy** |
| `STRIPE_API_KEY` | no | `stripe-pull.mjs` | revenue card data |
| `META_ACCESS_TOKEN` | no | `import-meta-ads.mjs` | your ads' real metrics |
| `META_AD_ACCOUNT_ID` | no | `import-meta-ads.mjs` | which ad account to read |
| `META_ADLIB_TOKEN` | no | `import-ad-library.mjs` | Ad Library competitor pulls (falls back to `META_ACCESS_TOKEN`) |
| `POSTHOG_API_KEY` | no | `posthog-pull.mjs` | funnel + traffic snapshots |
| `POSTHOG_PROJECT_ID` | no | `posthog-pull.mjs` | which PostHog project |
| `POSTHOG_HOST` | no | `posthog-pull.mjs` | defaults to `https://eu.posthog.com` |
| `FOREPLAY_API_KEY` | no | `import-foreplay.mjs` | swipe-file import |
| `BRAVE_API_KEY` | no | `scrape-creators.mjs` | creator search |
| `CLAUDE_BIN` | no | cron wrappers | path to the Claude Code CLI (default: `claude` on PATH) |

---

## Part 4: Optional integrations

Each of these is fully optional; the app quietly hides or explains the
missing pieces until you wire them.

### Revenue card (Stripe)

Shows lifetime revenue, MRR, today's sales - with a confetti burst the moment
a new sale lands while the dashboard is open.

1. Get a **restricted** Stripe API key (read-only on Charges/Subscriptions).
2. Put it in `.env` as `STRIPE_API_KEY`, and make sure
   `supabase-migration-17.sql` was applied.
3. Backfill + refresh: `node scripts/stripe-pull.mjs`. Put it on a cron every
   ~5 minutes for the live effect (see Part 5).

### Your own ads' performance (Meta)

`node scripts/import-meta-ads.mjs` pulls spend / impressions / CTR / CPC /
ROAS per ad straight from the Meta Marketing API into the library, matched by
ad name, refreshed on every run. Token instructions are in the header comment
of that script. `import-ads-csv.mjs` is the manual fallback (upload an Ads
Manager CSV export).

### Competitor ads (Foreplay / Meta Ad Library)

- `node scripts/import-foreplay.mjs` - auto-fills the library from a
  [Foreplay](https://foreplay.co) swipe file + tracked brands.
- `node scripts/import-ad-library.mjs` - pulls competitor ads from Meta's
  public Ad Library.

Both are idempotent: re-running refreshes live/days-running and keeps human
verdicts untouched.

### Site funnel (PostHog)

`node scripts/posthog-pull.mjs` + `node scripts/snapshot-kpis.mjs` write a
daily snapshot that powers the funnel card. Edit the funnel stage event names
in `src/components/FunnelCard.jsx` to match your own events.

### AI analysis (Claude Code)

No API key needed. `node scripts/export.mjs` dumps the whole library to
`.claude-data/export.json`; open the repo in
[Claude Code](https://claude.com/claude-code) and ask things like *"what do my
winning ads have in common?"* - it reads the export and answers from your
data. `scripts/ads-cron.sh` is an example daily wrapper that pulls fresh data
and saves an AI brief automatically.

### Party mode (memes on sale)

Fullscreen video when a sale lands, desktop only, off by default. Drop `.mp4`
files in `public/memes/`, register them in `src/lib/celebration.js`, then
enable in **Profile -> Party mode** and hit **Test**. Details:
[public/memes/README.md](../public/memes/README.md). Only use media you have
rights to.

---

## Part 5: Scripts and automation

All scripts run locally with `node scripts/<name>.mjs` and read `.env`.
They need `SUPABASE_SERVICE_KEY` (Project Settings -> API -> service_role).

| Script | What it does |
| --- | --- |
| `create-users.mjs` | batch-create team accounts with printed temp passwords (edit the roster at the top) |
| `export.mjs` | dump everything to `.claude-data/export.json` for AI analysis |
| `stripe-pull.mjs` | sync sales from Stripe into the `sales` table |
| `import-meta-ads.mjs` | your ads' live metrics from the Meta API |
| `import-ads-csv.mjs` | same, from an Ads Manager CSV export |
| `import-foreplay.mjs` | competitor ads from a Foreplay swipe file |
| `import-ad-library.mjs` | competitor ads from Meta's public Ad Library |
| `posthog-pull.mjs` / `snapshot-kpis.mjs` | daily traffic + funnel snapshot |
| `scrape-creators.mjs` | find niche creators for outreach (edit the queries at the top!) |
| `scrape-competitor-posts.mjs` | competitors' organic posts (uses handles you fill in on /competitors) |
| `add-brief.mjs` / `add-goal.mjs` / `chat.mjs` | post briefs / goals / chat messages from the terminal |
| `make-icons.mjs` | regenerate PWA icons after changing the logo |

The `*.sh` files (`ads-cron.sh`, `watch-chat-cron.sh`, `creators-cron.sh`,
`weekly-scrape-cron.sh`) are example cron wrappers for Linux/WSL/macOS -
open them, adjust paths/models to taste, then e.g.:

```cron
*/5 * * * * cd /path/to/swipefile && node scripts/stripe-pull.mjs >> .claude-data/stripe-cron.log 2>&1
30 7 * * *  /path/to/swipefile/scripts/ads-cron.sh
```

---

## Troubleshooting

**"Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY" in the console** -
you didn't create `.env`, or didn't restart `npm run dev` after editing it.

**Login says invalid credentials** - the user wasn't created (1.6), or wasn't
auto-confirmed. Supabase -> Authentication -> Users -> check the user exists
and is confirmed.

**Ads save but images don't show** - the `ad-media` bucket is missing, named
differently, or the three storage policies from 1.5 weren't run.

**A page errors about a missing table/column** - a migration was skipped.
Re-run `supabase-migration-*.sql` in order; they're safe to re-run.

**Everything shows under "Rivals" including my own ads** - set
`VITE_OWN_BRAND` in `.env` (and on Vercel) to the exact brand name you use
when adding your own ads.

**Scripts exit with "Missing env"** - the script tells you exactly which
variable it needs; add it to `.env`. Script env (like
`SUPABASE_SERVICE_KEY`) stays local and is never added to Vercel.
