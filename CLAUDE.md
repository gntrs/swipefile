# CLAUDE.md

Guidance for AI coding agents working in this repository (Swipefile, an open-source ad intelligence dashboard and lightweight CRM).

## What this is

A static React app on top of a Postgres database that provides auth, storage, row-level security, and realtime, plus standalone Node automation scripts. There is no custom server. Claude powers ad analysis, briefs, and the Telegram assistant.

## Project structure

```
src/
  pages/       Route-level views (Library, Compare, Intel, Competitors, Outreach, ...)
  components/  Shared UI (AdCard, TeamChat, Goals, Sparkline, ...)
scripts/       Standalone Node automation (.mjs) and cron wrappers (.sh)
docs/          Setup guide
db-setup.sql   The entire database schema, one idempotent file
public/        Static assets, PWA manifest, memes/ (gitignored user clips)
.env.example   Every supported variable with comments
```

## Running

```bash
npm install
cp .env.example .env   # set VITE_DB_URL and VITE_DB_ANON_KEY
npm run dev            # local dev server
npm run build          # production build to dist/
```

Database setup: run `db-setup.sql` in your database provider's SQL editor and create a storage bucket named `ad-media`.

## Conventions

- **Env vars**: anything the browser needs must be prefixed `VITE_`. Everything else (service keys, API tokens) is script-only and must never be imported by frontend code or added to a static-host deploy.
- **Never commit `.env`** or any secret. `DB_SERVICE_KEY` bypasses row-level security; it stays local to the machine running scripts.
- **Styling**: Tailwind only, using the design tokens in `tailwind.config.js` (monochrome base with coral, mint, and amber accents). Dark-mode-first. Fonts are Inter and Geist Mono.
- **Mobile-first**: every view must work on a phone; check `MobileNav` when adding routes.
- **Schema changes** go into `db-setup.sql` and must keep it idempotent (`create table if not exists`, `on conflict do nothing`, guarded `alter`s) so users can re-run the whole file safely.
- **Verdict rule**: importers and scoring scripts may set auto-verdicts, but must never overwrite a verdict set by a human.
- **Scripts** are self-contained `.mjs` files that read config from `.env`. A missing optional variable should make the feature no-op, not crash.

## Testing

There is no test suite. Verify changes with `npm run build` (must pass clean) and by exercising the affected view in `npm run dev`. For scripts, run them once in the foreground with `--dry-run` where supported.
