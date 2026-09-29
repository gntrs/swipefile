# Swipefile setup guide

From an empty folder to your own swipe file, then every optional feature. The app itself needs a Supabase project and two values in `.env`. Everything else is opt in and stays off until its variables are set.

## 1. What you need

- Node.js 20 or newer, npm and Git.
- A [Supabase](https://supabase.com) project. The free plan is enough to start. You need its project URL, its anon (or publishable) key and, for the scripts, its service role key. All three are under Project Settings, API.

## 2. Try the demo first

```bash
git clone https://github.com/gntrs/swipefile.git
cd swipefile
npm ci
npm run dev
```

With no `.env` the app starts in demo mode on sample ads. Nothing you change is saved: a reload resets it. Set `VITE_DEMO=1` to force demo mode even when your project is configured.

## 3. Connect your Supabase project

### Create the database

Open the SQL editor in Supabase, paste all of `db-setup.sql` from the repo root and run it. That one file creates:

- every table, index, trigger and function the app uses,
- the row level security rules,
- a private storage bucket called `ad-media` (50 MB per file, images and video only) with its access rules: members read everything in the bucket, upload only into their own folder, and delete only their own files,
- `swipefile_health()`, a small function the setup check calls to see which version of the file you ran.

Every statement is safe to run twice. When a new version of Swipefile ships, run the file again: that is the upgrade. It adds what is new and leaves your data alone. It also puts the bucket back to private if someone made it public.

You do not create the bucket by hand.

### Close public sign ups

In Supabase go to Authentication, Sign In / Providers, and turn off **Allow new users to sign up**. Any signed in account can read and change the whole swipe file, so the only accounts should be the ones you create. The setup check warns while sign ups are open.

### Fill in `.env`

```bash
cp .env.example .env
```

```bash
VITE_DB_URL=https://your-project.supabase.co
VITE_DB_ANON_KEY=your-anon-or-publishable-key
DB_SERVICE_KEY=your-service-role-key
```

`VITE_DB_ANON_KEY` must be the anon or publishable key. If you paste the service role or a secret key there, the app refuses to start and says so, because that key would ship to every visitor. `DB_SERVICE_KEY` never gets a `VITE_` prefix.

### Create your account

```bash
node scripts/create-users.mjs --email you@example.com --password 'at least 8 characters' --role admin
```

Leave out `--password` and the script makes a temporary one and prints it once. `--nickname Name` sets the display name. `--role` is `admin` or `member` (default `member`).

For a team, write a roster file and pass it instead:

```json
[
  { "email": "you@example.com", "password": "at least 8 characters", "nickname": "You", "role": "admin" },
  { "email": "teammate@example.com", "nickname": "Sam", "role": "member" }
]
```

```bash
node scripts/create-users.mjs users.json
node scripts/create-users.mjs users.json --reset-pass teammate@example.com
```

Keep the roster file out of git.

### Run it

```bash
npm run dev
```

Sign in with the account you created. An empty library shows two ways in: add your first ad, or import a CSV.

### Check it

Open `/setup`. Each line is green, a warning, or a blocker with the exact fix:

- the two `VITE_` values are present and the key is a public one,
- the project answers and accepts the key,
- public sign ups are off,
- the tables exist and `db-setup.sql` is current,
- the `ad-media` bucket exists and is private,
- who you are signed in as.

A blocker keeps every page on `/setup` until it is fixed. A warning shows a banner in the app that you can dismiss for the session.

## 4. CSV import

Your own ads' numbers come from a Meta Ads Manager export:

1. Meta Ads Manager, Reports, Export table data, `.csv`. Any breakdown works; rows with the same ad name are summed.
2. `OWN_BRAND` (or `VITE_OWN_BRAND`) in `.env` set to your brand name as it appears on your ads.
3. `node scripts/import-ads-csv.mjs path/to/export.csv` (add `--dry-run` to see what it would do).

Rows are matched by ad name, so importing a newer export updates the same ads instead of adding copies. Verdicts, tags, media and notes stay as they are; only the numbers change.

## 5. Deploying

The app is a static build:

```bash
npm run build   # writes dist/
```

Deploy `dist/` to any static host. On the host, set `VITE_DB_URL` and `VITE_DB_ANON_KEY` and nothing else. `vercel.json` already sends every path to `index.html`, so deep links work on Vercel; other hosts need the same single page rewrite.

The scripts do not deploy with the app. They run on whatever machine you schedule them on, with their own `.env`.

## 6. Script setup

Most scripts write with the service role key:

```bash
DB_SERVICE_KEY=your-service-role-key
OWN_BRAND=Your Brand   # falls back to VITE_OWN_BRAND
```

A script whose variables are missing says which ones and stops. Features without their variables are meant to stay off.

## 7. Optional features

### Modules

The app starts as a solo swipe file: library, hook bank, briefs, competitors and market intel. The team and ops features stay hidden until you turn them on with `VITE_MODULES` in `.env`, then restart `npm run dev` or rebuild.

| Module | On by default | What it adds |
|---|---|---|
| `library` | always | Ads, add an ad, compare, the ad page, `/overview`, profile |
| `hooks` | yes | Hook bank |
| `briefs` | yes | Briefs, and the latest brief on the overview |
| `competitors` | yes | Competitors, and rivals' proven plays on the overview |
| `intel` | yes | Market intel, and its card on the overview |
| `team` | no | Team chat and goals, organic posts, outreach, availability, the welcome popup, the team list on your profile, who added each ad |
| `ops` | no | Revenue, ad performance, the site funnel, sale celebrations and party mode |

- `VITE_MODULES=all` turns on every module.
- A comma list turns on exactly those modules, and `library` is always on. `VITE_MODULES=team,ops` gives you the team and ops features but hides hooks, briefs, competitors and intel; to keep them, list them too: `VITE_MODULES=library,hooks,briefs,competitors,intel,team,ops` (the same as `all`).
- Unknown names are ignored with a warning in the browser console.
- With `team` or `ops` on, `/` opens the dashboard; otherwise it opens the library and the dashboard lives at `/overview`.

Turning a module off hides it and nothing else: its data stays in the database.

### Meta Ad Library (rival ads and competitor tracking)

1. Create an app at developers.facebook.com, complete identity verification, and generate a token with Ad Library API access.
2. Set `META_ACCESS_TOKEN`, or `META_ADLIB_TOKEN` if you keep a separate token for the Ad Library.
3. Add competitors on `/competitors`, then run `node scripts/import-ad-library.mjs`. It pulls their ads and gives each one an automatic verdict from how long it has run. A verdict a person set is never changed.
4. `node scripts/discover-winners.mjs --terms="protein oats,overnight oats"` searches by keyword and keeps long running ads. Set `DISCOVER_TERMS` to skip the flag, and `DISCOVER_ANGLES` (`angle-ugc=ugc|creator;angle-offer=% off|discount`) to tag them.
5. `node scripts/sync-geo.mjs` fills in EU countries and reach for the Intel view.

Limits worth knowing: the API returns commercial ads only when they reached the EU or the UK, tokens expire about every 60 days, and you get reach, not spend.

### Your own ads from the Marketing API

Set `META_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID`, then `node scripts/import-meta-ads.mjs`. Same matching by ad name as the CSV import, which stays as the manual fallback.

### Foreplay

Set `FOREPLAY_API_KEY`, then `node scripts/import-foreplay.mjs`. Long running ads get an automatic winner verdict and short ones an automatic loser. A verdict a person set is never changed.

### Creator finder

1. Set `BRAVE_API_KEY` (Brave Search API, free plan). The results land in Outreach, which is part of the `team` module.
2. Set `CREATOR_QUERIES` to searches that find the creators you want, for example `vegan recipes creator instagram,home workout coach instagram`.
3. Optional: `CREATOR_NICHE_RE`, a regex a profile must match to be kept.
4. `node scripts/scrape-creators.mjs` searches public Instagram profiles through Brave Search and fills the Outreach view. `scrape-emails.mjs` looks for their public contact emails.

### Telegram

1. Create a bot with @BotFather and put its token in `TG_BOT_TOKEN`.
2. Message the bot once, read your chat id from the bot API's `getUpdates`, and set `TG_CHAT_ID`.
3. `startup-radar.mjs` sends a daily news digest (`RADAR_TOPICS`, `RADAR_WATCHLIST`, `RADAR_SUBREDDITS`). `gm-listener.mjs` is a long running listener that answers questions. `morning-brief.mjs` sends a morning summary. The digest and listener call the Claude CLI on the machine that runs them.

### SEO and trends

Set `SEO_OWN_DOMAIN` (and `SEO_COMPETITOR_DOMAINS`), then `seo-rank-pull.mjs` for ranks, `seo-keywords.mjs` to manage keywords, and `trends-pull.mjs` for Google Trends.

### Stripe

Set `STRIPE_API_KEY` (a restricted read only key) and `REVENUE_TZ`. `stripe-pull.mjs` syncs sales; `revenue-alert.mjs` and `failed-payment-alert.mjs` send Telegram pings. The revenue card on the overview is part of the `ops` module.

### Product analytics and the site funnel

Set `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` and `POSTHOG_HOST`, then schedule `snapshot-kpis.mjs`. `FUNNEL_EVENTS` lists your funnel events in order (default `landing_cta_clicked,signup_started,signup_completed,user_registered,payment_initiated,payment_completed`); `VITE_FUNNEL_STAGES` gives the app the same stages with labels (`landing_cta_clicked:Landing CTA,...`). The funnel card is part of the `ops` module.

### Health monitor

Set the `HEALTH_*` and `MAILJET_*` values from `.env.example`, then schedule `health-monitor.mjs`.

### Sale celebrations

Turn on the `ops` module, drop your own short clips into `public/memes/` and list them in `src/lib/celebration.js`. The folder is gitignored, so nothing you add gets committed.

## 8. Scheduling

The `.sh` files in `scripts/` wrap related scripts for cron. Each one takes a lock, so a slow run is skipped rather than stacked. Run `crontab -e` on the machine that holds the repo and its `.env`, and add the lines you need (paths assume the repo lives at `~/swipefile`):

```cron
# Daily ads pass: fresh numbers, then a Claude CLI review that writes a brief when something changed
30 7 * * *   $HOME/swipefile/scripts/ads-cron.sh

# Search ranks and Google Trends, after the ads pass
20 7 * * *   $HOME/swipefile/scripts/seo-cron.sh >> /tmp/seo-cron.log 2>&1

# Stripe sales, every 5 minutes
*/5 * * * *  cd $HOME/swipefile && node scripts/stripe-pull.mjs >> /tmp/stripe-pull.log 2>&1

# Creator finder jobs queued from the Outreach page
*/2 * * * *  $HOME/swipefile/scripts/creators-cron.sh

# Weekly creator and competitor post sweep, Monday mornings
0 7 * * 1    $HOME/swipefile/scripts/weekly-scrape-cron.sh
```

`ads-cron.sh` and `watch-chat-cron.sh` need the Claude CLI installed and signed in on that machine. The others need only Node.

On Windows, the same lines run inside WSL: clone the repo inside the WSL filesystem, put `.env` there, and use the WSL crontab. Cron in WSL only runs while WSL is running.

## 9. Troubleshooting

Start at `/setup`. It covers most first run problems and gives the fix in words.

- **Every page goes to `/setup`.** A blocker: a missing or wrong value in `.env`, the project not reachable, or no tables yet. Fix what it names, restart `npm run dev`, reload.
- **Uploads fail with "Storage bucket ad-media is missing".** Run `db-setup.sql` again. It creates the bucket and its rules.
- **Uploads fail with "Upload refused by storage policy".** Same fix: run `db-setup.sql` again.
- **A script exits right away.** It prints which variable it needs. Scripts without their variables are meant to stop.
- **Chat and goals do not update live.** `db-setup.sql` adds the tables to Supabase realtime; run it again if you created the project before those tables existed.
- **A list says "Showing N items. The rest failed to load".** The database stopped answering part way through. Press Retry; if it keeps happening, check the project in Supabase.
