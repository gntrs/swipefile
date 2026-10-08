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
5. Create your account (the scripts need Node.js 22 or newer):

   ```bash
   node scripts/create-users.mjs --email you@example.com --password 'at least 8 characters' --role admin
   ```

6. `npm run dev` and sign in.

Something off? Open `/setup` in the app. The setup check reads your `.env`, reaches your project and tells you what is missing and how to fix it: a key in the wrong place, tables not created yet, sign ups still open, an old `db-setup.sql`.

The long version, with every optional feature, is [docs/SETUP.md](docs/SETUP.md).

## What is in it

- **Library.** Every ad you saved, with its image or video, verdict (winner, testing, loser, unsure), tags, notes, star, and a side by side compare. Filters live in the address bar, many ads change in one action, and a CSV comes in from the browser.
- **Hook bank.** The opening lines of the ads in your library in one list, filtered by winners, rivals, tags or angle.
- **Briefs.** Briefs you write, edit and delete in the app, or have AI write from ads you selected, linked back to their sources, with a copyable prompt block for your editor.
- **Capture.** A bookmarklet and a browser extension that save the ad you are looking at on the Meta Ad Library.
- **AI (optional).** Why an ad works, angle tags and briefs, through an edge function in your own Supabase project with your own Anthropic key.
- **Competitors.** Rival brands and how long their ads have run, fed by the Meta Ad Library importer (`scripts/import-ad-library.mjs`).
- **Intel.** Where rival ads run in the EU and how many people they reach, plus search ranks and Google Trends if you run those scripts.
- **Team and ops.** Team chat, goals, organic posts, creator outreach, availability, revenue and a site funnel. They are off by default (see Modules) and need their own scripts and keys.

Verdicts a person sets are never overwritten by an importer. Importers only move verdicts they set themselves.

## Library

The library pages 48 ads at a time and keeps its filters in the address bar, so a filtered view survives a reload and can be bookmarked or shared (`/ads?who=rivals&verdict=winner&sort=longest`). With the 0.3.0 `db-setup.sql` the database does the searching and counting; on an older database the same rules run in the browser, and past 2,000 ads the library says so.

Select many ads (the Select button, or X on the keyboard) to mark a verdict, star, add or remove a tag, compare, or delete them in one go. Delete asks for a second tap. Up to 500 ads at a time.

Keys on a laptop:

| key | library | ad page |
|---|---|---|
| `/` | search | |
| `N` | add an ad | |
| `J` `K` | next and previous ad | next and previous ad in the list you came from |
| `Enter` | open the ad | |
| `X` | select the ad | |
| `W` `L` | mark winner or loser | mark winner or loser |
| `S` | star or unstar | star or unstar |
| `#` | | delete the ad |
| `Esc` | clear the selection | back to the list |
| `?` | these keys | these keys |

Keys never fire while you type in a field.

Adding an ad starts with its Ad Library link or id: the link is kept, a copy you already saved is pointed out, and the image or video comes from you (Meta does not let apps download the ad). Drop several files at once and each becomes its own ad.

