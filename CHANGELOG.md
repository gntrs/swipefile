# Changelog

## 0.2.0 (unreleased)

### Added

- Demo mode. With no `.env` the app runs on 24 made up sample ads in memory, with generated artwork marked SAMPLE. Nothing is saved; a reload resets it. `VITE_DEMO=1` forces it.
- Setup check at `/setup`. It reads `.env`, reaches the project and reports what is missing with the exact fix: missing or wrong values, a secret key in the browser variable, an unreachable project, missing tables, an old `db-setup.sql`, open sign ups, a missing or public bucket. Blockers keep every page on `/setup`; warnings show a dismissable banner.
- `db-setup.sql` creates the private `ad-media` storage bucket (50 MB, images and video) and its access rules, plus `swipefile_health()` for the setup check.
- `scripts/create-users.mjs --email you@example.com --password '...' --role admin` for a single account, next to the roster file mode.
- First run empty state in the library, with Add your first ad and Import a CSV.
- `/overview` route for the dashboard.
- Modules. `VITE_MODULES` picks which parts of the app are on. The default is a solo swipe file: library, hook bank, briefs, competitors and market intel. `team` (chat, goals, organic posts, outreach, availability) and `ops` (revenue, ad performance, site funnel, celebrations) are opt in, and `all` turns on everything. A module that is off is hidden, never deleted.
- Optional settings: `VITE_APP_NAME`, `VITE_FOCUS_COUNTRIES`, `VITE_FUNNEL_STAGES`, `CREATOR_QUERIES`, `CREATOR_NICHE_RE`, `DISCOVER_TERMS`, `DISCOVER_ANGLES`, `FUNNEL_EVENTS`. Scripts read `OWN_BRAND` and fall back to `VITE_OWN_BRAND`.
- Tests: `npm test` (vitest) and `npm run test:sql` (runs `db-setup.sql` twice and the SQL tests on a local Postgres). CI runs both and the build on every pull request.

### Changed

- Without `team` or `ops`, `/` opens the library, the sidebar is Ads, Hook bank, Briefs, Competitors, Market intel and Overview, and the phone tabs are Ads, Hooks, Briefs and Rivals. The overview's key numbers become Ads saved, Proven, Starred and Running now. With `team` or `ops` on, home, sidebar and tabs are what they were.
- Theme colour tokens are named for what they do: `accent` (was `coral`), `accent-dim` (was `coral-dark`), `accent-wash` (was `coral-soft`) and `canvas` (was `cream`). Nothing looks different. Forks with their own components: rename those classes too, or the colours drop out.
- Every page except Login and Setup loads on demand. The first download went from one 706 kB file to a 110 kB entry plus separate React and Supabase files.
- Pinch zoom works on phones. The app paints dark before its CSS loads, so there is no white flash, and the status bar is dark.
- Every control is at least 44 by 44 px at every size from 320 px phones to desktop.
- The wordmark comes from `VITE_APP_NAME` (default Swipefile).
- Scripts and the funnel card no longer carry one product's search terms or event names; they read them from settings.
- A verdict a person sets is marked as theirs, and importers never change it again.
- README and docs/SETUP.md describe what the app does today. Scheduling moved into docs/SETUP.md.

### Fixed

- A signed in member could create their own team row with `role = 'admin'`. Members can now only insert id, email, nickname and avatar.
- Uploads: files without an extension, no size or type check before upload, and an orphaned file when saving the ad failed. Files over 50 MB are refused with a message saying so.
- Lists that load in pages (library, hook bank, overview, competitors, funnel) showed partial data silently when a page failed. They retry twice, then say how many items are shown and offer Retry.
- The login screen spun forever when the session read failed.
- Clear filters in the library left Rivals or Ours selected.
- Compare accepted any number of ids, queried ids that could not exist, and changed ads in place. It now takes up to 4, reports ads it could not find and handles errors with Retry.
- The ad page saved changes without checking the result. Failed saves now roll back and show the error.
- Login redirected during render, and after sign in it forgot the page you were going to.
- Team profile errors were swallowed.

### Upgrading from 0.1

1. Run `db-setup.sql` again in the Supabase SQL editor. It adds the `ad-media` bucket and its storage rules, the team insert fix and the health check. Your data stays. If you added storage policies for `ad-media` by hand, delete them: Postgres combines policies, so a looser hand made one would still let everyone in.
2. Optional: add the new settings above to `.env`. Nothing breaks without them.
3. `scripts/create-users.mjs` takes `--email` and friends now; the roster file still works.
4. If you ran `scrape-creators.mjs` or `discover-winners.mjs` on their built in search terms, set `CREATOR_QUERIES` and `DISCOVER_TERMS`.
5. Team and ops features (chat, goals, availability, outreach, organic posts, revenue, funnel, celebrations) are now off by default. Your data is untouched. To get them back, set VITE_MODULES=all (or list the modules you want) and rebuild.
6. If you added your own components, rename the old colour classes: `coral-dark` to `accent-dim`, `coral-soft` to `accent-wash`, `coral` to `accent`, `cream` to `canvas`.
