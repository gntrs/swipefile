# Contributing

Thanks for helping make Swipefile better. The process is deliberately light.

## Getting set up

`npm ci` and `npm run dev` give you the app in demo mode on sample ads, which is enough for most UI work. For anything that touches the database, follow [docs/SETUP.md](docs/SETUP.md) with a Supabase project of your own.

## Pull requests

- Keep PRs focused: one feature or fix per PR.
- Run `npm test` and `npm run build` before opening the PR; both must pass. If you changed `db-setup.sql`, run `npm run test:sql` against a local Postgres too. CI runs all three.
- Match the existing style: Tailwind tokens only, dark-mode-first, mobile-first. Check new views on a phone-sized viewport.
- Schema changes go into `db-setup.sql` and must keep it idempotent so existing users can re-run the file safely.
- Never include secrets, `.env` files, or personal data in a PR.

## Bugs and ideas

Open an issue with steps to reproduce (for bugs) or the problem you are trying to solve (for features). Small, sharp issues get fixed fastest.

## Code of conduct

Be kind, assume good intent, and keep discussions about the code.
