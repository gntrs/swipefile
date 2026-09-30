# Capture: save ads from the Meta Ad Library

Capture puts an ad from the [Meta Ad Library](https://www.facebook.com/ads/library/) into your swipefile in one click. You click a bookmark (or a button the extension adds), a new tab opens on your own swipefile with the ad filled in, you check it, and you press Save.

There are two ways in, and both run the same parser (`extension/parse.js`):

- **The bookmarklet**: a bookmark you drag to your bookmarks bar. Works in any desktop browser that runs bookmarklets.
- **The extension**: a small Chrome extension (also Edge and Brave) that adds a `Save to swipefile` button to every ad.

Optional: the **fetch-media** edge function copies the ad's image or video into your own storage, because Meta's links expire.

## How it works

1. On an Ad Library page, the parser reads the **text** of the ad you click: "Library ID", "Started running on", the advertiser above "Sponsored", the body text, the headline, the call to action, the landing page link, the platforms, and the image or video address. It reads the English labels, never Meta's class names, which change all the time.
2. It builds a link to `/capture` on your swipefile with those fields in the address, and opens it in a new tab. Nothing is sent anywhere else. The link is kept under 6,000 characters (long body text is trimmed first).
3. The capture page checks you are signed in (if not, you log in and land back on it), looks for an ad with the same Library ID, and shows either `Already in your swipe file` or an editable preview.
4. Nothing is saved until you press `Save to swipefile`. The ad is saved with its Library ID, running dates, platforms and call to action in `metrics`, so filters, the longest running sort and the auto verdict all work on it.
5. If fetch-media is deployed, the creative is then copied into your `ad-media` bucket. If it is not, the ad still saves and you can add the file on the ad page.

The capture page treats everything in the link as untrusted text: strings are trimmed and capped, ids must be digits, dates must be real dates, and the landing page and media must be `https:` addresses. A `javascript:` or plain `http:` link is dropped.

## Install the bookmarklet

Open **Capture** in the app (`/capture/setup`).

- **Chrome, Edge, Brave, Firefox (desktop):** drag the `Save to swipefile` button to your bookmarks bar. Show the bar first if it is hidden (Chrome: Ctrl+Shift+B, or Cmd+Shift+B on a Mac).
- **No bookmarks bar, or a phone:** press `Copy code`, make any bookmark, edit it, and paste the code as its address.

To use it: open an ad in the Ad Library and click the bookmark.

- On a single ad (a link with `?id=` in it), the capture page opens at once.
- On a results page with several ads, a banner says `Click the ad you want to save.` The ad under the pointer is outlined. Click it, and the capture page opens with that ad. `Escape` or `Cancel` stops.
- If your browser blocks the new tab, the banner shows an `Open the capture page` link instead.

The bookmarklet carries your swipefile's address inside it. If the app moves to a new address, drag a fresh one from Capture setup.

## Install the extension

1. In your copy of this repo, find the `extension` folder.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`) and turn on **Developer mode**.
3. Press **Load unpacked** and pick the `extension` folder.
4. Open the extension's **options** and paste your swipefile's address (Capture setup shows it with a Copy button). `https:` addresses are accepted, plus `http://localhost` and `http://127.0.0.1` for local use. Only the origin is stored, in `chrome.storage.sync`.
5. Open the Ad Library. Each ad gets a `Save to swipefile` button, including ads that load as you scroll.

The extension asks for one permission, `storage`, and runs only on `https://www.facebook.com/ads/library*`. It has no background worker, never reads cookies and never calls the network: a click opens your capture page and that is all.

After pulling a new version of the repo, press the reload icon on the extension's card in `chrome://extensions`.

## Copy creatives with fetch-media (optional)

Meta's image and video links (`fbcdn.net`, `cdninstagram.com`) stop working after a while. fetch-media downloads the creative once, when you save, and puts it in your private `ad-media` bucket.

```bash
supabase functions deploy fetch-media
# optional, the defaults are shown:
supabase secrets set FETCH_MEDIA_HOSTS=fbcdn.net,cdninstagram.com
supabase secrets set FETCH_MEDIA_MAX_MB=50
```

What it does, and what it refuses:

- It runs as the signed in user: it reads the ad and writes the file with your token, so row level security and the storage policies apply exactly as in the app.
- It fetches only `https:` addresses on the allowed hosts (the host itself or a subdomain), on the default port, with no user name or password, and never an IP address. Every redirect is checked the same way, and it follows at most 3.
- It accepts only images and videos, up to `FETCH_MEDIA_MAX_MB` (1 to 50, default 50), and stops reading as soon as a download goes over.
- It never replaces a creative: if the ad already has one, or gets one while the download runs, it keeps that one and throws its own copy away.
- `{ "action": "status" }` answers without any secret, which is how `/setup` tells you whether it is deployed.

## Privacy and Meta's terms

Meta's terms do not allow automated collection from its sites. Capture only reads the ad you click, in your own browser, and sends it only to your swipefile. It never crawls and never sees your Facebook login.

Capture uses your own browser session: you are the one looking at the page, and nothing runs on a server. The longevity script below is different. It loads public Ad Library pages automatically, which is what Meta's terms restrict, so it is off by default and you run it at your own risk.

## Re-checking how long ads run (opt in, off by default)

`scripts/track-longevity.mjs` opens the Ad Library page of each competitor ad that has a Library ID, reads it with the same parser, and updates whether it still runs, its start and stop dates and its day count. Loading Meta pages automatically is what Meta's terms restrict, so the script refuses to run unless you opt in:

```bash
# see what it would do, on a saved page, offline (no database, no opt in):
node scripts/track-longevity.mjs --fixture test/fixtures/adlibrary/single-active.html --id 999900007654321

# your call: re-check up to 5 ads and print the changes without writing them
node scripts/track-longevity.mjs --i-accept-the-terms --dry-run --limit 5
```

- Opt in with `--i-accept-the-terms` or `LONGEVITY_OPT_IN=1` in `.env`.
- It needs `VITE_DB_URL` and `DB_SERVICE_KEY` in `.env`, and `OWN_BRAND` so your own ads are skipped.
- It needs Playwright, which is not a dependency of this repo: `npm i -D playwright && npx playwright install chromium`.
- Ads never checked go first, then the oldest check. It waits 3 to 6 seconds between pages, stops after 5 failures in a row, and stops at once if Meta asks for a login. It never signs in.
- It never changes a verdict unless you add `--rescore`, and even then only verdicts nobody set by hand.

## When Meta changes the page

The parser reads English labels, so it survives most redesigns. When it stops finding ads:

1. On the Ad Library, right click the ad, Inspect, and copy the outer HTML of the whole ad card.
2. Save it as a new file in `test/fixtures/adlibrary/`. Replace the advertiser, the ids (use ones starting `99990000`) and the image addresses with made up ones.
3. Write `<name>.parts.json` (what `readCard` should return for each card) and `<name>.expected.json` (what `parseCard` should return).
4. Adjust `extension/parse.js` until `npm test` passes, then reload the extension and drag a fresh bookmarklet.

## Not tested

- Bookmarklets in Safari and Firefox, and on phones. Chrome was the browser used while building.
- Facebook in a language other than English: capture finds no ads and says to switch to English. On a single ad page it still captures the Library ID from the address.
- The extension in Firefox (it is a Chrome style Manifest V3 extension).
- Real Meta pages: every automated test runs on made up fixture pages.
