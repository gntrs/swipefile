# Swipefile

Setting this project up for someone, or helping them wire integrations?
Follow the agent playbook in [AGENTS.md](AGENTS.md) - it has the interview
flow (brand, Supabase, optional Stripe/Meta/PostHog/Foreplay/Brave, cron vs
GitHub Actions, deploy) and the hard rules (never commit `.env`, service key
stays local, Supabase signup stays OFF, only `VITE_` vars reach the browser).

Human-readable setup docs: [README.md](README.md) and [docs/SETUP.md](docs/SETUP.md).

Code conventions: Tailwind utilities with the existing tokens (`cream`,
`ink`, `card`, `line`), comments explain why not what, database changes ship
as a new `supabase-migration-<next-number>.sql`, mobile layout is
first-class. `npm run build` must pass before you're done.
