# AGENTS.md

Instructions for coding agents working in this repo. The full guide lives in [CLAUDE.md](CLAUDE.md); read that first. The short version:

- Static React + Vite + Tailwind app on Supabase (auth, storage, RLS, realtime, edge functions). Standalone Node automation in `scripts/`.
- Code lives in `src/features/save`, `src/features/ai`, `src/features/capture`, `src/lib/library`, `src/lib/csv`, `supabase/functions` (the optional `ai` and `fetch-media` edge functions) and `extension/` (capture). CLAUDE.md has the map.
- Modules: `VITE_MODULES` picks which parts are on (default library, hooks, briefs, competitors, intel; `team` and `ops` opt in).
- The whole schema is `db-setup.sql`, one idempotent file. It also creates the private `ad-media` bucket and its rules. Keep it re-runnable.
- `npm ci`, `npm run dev`. With no `.env` the app runs in demo mode on sample ads. `/setup` explains what a real setup still needs.
- Verify with `npm test`, `npm run test:sql` (local Postgres only) and `npm run build`.
- Edge function secrets (`ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_BATCH_LIMIT`, `FETCH_MEDIA_HOSTS`, `FETCH_MEDIA_MAX_MB`) are set with `supabase secrets set`, never in `.env`, never `VITE_`.

Hard rules:

1. Never commit `.env` or any secret.
2. `DB_SERVICE_KEY` is script only. It must never appear in `src/`, `supabase/functions/` or a frontend bundle. Client vars use the `VITE_` prefix.
3. Tailwind tokens for styling, dark only, mobile first, every control at least 44 by 44 px.
4. Nothing overwrites a human verdict: people write through `humanVerdictPatch`, importers through `nextImportVerdict`.
5. No em dash or en dash characters anywhere. Use a comma, colon or full stop.
6. No copyrighted media in the repo. `public/memes/` stays gitignored.
7. Only wire the integrations a person actually has. Every one is optional.
8. Never load a live Meta page from code or tests. Capture and the parser are tested on the fixture pages in `test/fixtures/adlibrary/`.
