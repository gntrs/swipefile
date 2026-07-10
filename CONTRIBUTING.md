# Contributing to Swipefile

Thanks for wanting to make this better. Ground rules are short:

## Bugs and ideas

Open an issue with what you expected, what happened, and (for UI bugs) a
screenshot. Console errors from the browser dev tools help a lot.

## Pull requests

1. Fork, branch from `main`, keep the PR focused on one thing.
2. `npm run build` must pass before you open it.
3. Match the style around you: Tailwind utility classes, the existing color
   tokens (`cream`, `ink`, `card`, `line`, the semantic ramps), comments that
   explain *why*, not *what*.
4. UI changes: check both desktop and a phone-width viewport - the app is a
   PWA and the mobile layout is first-class.
5. Database changes ship as a new `supabase-migration-<next-number>.sql`,
   never as edits to old migrations.

## What makes a good first PR

- New importer scripts (other ad platforms, other analytics tools)
- Accessibility passes (focus order, labels, contrast)
- Making the funnel stages configurable from the UI
- i18n groundwork

## Not accepted

- Copyrighted media in `public/memes/` (the folder is gitignored for a reason)
- Anything that sends user data to a third party by default
