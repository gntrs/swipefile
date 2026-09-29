# CLAUDE.md

Guidance for coding agents working in this repository (Swipefile, an open-source ad swipe file).

## What this is

A static React app on a Supabase project (Postgres, auth, storage, row level security, realtime), plus standalone Node scripts. There is no custom server. The product talks to Claude through the Claude CLI in some scripts (`scripts/ads-cron.sh`, the Telegram scripts).

## Project structure

```
src/
  pages/        Route level views (Library, Compare, Intel, Competitors, Setup, ...)
  components/   Shared UI (AdCard, TeamChat, Goals, DemoBanner, SetupBanner, ...)
  lib/          db.js (client and demo switch), dbConfig.js, ads.js (verdict rules),
                saveAd.js (uploads), demo/ (in memory demo client and sample data),
                setup/ (the setup check)
scripts/        Standalone Node automation (.mjs) and cron wrappers (.sh)
test/           vitest unit tests; test/sql/ holds the SQL tests and the Supabase shim
docs/           Setup guide
db-setup.sql    The entire database schema, one idempotent file
public/         Static assets, manifest, memes/ (gitignored user clips)
.env.example    Every supported variable with comments
```

## Running

```bash
npm ci
npm run dev            # no .env: demo mode on sample ads, nothing saved
npm run build          # production build to dist/
```

For a real project: run `db-setup.sql` in the Supabase SQL editor (it also creates the private `ad-media` bucket and its storage rules; there is no manual bucket step), set `VITE_DB_URL` and `VITE_DB_ANON_KEY` in `.env`, create an account with `node scripts/create-users.mjs --email ... --password ... --role admin`. `/setup` shows what is still missing.

## Demo mode

With neither `VITE_DB_URL` nor `VITE_DB_ANON_KEY` set (or `VITE_DEMO=1`), `src/lib/db.js` exports an in memory client (`src/lib/demo/`) that answers the same supabase-js calls the app makes. A reload resets it. A half filled or wrong `.env` is "misconfigured": the app stays on `/setup`. When you add a query shape the demo client does not support, it returns a `DEMO_UNSUPPORTED` error and warns once; extend `src/lib/demo/query.js` and its test.

## Testing

```bash
npm test            # vitest, everything in test/*.test.js
npm run test:sql    # local Postgres only: shim, db-setup.sql twice, test/sql/*.test.sql
npm run build
```

`npm run test:sql` reads `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and refuses any host that is not localhost. CI runs all three on pull requests. New behaviour gets a test; a schema change gets a SQL test.

## Conventions

- **Env vars**: anything the browser needs is prefixed `VITE_`. Service keys and API tokens are script only and never imported by frontend code or set on a static host.
- **Never commit `.env`** or any secret. `DB_SERVICE_KEY` bypasses row level security.
- **Styling**: Tailwind only, using the tokens in `tailwind.config.js`. Dark only. Fonts are Inter and Geist Mono.
- **Mobile first**: every view works from 320 px wide and every control is at least 44 by 44 px. `scripts/responsive-probe.js` measures it; its header says how to run it.
- **Schema changes** go into `db-setup.sql` and keep it idempotent (`if not exists`, `create or replace`, `drop policy if exists` then `create policy`, guarded `alter`s, `on conflict`), so anyone can re-run the whole file.
- **Verdicts**: a person's verdict is written only through `humanVerdictPatch` in `src/lib/ads.js`. Importers use `nextImportVerdict`, scoring scripts use `isAutoVerdict`. Nothing overwrites a human verdict.
- **Uploads** go through `src/lib/saveAd.js` (validation, unique paths, friendly storage errors).
- **Scripts** are self contained `.mjs` files that read `.env`. A missing optional variable makes the feature stop with a hint, not crash.
- **Dashes**: no em dash or en dash characters anywhere (code, comments, docs, UI text). Use a comma, colon or full stop. `test/no-dashes.test.js` fails on them.
