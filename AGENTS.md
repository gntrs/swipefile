# AGENTS.md

Instructions for AI coding agents working in this repo. The full guide lives in [CLAUDE.md](CLAUDE.md); read that first. The short version:

- Static React + Vite + Tailwind app on a Postgres database (auth, storage, RLS, realtime). Standalone Node automation in `scripts/`.
- The whole schema is `db-setup.sql`, one idempotent file. Keep it re-runnable.
- Run with `npm install`, `cp .env.example .env`, `npm run dev`. Verify with `npm run build`.

Hard rules:

1. Never commit `.env` or any secret.
2. `DB_SERVICE_KEY` is script-only. It must never appear in `src/` or a frontend bundle. Client vars use the `VITE_` prefix.
3. Tailwind tokens for styling, dark-mode-first, mobile-first.
4. Nothing ever overwrites human-set verdicts.
5. No copyrighted media in the repo. `public/memes/` stays gitignored.
