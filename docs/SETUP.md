# Swipefile setup guide

This walks you from zero to a running Swipefile instance, then through each optional feature. The core app needs only a Postgres database project and two environment variables. Everything else is opt-in.

## 1. Prerequisites

- **Node.js 18+** and **Git**
- A **Postgres database project** from the provider of your choice. Any host that gives you Postgres with auth, storage, row-level security, and realtime works. You need two things from its dashboard: the **project URL** and the **anon (public) key**.

## 2. Core setup

### Clone and install

```bash
git clone https://github.com/your-org/swipefile.git
cd swipefile
npm install
cp .env.example .env
```

### Configure the database connection

Open `.env` and set the two required values:

```bash
VITE_DB_URL=https://your-project.example.com
VITE_DB_ANON_KEY=your-anon-key
```

### Create the schema

Open your database provider's SQL editor, paste the contents of **`db-setup.sql`** from the repo root, and run it. That single file creates every table, policy, trigger, and index the app uses. It is idempotent, so you can re-run it any time (including after pulling updates that change the schema).

### Create the storage bucket

In your provider's storage section, create a bucket named **`ad-media`**. This is where uploaded ad images and videos live. Allow authenticated users to read and write to it.

### Create your first user

Use your provider's auth dashboard to add a user (email + password), or run:

```bash
node scripts/create-users.mjs
```

### Run it

```bash
npm run dev
```

Open the printed URL and log in with the user you created. You should see an empty library, ready for ads.

## 3. Deploying

The frontend is a static build:

```bash
npm run build   # outputs to dist/
```

Deploy `dist/` to Vercel or any static host. Set `VITE_DB_URL` and `VITE_DB_ANON_KEY` as environment variables in the host's dashboard. The app is a PWA, so users can install it to their home screen.

The automation scripts do not deploy with the frontend. Run them anywhere Node runs: your laptop, a VPS, a CI schedule, or WSL (see [RUN-ON-WSL.md](../RUN-ON-WSL.md)).

## 4. Script prerequisites

Most automation scripts write to the database with elevated rights and need:

```bash
DB_SERVICE_KEY=your-service-role-key
```

This key bypasses row-level security. Keep it on the machine that runs scripts, never in the frontend deploy, and never in git.

Also useful across scripts:

```bash
OWN_BRAND=YourBrand      # marks your own ads apart from competitors
APP_NAME=Swipefile       # display name used in briefs and the UI
```

## 5. Per-feature setup

Every feature below is optional. If its variables are missing, the feature stays off without breaking anything.

### Meta Ad Library (imports + competitor tracking)

1. Create an app at developers.facebook.com and generate a token with Ad Library API access.
2. Set `META_ACCESS_TOKEN` (and `META_ADLIB_TOKEN` if you keep a separate token for the Ad Library endpoints).
3. Discover and import ads by brand or page with `node scripts/import-meta-ads.mjs`, and refresh tracked competitors with `node scripts/scrape-competitor-posts.mjs`.

### Foreplay import

1. Get an API key from your Foreplay account settings.
2. Set `FOREPLAY_API_KEY`.
3. Run `node scripts/import-foreplay.mjs`. Ads that have run a long time get an auto winner verdict; short-lived ads get an auto loser verdict. Auto-verdicts never overwrite a verdict a human has set.

### CSV import

No keys needed: `node scripts/import-ads-csv.mjs path/to/file.csv`.

### Telegram (Radar, assistant, alerts, briefs)

1. Talk to @BotFather on Telegram, create a bot, and copy the token into `TG_BOT_TOKEN`.
2. Message your bot once, then get your chat id (for example via the bot API's `getUpdates`) and set `TG_CHAT_ID`.
3. Radar: `node scripts/startup-radar.mjs` builds the daily digest from Google News, Hacker News, and Reddit, plus X and Brave Search if configured. Edit the watchlist in the script's config to follow your own founders and topics.
4. Assistant: `node scripts/gm-listener.mjs` is a long-running listener. Text "gm" for the daily brief, or ask any question; Claude answers with Radar context, read-only.

### X (Radar source)

Set `X_BEARER_TOKEN` from the X developer portal. Radar reads are cached per day to stay inside free-tier limits.

### Brave Search (Radar enrichment)

Set `BRAVE_API_KEY` from the Brave Search API dashboard.

### SEO and trends

1. Set `SEO_OWN_DOMAIN=yourdomain.com`.
2. `node scripts/seo-rank-pull.mjs` records keyword ranks per market and domain over time; manage keywords with `scripts/seo-keywords.mjs`.
3. `node scripts/trends-pull.mjs` pulls Google Trends interest. `node scripts/sync-geo.mjs` syncs per-ad EU geo/reach data into the Intel view.

### Stripe (sales tracking + alerts)

1. Set `STRIPE_API_KEY` with a restricted read-only key.
2. Set `REVENUE_TZ` (for example `Europe/Berlin`) so daily revenue buckets match your day.
3. `node scripts/stripe-pull.mjs` syncs sales; `revenue-alert.mjs` and `failed-payment-alert.mjs` send Telegram pings.

### Product analytics (KPI dashboard)

Set `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID`, then run `node scripts/snapshot-kpis.mjs` on a schedule to feed the ops dashboard.

### Health monitor

Set the `HEALTH_*` variables in `.env.example` (endpoints to probe and alert thresholds), then cron `node scripts/health-monitor.mjs`.

### Creator outreach

`node scripts/scrape-creators.mjs` collects Instagram leads and `scrape-emails.mjs` enriches them with emails. Results land in the Outreach view.

### Sale celebrations

Drop your own short celebration clips into `public/memes/`. The folder is gitignored, so nothing ships with the repo and nothing you add gets committed. When a sale lands, the app plays a random clip.

## 6. Scheduling

The `.sh` wrappers in `scripts/` group related scripts for cron (`ads-cron.sh`, `seo-cron.sh`, `creators-cron.sh`, and friends). See [RUN-ON-WSL.md](../RUN-ON-WSL.md) for a full walkthrough of scheduling them, including on Windows via WSL.

## Troubleshooting

- **Blank page after login**: check `VITE_DB_URL` and `VITE_DB_ANON_KEY`, then confirm `db-setup.sql` ran without errors.
- **Media not loading**: confirm the `ad-media` bucket exists and authenticated users can read it.
- **A script exits immediately**: it is telling you which variable is missing; features without their vars are meant to no-op.
- **Realtime not updating (chat, goals)**: make sure realtime is enabled for the relevant tables in your provider's dashboard.
