# Swipefile

An open-source ad swipe file. Save ads from the Meta Ad Library, call winners and losers, mine hooks and turn them into briefs. Runs on your own Supabase project, so your data stays yours.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](CONTRIBUTING.md)

## Try it in two minutes

```bash
git clone https://github.com/gntrs/swipefile.git
cd swipefile
npm ci
npm run dev
```

Open the URL it prints. With no `.env` the app runs in demo mode: a library of made up sample ads, every screen clickable, nothing saved. A reload puts the samples back.

## Keep your swipe file

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL editor, paste all of `db-setup.sql` and run it. It creates the tables, the row level security rules and a private `ad-media` storage bucket for your images and videos. It is safe to run again, and running it again is how you upgrade.
3. In Supabase go to Authentication, Sign In / Providers, and turn off **Allow new users to sign up**. Any signed in account can read and change the whole swipe file, so only the accounts you create should exist.
4. Copy `.env.example` to `.env` and set `VITE_DB_URL` and `VITE_DB_ANON_KEY` (Project Settings, API). Add `DB_SERVICE_KEY` (the service role key) for the scripts.
5. Create your account:

   ```bash
   node scripts/create-users.mjs --email you@example.com --password 'at least 8 characters' --role admin
   ```

6. `npm run dev` and sign in.

Something off? Open `/setup` in the app. The setup check reads your `.env`, reaches your project and tells you what is missing and how to fix it: a key in the wrong place, tables not created yet, sign ups still open, an old `db-setup.sql`.

The long version, with every optional feature, is [docs/SETUP.md](docs/SETUP.md).

## What is in it

- **Library.** Every ad you saved, with its image or video, verdict (winner, testing, loser, unsure), tags, notes, star, and a side by side compare.
- **Hook bank.** The opening lines of the ads in your library in one list, filtered by winners, rivals or tags.
- **Briefs.** Briefs written from your ads, with a copyable prompt block for your editor.
- **Competitors.** Rival brands and how long their ads have run, fed by the Meta Ad Library importer (`scripts/import-ad-library.mjs`).
- **Intel.** Where rival ads run in the EU and how many people they reach, plus search ranks and Google Trends if you run those scripts.
- **Team and ops.** Team chat, goals, organic posts, creator outreach, availability, revenue and a site funnel. They are off by default (see Modules) and need their own scripts and keys.

Verdicts a person sets are never overwritten by an importer. Importers only move verdicts they set themselves.

## Modules

Out of the box Swipefile is a tool for one person: the library, hooks, briefs, competitors and intel. `/` opens the library and `/overview` shows the numbers. Team and ops features are there when you want them: set `VITE_MODULES` in `.env` and restart `npm run dev` (or rebuild).

| Module | On by default | What it adds |
|---|---|---|
| `library` | always | Ads, add an ad, compare, the ad page, `/overview`, profile |
| `hooks` | yes | Hook bank |
| `briefs` | yes | Briefs, and the latest brief on the overview |
| `competitors` | yes | Competitors, and rivals' proven plays on the overview |
| `intel` | yes | Market intel, and its card on the overview |
| `team` | no | Team chat and goals, organic posts, outreach, availability, the welcome popup, the team list on your profile, who added each ad |
| `ops` | no | Revenue, ad performance, the site funnel, sale celebrations and party mode |

`VITE_MODULES=all` turns on everything. A comma list turns on exactly those modules plus `library`, so to add the team features to the default set write `VITE_MODULES=library,hooks,briefs,competitors,intel,team`. With `team` or `ops` on, `/` opens the dashboard instead of the library.

Turning a module off only hides it. Its pages send you to the library and its cards disappear, but its data stays in the database and comes back when you turn it on again.

## AI

Today the AI parts run outside the app: `scripts/ads-cron.sh` and a few Telegram scripts call the Claude CLI on the machine that runs them, if you set that up. They read your data and write briefs back. In-app AI arrives with a Supabase edge function in a later release.

## Meta Ad Library reality

- The API returns commercial ads only for ads that reached the EU or the UK. Elsewhere you only get political and issue ads.
- Getting a token needs a Meta developer app and identity verification.
- Tokens expire about every 60 days. Importers stop pulling until you paste a new one.
- You get reach, not spend. Spend is only known for your own ads (Meta Ads Manager export or the Marketing API).

## Configuration

Everything lives in `.env`. Only `VITE_` variables reach the browser, so nothing secret may ever carry that prefix.

### Browser

| Variable | Default | What it does |
|---|---|---|
| `VITE_DB_URL` | none | Supabase project URL. `VITE_SUPABASE_URL` also works |
| `VITE_DB_ANON_KEY` | none | Anon or publishable key. `VITE_SUPABASE_ANON_KEY` also works |
| `VITE_DEMO` | unset | `1` forces demo mode even when the two above are set |
| `VITE_ALLOW_SIGNUP` | unset | `1` shows sign up on the login page. The setup check warns while it is on |
| `VITE_OWN_BRAND` | unset | Your brand name as it appears on your ads, so your ads are told apart from rivals' |
| `VITE_APP_NAME` | `Swipefile` | The name shown as the wordmark |
| `VITE_FOCUS_COUNTRIES` | empty | Comma list of ISO codes (`ES,FR`) pinned first in country pickers and Intel |
| `VITE_FUNNEL_STAGES` | six stages from landing to paid | `event:Label` pairs for the site funnel card |
| `VITE_MODULES` | `library,hooks,briefs,competitors,intel` | Which parts of the app are on. `all` for everything, see Modules |