Import a CSV at `/ads/import`: the swipe file format (download the template there) or a Meta Ads Manager export of your own ads. You see a preview with new rows, ones already saved and problems by line number before anything is written. See [docs/SETUP.md](docs/SETUP.md#csv-import).

## Modules

Out of the box Swipefile is a tool for one person: the library, hooks, briefs, competitors and intel. `/` opens the dashboard, the numbers that matter at a glance, and the library is one click away. Team and ops features are there when you want them: set `VITE_MODULES` in `.env` and restart `npm run dev` (or rebuild).

| Module | On by default | What it adds |
|---|---|---|
| `library` | always | Ads, add an ad, CSV import, compare, the ad page, capture, the dashboard, profile |
| `hooks` | yes | Hook bank |
| `briefs` | yes | Briefs, and the latest brief on the dashboard |
| `competitors` | yes | Competitors, and busy rivals on the dashboard |
| `intel` | yes | Market intel |
| `team` | no | Team chat and goals, organic posts, outreach, availability, the welcome popup, the team list on your profile, who added each ad |
| `ops` | no | Revenue, ad performance, the site funnel, sale celebrations and party mode |

`VITE_MODULES=all` turns on everything. A comma list turns on exactly those modules plus `library`, so to add the team features to the default set write `VITE_MODULES=library,hooks,briefs,competitors,intel,team`. With `team` or `ops` on, `/` opens the dashboard instead of the library.

Turning a module off only hides it. Its pages send you to the library and its cards disappear, but its data stays in the database and comes back when you turn it on again.

## AI

AI is optional and runs in your own Supabase project, with your own Anthropic key, as the `ai` edge function. The key never reaches the browser.

What it does:

- **Why it works** on an ad page: the hook, angle, format, audience, why it could work, where it is weak, and remix ideas. For image ads it also looks at the image, through a link to your storage that expires after five minutes.
- **Tag angles** in the hook bank: labels each hook with its persuasion angle (pain point, curiosity, social proof, offer and so on). New ads are tagged in the background after you save them.
- **Brief from these** in the library and the hook bank: writes a brief from the ads or hooks you selected and opens it in Briefs, linked to its sources.

Turn it on (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):

```sh
supabase link --project-ref your-ref
supabase functions deploy ai
supabase secrets set ANTHROPIC_API_KEY=your-key
```

Optional secrets: `AI_MODEL` (default `claude-sonnet-5-5`) and `AI_BATCH_LIMIT` (hooks tagged per press, default 20, 1 to 50). Set `VITE_AI_AUTO=0` in `.env` to stop the background tagging after saves.

What it costs, in plain terms: one model call per analysis or brief, one call per batch of up to 20 hooks tagged, and at most 100 ads tagged in the background per page load. Nothing runs until you press a button or save an ad. Without the function or the key every AI button stays and tells you the exact command to run; `/setup` shows the AI state too.

`scripts/ads-cron.sh` and the Telegram scripts still call the Claude CLI on the machine that runs them, if you set that up.

## Capture

Save an ad from the Meta Ad Library in one click. On an ad, click the bookmarklet (or the `Save to swipefile` button the browser extension adds) and your swipefile opens in a new tab with the ad filled in: brand, text, headline, landing page, running dates and platforms. You check it and press Save. Nothing saves on its own, and an ad you already have shows `Already in your swipe file` with a button to update its running dates.

- **Bookmarklet**: drag it from Capture (`/capture/setup`) to your bookmarks bar.
- **Extension**: load the `extension/` folder unpacked in Chrome, Edge or Brave, then paste your swipefile's address in its options.
- **fetch-media** (optional edge function): copies the ad's image or video into your own storage when you save, because Meta's links expire. `supabase functions deploy fetch-media`.

Meta's terms do not allow automated collection from its sites. Capture only reads the ad you click, in your own browser, and sends it only to your swipefile. It never crawls and never sees your Facebook login.

`scripts/track-longevity.mjs` is the one exception, and it is off by default. It re-checks how long competitor ads run by loading their public Ad Library pages automatically, which Meta's terms restrict. It runs only when you opt in (`--i-accept-the-terms` or `LONGEVITY_OPT_IN=1`), and you run it at your own risk.

Install steps, privacy details and what to do when Meta changes the page: [docs/CAPTURE.md](docs/CAPTURE.md).

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
| `VITE_AI_AUTO` | on | `0` stops the background angle tagging after saves. See AI |

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
| `LONGEVITY_OPT_IN` | `track-longevity.mjs` | `1` opts in to loading Ad Library pages automatically. Unset, the script refuses to run |
| `CREATOR_QUERIES` | `scrape-creators.mjs` | Comma list of searches that find your creators. Without it the script prints a hint and stops |
| `CREATOR_NICHE_RE` | `scrape-creators.mjs` | Regex a profile must match to be kept. Unset keeps every profile |
| `BRAVE_API_KEY` | creator finder, radar | Brave Search |
| `FUNNEL_EVENTS` | `snapshot-kpis.mjs` | Comma list of funnel events, in order |
| `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` | KPI and health scripts | Product analytics |
| `STRIPE_API_KEY`, `REVENUE_TZ` | Stripe scripts | Sales and daily revenue |
| `TG_BOT_TOKEN`, `TG_CHAT_ID` | Telegram scripts | Digests, alerts, the chat listener |
| `SEO_OWN_DOMAIN`, `SEO_COMPETITOR_DOMAINS` | SEO scripts | Rank tracking |
| `HEALTH_*`, `MAILJET_*` | `health-monitor.mjs` | Endpoints to probe and where alerts go |

### Edge functions

These are secrets of your Supabase project, set with `supabase secrets set NAME=value`. They never go in `.env` and never carry a `VITE_` prefix.

| Secret | Used by | Default | What it does |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `ai` | none | Your Anthropic key. Without it the AI buttons show the command that sets it |
| `AI_MODEL` | `ai` | `claude-sonnet-5-5` | The model the function calls |
| `AI_BATCH_LIMIT` | `ai` | `20` | Hooks tagged per press, 1 to 50 |
| `FETCH_MEDIA_HOSTS` | `fetch-media` | `fbcdn.net,cdninstagram.com` | Hosts it may download creatives from, each with its subdomains |
| `FETCH_MEDIA_MAX_MB` | `fetch-media` | `50` | Largest file it copies, 1 to 50 |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided by Supabase. Neither function holds a service key: both act as the signed in user, so row level security applies.

`.env.example` lists every `.env` variable with a comment.

## Scripts

Everything in `scripts/` runs on its own with Node and is safe to schedule.

| Script | What it does |
|---|---|
| `create-users.mjs` | Creates accounts: one with `--email`, or many from a roster JSON file |
| `import-ad-library.mjs` | Pulls rival ads from the Meta Ad Library for the competitors you track |
| `import-meta-ads.mjs` | Pulls your own ads and their numbers from the Meta Marketing API |
| `import-ads-csv.mjs` | Imports your own ad numbers from a Meta Ads Manager CSV export, for files too big for `/ads/import`. `--parse-only` prints the rows without a database |
| `import-foreplay.mjs` | Imports a Foreplay swipe file |
| `discover-winners.mjs` | Searches the Ad Library by keyword and keeps long running ads |
| `rescore-verdicts.mjs` | Recomputes automatic verdicts, never a verdict a person set |
| `track-longevity.mjs` | Opt in, off by default. Re-checks on the Ad Library whether competitor ads still run, see docs/CAPTURE.md |
| `star-winners.mjs` | Stars the strongest ads |
| `scrape-competitor-posts.mjs` | Finds rivals' recent Instagram posts through Brave Search |
| `sync-geo.mjs` | Syncs EU country and reach data per ad |
| `seo-rank-pull.mjs`, `seo-keywords.mjs`, `trends-pull.mjs` | Search ranks and Google Trends |
| `scrape-creators.mjs` | Creator finder: searches public Instagram profiles through Brave Search |
| `scrape-emails.mjs` | Finds contact emails for those profiles |
| `stripe-pull.mjs`, `revenue-alert.mjs`, `failed-payment-alert.mjs` | Sales, revenue and failed payment alerts |
| `snapshot-kpis.mjs`, `posthog-pull.mjs` | Numbers for the ops cards |
| `health-monitor.mjs` | Probes your production endpoints and alerts on failures |
| `startup-radar.mjs`, `gm-listener.mjs`, `morning-brief.mjs` | Telegram digests and assistant |
| `add-brief.mjs`, `add-goal.mjs` | Add a brief (`--ads id1,id2` links its source ads) or a goal from the command line |

The `.sh` files bundle scripts for cron. [docs/SETUP.md](docs/SETUP.md#scheduling) has the cron lines.

## Security

- Row level security lets any signed in account read and change everything. That is fine for you and your team, and wrong for anyone else, so keep public sign ups off.
- `DB_SERVICE_KEY` skips every rule. It never gets a `VITE_` prefix and never goes to a static host. The setup check stops the app if it finds a secret key in `VITE_DB_ANON_KEY`.
- Media sits in a private bucket and is shown through links that expire after an hour.
- `ANTHROPIC_API_KEY` lives only in your Supabase project's secrets. The edge functions check the caller's sign in and read and write with the caller's token, never a service key.
- Capture never saves on its own: the capture page shows every field for you to check, keeps only `https:` links and treats everything in the address as plain text.

## Development

```bash
npm test            # unit tests (vitest)
npm run test:sql    # runs db-setup.sql twice plus the SQL tests on a local Postgres
npm run build
```

`npm run test:sql` needs a local Postgres and refuses any host that is not localhost. See the header of `scripts/test-sql.mjs`. CI runs all three on every pull request.

The edge functions' logic lives in plain JavaScript (`supabase/functions/*/handler.js`) that `npm test` covers. To type check the Deno entries, with [Deno](https://deno.com) installed:

```bash
deno check --no-lock --node-modules-dir=none supabase/functions/ai/index.ts supabase/functions/fetch-media/index.ts
```

Stack: React 18, Vite 5, Tailwind 3, Supabase (Postgres, auth, storage, realtime, edge functions). No custom server.

## License

[MIT](LICENSE)
