#!/usr/bin/env bash
# Creator-finder job watcher. Runs on the WSL crontab next to
# watch-chat-cron.sh and ads-cron.sh:
#
#   */2 * * * * $HOME/swipefile/scripts/creators-cron.sh
#
# The "Find creators" button on /outreach inserts a pending scrape_jobs row;
# this picks it up within ~2 minutes and runs scripts/scrape-creators.mjs
# --job, which searches the niche via the Brave Search API and fills
# creator_leads. Exits instantly (and silently) when nothing is queued.
#
# Needs in the repo .env: VITE_DB_URL, DB_SERVICE_KEY,
# BRAVE_API_KEY. No AI involved - this is a plain scraper pass.

set -euo pipefail
cd "$(dirname "$0")/.."

exec 9>/tmp/creators-cron.lock
flock -n 9 || exit 0   # previous run still going, skip

node scripts/scrape-creators.mjs --job >> /tmp/creators-cron.log 2>&1

# Follow-up pass: hunt contact emails for leads that have never been checked
# (no-op one query when there are none, so this is free on idle ticks).
node scripts/scrape-emails.mjs --limit 25 >> /tmp/creators-cron.log 2>&1 || true
