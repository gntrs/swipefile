# AGENTS.md

Instructions for coding agents working in this repo. The full guide lives in [CLAUDE.md](CLAUDE.md); read that first. The short version:

- Static React + Vite + Tailwind app on Supabase (auth, storage, RLS, realtime). Standalone Node automation in `scripts/`.
- The whole schema is `db-setup.sql`, one idempotent file. It also creates the private `ad-media` bucket and its rules. Keep it re-runnable.
- `npm ci`, `npm run dev`. With no `.env` the app runs in demo mode on sample ads. `/setup` explains what a real setup still needs.
- Verify with `npm test`, `npm run test:sql` (local Postgres only) and `npm run build`.

Hard rules:

1. Never commit `.env` or any secret.
2. `DB_SERVICE_KEY` is script only. It must never appear in `src/` or a frontend bundle. Client vars use the `VITE_` prefix.
3. Tailwind tokens for styling, dark only, mobile first, every control at least 44 by 44 px.
4. Nothing overwrites a human verdict: people write through `humanVerdictPatch`, importers through `nextImportVerdict`.
5. No em dash or en dash characters anywhere. Use a comma, colon or full stop.
6. No copyrighted media in the repo. `public/memes/` stays gitignored.
7. Only wire the integrations a person actually has. Every one is optional.
