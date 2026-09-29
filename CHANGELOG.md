# Changelog

## 0.3.0 (unreleased)

### Added

- The library searches, counts and pages on the server: 48 ads a page, with Previous and Next, so a library of thousands opens fast. New SQL functions `search_ads`, `library_facets` and `bulk_update_ads`.
- Filters, sort and page live in the address bar, so a filtered view survives a reload and can be linked to. New filters by angle and by tag.
- Select many ads and act once: verdict, star, add or remove a tag, compare, delete (asks for a second tap). On phones the actions open in a sheet.
- Keys: `/` search, `J` `K` move, `Enter` open, `X` select, `W` `L` verdict, `S` star, `Esc`, `?` for the list. On the ad page `J` `K` walk the list you came from and `Esc` goes back to it.
- Add an ad from its Ad Library link or id: the link is kept, an ad you already saved is pointed out, and the page says why the image or video still comes from you. Drop or paste several files and each becomes its own ad, saved one by one with a status per file. Optionally track the brand on Competitors in the same step.
- CSV import in the browser at `/ads/import`, for a swipe file CSV (with a template to download) or a Meta Ads Manager export, with a preview and line numbered problems before anything is written.
- Hook bank: select hooks for a brief, filter by angle, and each hook shows its angle.
- `scripts/import-ads-csv.mjs --parse-only` prints the summed rows as JSON without a database.
- AI in the app, optional, running as the `ai` edge function in your own Supabase project with your own Anthropic key. Why it works on the ad page; Tag angles in the hook bank, one batch of up to 20 per press with the count shown; Brief from these in the library and hook bank. New ads get their angle tagged in the background (at most 20 per save and 100 per page load; `VITE_AI_AUTO=0` turns it off). Without the function or the key the buttons stay and show the command that fixes it, and `/setup` has an AI row.
- Briefs can be written, edited and deleted in the app. A brief made from a selection links back to its source ads and hooks. The overview's latest brief shows its source count and opens that brief.
- `scripts/add-brief.mjs --ads id1,id2` links a brief to its source ads.
- Capture from the Meta Ad Library. A bookmarklet and a small Chrome extension (also Edge and Brave) read the ad you click, in your own browser, and open your swipefile's new capture page with it filled in: brand, text, headline, call to action, landing page, running dates and platforms. Nothing saves until you press Save. An ad you already have shows `Already in your swipe file` and can update its running dates without touching its verdict. Set up at `/capture/setup`; details in docs/CAPTURE.md.
- `fetch-media` edge function (optional). Copies a captured ad's image or video from Meta's CDN into your `ad-media` bucket as the signed in user. Only https, only the hosts in `FETCH_MEDIA_HOSTS`, at most 3 checked redirects, up to `FETCH_MEDIA_MAX_MB`. `/setup` shows whether it is deployed.
- `scripts/track-longevity.mjs` (opt in, off by default) re-checks how long competitor ads keep running. It refuses to run without `--i-accept-the-terms` or `LONGEVITY_OPT_IN=1`, because loading Meta pages automatically is restricted by Meta's terms, and you run it at your own risk. `--fixture` parses a saved page offline.

### Changed

- The library's Compare button became Select; compare is one of the actions on the selection.
- `scripts/import-ads-csv.mjs` checks its arguments before its settings and shares its parsing with the import page.
- Model output never contains the two long dash characters: they are replaced before anything is saved.

### Fixed

- Starring an ad on a card changed the list's copy of the ad in place.
- The ad page's Library button, and deleting an ad, went back to an unfiltered library. Both now return to the list you opened the ad from.
- On the ad page, a key pressed right after `J` or `K` could act on the ad you just left: a verdict or star was saved to the next ad together with the previous ad's details. The page now clears the previous ad before it loads the next one.

### Upgrading from 0.2

1. Run `db-setup.sql` again in the Supabase SQL editor. It adds the library search functions (`search_ads`, `library_facets`, `bulk_update_ads`), the brief source columns and the angle and Ad Library id indexes, and raises the schema version to 3, so `/setup` asks for this run until it is done. Your data stays; old briefs get empty source lists. Until you run it, the library searches in the browser as before and briefs made by AI write their sources into the brief text.
2. AI is optional. To turn it on, deploy the `ai` edge function and set `ANTHROPIC_API_KEY` (docs/SETUP.md, AI). Without it every AI button stays and shows the command that fixes it.
3. Capture needs no database change. Load the bookmarklet or the extension from `/capture/setup`. Deploy the optional `fetch-media` function to keep creatives.
4. `scripts/track-longevity.mjs` is new and off by default. Nothing runs unless you opt in.

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
