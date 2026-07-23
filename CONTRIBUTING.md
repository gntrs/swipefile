# Contributing

Thanks for helping make Swipefile better. The process is deliberately light.

## Getting set up

Follow the [quick start](README.md#quick-start) in the README, or the full walkthrough in [docs/SETUP.md](docs/SETUP.md). You will need a Postgres database project of your own to develop against.

## Pull requests

- Keep PRs focused: one feature or fix per PR.
- Run `npm run build` before opening the PR; it must pass clean.
- Match the existing style: Tailwind tokens only, dark-mode-first, mobile-first. Check new views on a phone-sized viewport.
- Schema changes go into `db-setup.sql` and must keep it idempotent so existing users can re-run the file safely.
- Never include secrets, `.env` files, or personal data in a PR.

## Bugs and ideas

Open an issue with steps to reproduce (for bugs) or the problem you are trying to solve (for features). Small, sharp issues get fixed fastest.

## Code of conduct

Be kind, assume good intent, and keep discussions about the code.
