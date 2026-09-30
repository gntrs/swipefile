# CLAUDE.md

Guidance for coding agents working in this repository (Swipefile, an open-source ad swipe file).

## What this is

A static React app on a Supabase project (Postgres, auth, storage, row level security, realtime, edge functions), plus standalone Node scripts. There is no custom server. The product talks to Claude through the optional `ai` edge function (with the user's own Anthropic key) and through the Claude CLI in some scripts (`scripts/ads-cron.sh`, the Telegram scripts).

## Project structure

```
src/
  pages/        Route level views (Library, Compare, Intel, Competitors, Setup, ...)
  components/   Shared UI (AdCard, TeamChat, Goals, DemoBanner, SetupBanner, ...)
  features/
    save/       Library bulk bar, keys, link paste, file drop, CSV import page
    ai/         AI UI: WhyItWorks, BriefFromSelection, ClassifyHooksButton,
                AiBackground, AiSetupRow
    capture/    /capture and /capture/setup, the bookmarklet builder
  lib/          db.js (client and demo switch), dbConfig.js, ads.js (verdict rules),
                saveAd.js (uploads), modules.js and nav.js (modules, navigation),
                ai.js (client for the ai edge function), angles.js,
                library/ (URL filters, server search with a JS twin, bulk actions,
                keys), csv/ (CSV parsing and the import plan),
                demo/ (in memory demo client and sample data), setup/ (the setup check)
scripts/        Standalone Node automation (.mjs) and cron wrappers (.sh)
extension/      Capture: Chrome extension (MV3, no build) and the bookmarklet source.
                parse.js reads Ad Library cards; the bookmarklet and
                scripts/track-longevity.mjs share it. Test it on fixtures, never on Meta.
supabase/functions/  Edge functions: _shared/, ai/, fetch-media/ (handler.js is plain
                JS that vitest runs, index.ts is the Deno entry)
test/           vitest unit tests (library/, csv/, ai/, capture/ and top level);
                test/sql/ holds the SQL tests and the Supabase shim; test/fixtures/
                holds made up CSV and Ad Library pages
docs/           Setup guide (SETUP.md) and capture guide (CAPTURE.md)
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

Folders: `npx vitest run test/library test/csv` (library and import), `test/ai` (AI client, handler, model call), `test/capture` (parser, capture page helpers, fetch-media, longevity). Type check the Deno entries with `deno check --no-lock --node-modules-dir=none supabase/functions/ai/index.ts supabase/functions/fetch-media/index.ts`.

Never test capture or the parser against a live Meta page: use the fixture pages in `test/fixtures/adlibrary/`.

## Edge functions

Both are optional and live in `supabase/functions/`. Each `handler.js` is runtime agnostic (web standard globals, dependencies injected, only relative imports) so vitest can run it in Node; `index.ts` is the thin Deno entry. Both answer `{ action: 'status' }` without any secret, check the caller's token, and read and write with that token so row level security applies. Neither holds a service key.

| function | actions | secrets |
|---|---|---|
| `ai` | status, analyze, classify, brief | `ANTHROPIC_API_KEY` (required for anything but status), `AI_MODEL` (default `claude-sonnet-5-5`), `AI_BATCH_LIMIT` (default 20, 1 to 50) |
| `fetch-media` | status, fetch | `FETCH_MEDIA_HOSTS` (default `fbcdn.net,cdninstagram.com`), `FETCH_MEDIA_MAX_MB` (default 50, 1 to 50) |

Secrets are set with `supabase secrets set`, never in `.env` and never with a `VITE_` prefix. `src/lib/ai.js` never throws: every result has `ok`, and a failure carries a `code` and a message fit for the UI (`AI_FIX_TEXT`). AI never overwrites an angle a person set (`metrics.angle_source = 'human'`).

## Conventions

- **Env vars**: anything the browser needs is prefixed `VITE_`. Service keys and API tokens are script only and never imported by frontend code or set on a static host.
- **Never commit `.env`** or any secret. `DB_SERVICE_KEY` bypasses row level security.
- **Styling**: Tailwind only, using the tokens in `tailwind.config.js` (`canvas` page background, `card`, `ink`, `line`, one white `accent` with `accent-dim` and `accent-wash`). Dark only. Fonts are Figtree and JetBrains Mono, self hosted with @fontsource; pages use the type tokens and the primitives in `src/components/ui/`.
- **Modules**: `src/lib/modules.js` reads `VITE_MODULES` (default `library,hooks,briefs,competitors,intel`; `team` and `ops` are opt in; `all` turns on everything). UI that belongs to a module checks `isOn(id)`; the sidebar, phone tabs and More sheet come from `src/lib/nav.js`. Off means hidden, never deleted. `/` is the dashboard in every mode (`/overview` is an alias); team and ops cards join it when those modules are on.
- **Mobile first**: every view works from 320 px wide and every control is at least 44 by 44 px. `scripts/responsive-probe.js` measures it; its header says how to run it.
- **Schema changes** go into `db-setup.sql` and keep it idempotent (`if not exists`, `create or replace`, `drop policy if exists` then `create policy`, guarded `alter`s, `on conflict`), so anyone can re-run the whole file.
- **Verdicts**: a person's verdict is written only through `humanVerdictPatch` in `src/lib/ads.js` (it marks `metrics.verdict_by = 'human'`), or in bulk through the `bulk_update_ads` SQL function, which writes the same marks. Importers use `nextImportVerdict`, scoring scripts use `isAutoVerdict`. Nothing overwrites a human verdict.
- **Uploads** go through `src/lib/saveAd.js` (validation, unique paths, friendly storage errors). Every save fires `sf:ads-saved` (`announceSaved`), which the background angle tagging listens for.
- **Library search**: `search_ads` and `library_facets` in `db-setup.sql` and `src/lib/library/query.js` implement the same rules; change both together (`test/sql/40-library.test.sql` compares them).
- **Scripts** are self contained `.mjs` files that read `.env`. A missing optional variable makes the feature stop with a hint, not crash.
- **Dashes**: no em dash or en dash characters anywhere (code, comments, docs, UI text). Use a comma, colon or full stop. `test/no-dashes.test.js` fails on them.
