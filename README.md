# Swipefile

**An open-source ad intelligence dashboard and lightweight CRM with a Claude AI analysis layer.**

Swipefile is where your team collects winning ads, tracks competitors, and turns raw creative into briefs. Save ads from the Meta Ad Library or your swipe file, mark winners and losers, mine hooks, watch keyword ranks and trends, and let AI tell you why something works. It runs as a static React app on top of a Postgres database, so you own all of your data.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](CONTRIBUTING.md)

## Features

### Library

- **Ad library** with media storage, tags, winner/loser verdicts, and a side-by-side compare view
- **Hook bank** that collects the opening lines of your best creative in one place
- **Star winners**: top-performing ads get auto-promoted to a star tier
- **Spotlight**: swipe through just-imported ad batches and verdict them fast

### Intelligence

- **Meta Ad Library importers**: discover and pull ads by brand or page
- **Third-party imports** (Foreplay and similar) with auto-verdicts inferred from ad longevity (human verdicts are never overwritten)
- **CSV bulk import** for everything else
- **Competitor tracking** via the Meta Ad Library
- **SEO and trends intel**: keyword rank tracking per market and domain over time, Google Trends interest, and per-ad EU geo/reach data in the Intel view
- **PostHog analytics**: product and website activity pulled into KPI snapshots and AI briefs

### Team and Ops

- **Team chat** with mentions and reactions, plus realtime shared goals
- **Availability board** so everyone knows who is on
- **Creator outreach** with Instagram lead scraping and email enrichment
- **Ops dashboard**: KPI snapshots, Stripe sales tracking with revenue and failed-payment alerts, a production health monitor, and a morning brief
- **Sale celebrations**: drop your own celebration clips into `public/memes/` (they are gitignored) and the app plays one on every sale

## Quick start

```bash
git clone https://github.com/your-org/swipefile.git
cd swipefile
npm install
cp .env.example .env
```

1. Create a Postgres database project with the provider of your choice (any host with auth, storage, row-level security, and realtime works).
2. Open your database's SQL editor and run **`db-setup.sql`** from the repo root. That single file is the entire schema and it is idempotent.
3. Create a storage bucket named **`ad-media`**.
4. Put your project URL and anon key in `.env` (see [Configuration](#configuration)).
5. Run the app:

```bash
npm run dev
```

For the full walkthrough, including per-feature setup, see [docs/SETUP.md](docs/SETUP.md).

## Configuration

All configuration lives in `.env`. Client-side variables are prefixed `VITE_`; everything else is read only by the Node scripts and never reaches the browser.

### Core (required)

| Variable | Description |
|---|---|
| `VITE_DB_URL` | Postgres database project URL |
| `VITE_DB_ANON_KEY` | Public anon key for the same project |

### Per-feature (optional)

| Variable | Needed for |
|---|---|
| `DB_SERVICE_KEY` | Automation scripts (server-side only, never in a frontend deploy) |
| `META_ACCESS_TOKEN` / `META_ADLIB_TOKEN` | Meta Ad Library import and competitor tracking |
| `FOREPLAY_API_KEY` | Foreplay swipe-file import |
| `TG_BOT_TOKEN` / `TG_CHAT_ID` | Radar digests, Telegram assistant, alerts, morning brief |
| `X_BEARER_TOKEN` | Radar's X posts (reads are day-cached) |
| `BRAVE_API_KEY` | Optional Brave Search enrichment for Radar |
| `POSTHOG_API_KEY` / `POSTHOG_PROJECT_ID` | KPI dashboard product analytics |
| `SEO_OWN_DOMAIN` | Keyword rank tracking for your own domain |
| `OWN_BRAND` | Marks your own ads apart from competitors |
| `APP_NAME` | Display name used in the UI and briefs |
| `REVENUE_TZ` | Timezone for daily revenue buckets (e.g. `Europe/Berlin`) |
| `HEALTH_*` | Endpoints and thresholds for the health monitor |

Features stay silently off until their variables are set. The frontend needs only the two `VITE_DB_*` values.

## Automation scripts

Everything in `scripts/` runs standalone with Node and is safe to cron. One line each:

| Script | What it does |
|---|---|
| `import-meta-ads.mjs` / `import-ad-library.mjs` | Pull ads from the Meta Ad Library by brand or page |
| `import-foreplay.mjs` | Import your Foreplay swipe file with longevity auto-verdicts |
| `import-ads-csv.mjs` | Bulk import ads from CSV |
| `star-winners.mjs` | Promote top performers to the star tier |
| `rescore-verdicts.mjs` | Refresh auto-verdicts without touching human ones |
| `scrape-competitor-posts.mjs` | Refresh tracked competitors' ads |
| `seo-rank-pull.mjs` / `seo-keywords.mjs` | Record keyword ranks per market and domain |
| `trends-pull.mjs` | Pull Google Trends interest |
| `sync-geo.mjs` | Sync per-ad EU geo and reach data |
| `startup-radar.mjs` | Build and send the daily Radar digest to Telegram |
| `gm-listener.mjs` | Long-running Telegram assistant ("gm" brief + Q&A) |
| `morning-brief.mjs` | Morning summary to Telegram |
| `stripe-pull.mjs` | Sync Stripe sales |
| `revenue-alert.mjs` / `failed-payment-alert.mjs` | Revenue and failed-payment pings |
| `snapshot-kpis.mjs` / `posthog-pull.mjs` | Feed the KPI dashboard |
| `health-monitor.mjs` | Probe prod endpoints and alert on failures |
| `scrape-creators.mjs` / `scrape-emails.mjs` | Instagram lead scraping and email enrichment |

The `.sh` wrappers bundle related scripts for cron. See [RUN-ON-WSL.md](RUN-ON-WSL.md) for scheduling them (including on Windows via WSL).

## Stack and architecture

- **Frontend**: React + Vite + Tailwind. PWA-enabled, dark-mode-first (Inter + Geist Mono, monochrome base with coral/mint/amber accents).
- **Backend**: a Postgres database providing auth, storage, row-level security, and realtime. The entire schema lives in `db-setup.sql`.
- **Automation**: standalone Node scripts in `scripts/`, independent of the frontend.

Deploy the frontend to Vercel or any static host. Run the scripts anywhere Node runs.

## License

[MIT](LICENSE)
