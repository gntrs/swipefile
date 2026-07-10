<div align="center">

<img src="public/icons/icon-512.png" alt="Swipefile logo" width="96" />

# Swipefile

**Your competitors already told you what works. They keep paying for it.**

The open-source ad swipe file + competitor intelligence dashboard.
Self-hosted on your own free-tier Supabase. Your data. $0/month.

![License: MIT](https://img.shields.io/badge/license-MIT-ffffff?labelColor=0A0A0A)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-ffffff?labelColor=0A0A0A)
![Stack](https://img.shields.io/badge/React_18_+_Vite-Supabase-ffffff?labelColor=0A0A0A)
![Cost](https://img.shields.io/badge/self--hosted-%240%2Fmo-ffffff?labelColor=0A0A0A)

[Quick start](#quick-start) · [How it works](#the-one-insight-this-tool-is-built-on) · [Power-ups](#optional-power-ups) · [Full setup guide](docs/SETUP.md)

</div>

---

Ad-intelligence SaaS charges $50-100 per seat per month for what is, let's be
honest, a database with a nice UI. Swipefile is the same damn database with
the same nice UI, except it's yours and it costs nothing:

- 🗂️ **Ad library** - one shared, searchable home for every ad you and your
  team save. Winner / testing / loser / unsure verdicts, tags, team notes,
  who-added-what.
- 🕵️ **Rivals' proven plays** - competitor ads ranked by how long they've
  been running. Nobody pays to run a losing ad for a month; the long-runners
  are your niche's battle-tested angles.
- 🪝 **Hook bank** - every hook from every saved ad in one filterable list.
  Filter to proven-only, click to copy, go write.
- 📈 **Your real numbers** - optional: revenue from Stripe (with confetti on
  every live sale), your ads' spend/CTR/CPC from the Meta API, site funnel
  from PostHog.
- 🤖 **AI analysis** - optional: export the library and ask Claude Code
  "what do my winners have in common?" over your own data.
- 📱 **Dark, fast, phone-ready** - monochrome UI, installable PWA, bottom
  tab bar on phones, team chat, goals, creator outreach CRM.

<!-- screenshots: add 2-3 dark-mode shots here, e.g.
<p align="center"><img src="docs/screens/dashboard.png" width="800" /></p>
-->

## The one insight this tool is built on

**A brand keeps paying only for what converts.** So competitor ad longevity
is a free, public proxy for performance data you'll never get access to:

| What you observe | Auto verdict |
| --- | --- |
| Competitor ad ran 30+ days | `winner` - a proven play, study it |
| Still live, under 30 days | `testing` |
| Killed in under 14 days | `loser` |
| A human set a verdict by hand | never overwritten by automation |

Feed it saved ads (by hand or via the importers) and the library sorts your
whole niche into "copy this energy" and "avoid this" for you.

## Quick start

Ten minutes, two accounts (GitHub + free [Supabase](https://supabase.com)),
no server, no bullshit.

```bash
git clone https://github.com/gntrs/swipefile
cd swipefile
npm install
cp .env.example .env    # fill in the two Supabase values below
npm run dev             # -> http://localhost:3100
```

Then in your Supabase project:

1. **SQL Editor**: paste and run `supabase-setup-all.sql` - the whole database
   in one shot. (The individual `supabase-schema.sql` + numbered migrations
   are there too if you'd rather run them piece by piece.)
2. **Storage**: create a bucket named exactly `ad-media`, then run:
   ```sql
   create policy "team read ad-media"   on storage.objects for select to authenticated using (bucket_id = 'ad-media');
   create policy "team write ad-media"  on storage.objects for insert to authenticated with check (bucket_id = 'ad-media');
   create policy "team delete ad-media" on storage.objects for delete to authenticated using (bucket_id = 'ad-media');
   ```
3. **Authentication**: turn "Allow new users to sign up" OFF, add yourself
   under Users (auto-confirm on).
4. **Project Settings -> API**: copy the URL + anon key into `.env`.

Log in. Add your first ad. Done.

Never touched Node or Supabase before? The zero-assumptions walkthrough is in
**[docs/SETUP.md](docs/SETUP.md)** - it starts at "install Node.js".

**Using an AI coding agent?** Open this repo in Claude Code, Cursor, or any
agent and say *"set this up for me"* - [AGENTS.md](AGENTS.md) tells it exactly
what to ask you (your brand, your keys, whether you have a server) and what to
wire. It only enables what you actually have.

## Deploy free

`npm run build` gives you a static `dist/` - host it anywhere. On Vercel or
Netlify: import your fork, add the two `VITE_SUPABASE_*` env vars (plus
`VITE_OWN_BRAND`), deploy. Nothing secret ships in the build; row-level
security does the guarding.

## Optional power-ups

Everything below stays dormant until you add its key to `.env`. Full
instructions per integration in [docs/SETUP.md](docs/SETUP.md#part-4-optional-integrations).

| Power-up | Needs | What you get |
| --- | --- | --- |
| 💶 Revenue card | `STRIPE_API_KEY` | lifetime revenue, MRR, confetti per live sale |
| 📊 Own-ads import | `META_ACCESS_TOKEN` + account id | real spend/CTR/CPC per ad, auto-refreshed |
| 🕵️ Competitor import | `FOREPLAY_API_KEY` | auto-fill the library from a swipe file |
| 🔁 Ad Library pulls | Meta Ad Library token | competitor ads straight from the source |
| 📉 Site funnel | `POSTHOG_API_KEY` + project id | visitors -> signup -> paid card |
| 🧠 AI analysis | [Claude Code](https://claude.com/claude-code) CLI | "what's working?" answered from your data |
| 🔎 Creator finder | `BRAVE_API_KEY` | scout niche creators for outreach |
| 🎉 Party mode | your own clips in `public/memes/` | fullscreen meme when a sale lands ([how](public/memes/README.md)) |

Set `VITE_OWN_BRAND` + `OWN_BRAND` to your brand name so the app knows which
ads are yours and which are the competition's.

## Stack

React 18 + Vite + Tailwind on the front, Supabase (Postgres, Auth, Storage,
Realtime) behind it. No backend server to run, no Docker to babysit: the
browser talks to Supabase directly and RLS enforces access.

```
src/pages/          screens: Dashboard, Library, HookBank, Competitors, ...
src/components/      Layout, AdCard, RevenueCard, FunnelCard, StatCard, ...
src/lib/            supabase client, brand + format helpers
scripts/            optional local admin/import scripts (Node, service key)
supabase-*.sql      schema + numbered migrations
docs/SETUP.md       beginner-to-advanced setup guide
```

## FAQ

**Really free?** For a small team, yes: Supabase free tier + any free static
host. Optional integrations bill on their own plans.

**Solo?** A team of one is still a team.

**Mobile app?** It's a PWA - deploy it, open on your phone, Add to Home
Screen. Standalone window, bottom tab bar, the works.

**Why is there no Docker?** There's no server. Static files + Supabase.

**Can I rename it / reskin it?** MIT license - it's yours. The whole theme
lives in `tailwind.config.js`.

## Contributing

Issues and PRs welcome - see [CONTRIBUTING.md](CONTRIBUTING.md).
If Swipefile saves you a SaaS subscription, a ⭐ helps others find it.

## Take it. Seriously.

MIT means exactly what it sounds like: fork it, rebrand it, reskin it,
**charge money for it** - people pay $100/mo for less. You don't owe me
anything, you don't have to ask, and no strings ever get attached. Whatever
you build on top is your win.

And this repo isn't done. I run Swipefile for my own brand every day, so
whatever I cook for myself gets dropped here too. That's the game we're all
playing. Star it to catch the next drop. 🧑‍🍳

## License

[MIT](LICENSE)