With neither `VITE_DB_URL` nor `VITE_DB_ANON_KEY` set, the app runs in demo mode.

### Scripts

| Variable | Used by | What it does |
|---|---|---|
| `DB_SERVICE_KEY` | every script that writes | Service role key. Skips row level security, stays on the machine that runs scripts |
| `OWN_BRAND` | importers | Your brand name. Falls back to `VITE_OWN_BRAND` |
| `META_ACCESS_TOKEN`, `META_ADLIB_TOKEN`, `META_AD_ACCOUNT_ID` | Meta importers | Ad Library and Marketing API access |
| `FOREPLAY_API_KEY` | `import-foreplay.mjs` | Foreplay import |
| `DISCOVER_TERMS` | `discover-winners.mjs` | Comma list of search terms. Or pass `--terms` |
| `DISCOVER_ANGLES` | `discover-winners.mjs` | `tag=regex;tag=regex`, tags imported ads by angle |
| `CREATOR_QUERIES` | `scrape-creators.mjs` | Comma list of searches that find your creators. Without it the script prints a hint and stops |
| `CREATOR_NICHE_RE` | `scrape-creators.mjs` | Regex a profile must match to be kept. Unset keeps every profile |
| `BRAVE_API_KEY` | creator finder, radar | Brave Search |
| `FUNNEL_EVENTS` | `snapshot-kpis.mjs` | Comma list of funnel events, in order |
| `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` | KPI and health scripts | Product analytics |
| `STRIPE_API_KEY`, `REVENUE_TZ` | Stripe scripts | Sales and daily revenue |
| `TG_BOT_TOKEN`, `TG_CHAT_ID` | Telegram scripts | Digests, alerts, the chat listener |
| `SEO_OWN_DOMAIN`, `SEO_COMPETITOR_DOMAINS` | SEO scripts | Rank tracking |
| `HEALTH_*`, `MAILJET_*` | `health-monitor.mjs` | Endpoints to probe and where alerts go |

`.env.example` lists every variable with a comment.

## Scripts

Everything in `scripts/` runs on its own with Node and is safe to schedule.

| Script | What it does |
|---|---|
| `create-users.mjs` | Creates accounts: one with `--email`, or many from a roster JSON file |
| `import-ad-library.mjs` | Pulls rival ads from the Meta Ad Library for the competitors you track |
| `import-meta-ads.mjs` | Pulls your own ads and their numbers from the Meta Marketing API |
| `import-ads-csv.mjs` | Imports your own ad numbers from a Meta Ads Manager CSV export |
| `import-foreplay.mjs` | Imports a Foreplay swipe file |
| `discover-winners.mjs` | Searches the Ad Library by keyword and keeps long running ads |
| `rescore-verdicts.mjs` | Recomputes automatic verdicts, never a verdict a person set |
| `star-winners.mjs` | Stars the strongest ads |
| `scrape-competitor-posts.mjs` | Finds rivals' recent Instagram posts through Brave Search |
| `sync-geo.mjs` | Syncs EU country and reach data per ad |
| `seo-rank-pull.mjs`, `seo-keywords.mjs`, `trends-pull.mjs` | Search ranks and Google Trends |
| `scrape-creators.mjs` | Creator finder: searches public Instagram profiles through Brave Search |
| `scrape-emails.mjs` | Finds contact emails for those profiles |
| `stripe-pull.mjs`, `revenue-alert.mjs`, `failed-payment-alert.mjs` | Sales, revenue and failed payment alerts |
| `snapshot-kpis.mjs`, `posthog-pull.mjs` | Numbers for the overview |
| `health-monitor.mjs` | Probes your production endpoints and alerts on failures |
| `startup-radar.mjs`, `gm-listener.mjs`, `morning-brief.mjs` | Telegram digests and assistant |
| `add-brief.mjs`, `add-goal.mjs` | Add a brief or a goal from the command line |

The `.sh` files bundle scripts for cron. [docs/SETUP.md](docs/SETUP.md#scheduling) has the cron lines.

## Security

- Row level security lets any signed in account read and change everything. That is fine for you and your team, and wrong for anyone else, so keep public sign ups off.
- `DB_SERVICE_KEY` skips every rule. It never gets a `VITE_` prefix and never goes to a static host. The setup check stops the app if it finds a secret key in `VITE_DB_ANON_KEY`.
- Media sits in a private bucket and is shown through links that expire after an hour.

## Development

```bash
npm test            # unit tests (vitest)
npm run test:sql    # runs db-setup.sql twice plus the SQL tests on a local Postgres
npm run build
```

`npm run test:sql` needs a local Postgres and refuses any host that is not localhost. See the header of `scripts/test-sql.mjs`. CI runs all three on every pull request.

Stack: React 18, Vite 5, Tailwind 3, Supabase (Postgres, auth, storage, realtime). No custom server.

## License

[MIT](LICENSE)
