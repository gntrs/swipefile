#!/usr/bin/env bash
# Weekly scrape pass. Runs on your cron box next to ads-cron.sh, Monday
# mornings:
#
#   0 7 * * 1 /path/to/swipefile/scripts/weekly-scrape-cron.sh
#
# 1. Creator finder over the builtin niche queries (same as the "Find
#    creators" button, no job row needed). Contact emails follow on their own:
#    creators-cron.sh already chains scrape-emails.mjs every ~2 minutes.
# 2. Competitor organic posts via Brave (competitors with an ig_handle).
#
# Needs in the repo .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY,
# BRAVE_API_KEY. No AI involved - plain scraper passes, findings land in the
# dashboard (/outreach leads, /competitors posts).

set -euo pipefail
cd "$(dirname "$0")/.."

exec 9>/tmp/weekly-scrape-cron.lock
flock -n 9 || exit 0   # previous run still going, skip

LOG=/tmp/weekly-scrape-cron.log
echo "=== $(date -Is) ===" >> "$LOG"

node scripts/scrape-creators.mjs >> "$LOG" 2>&1 || echo "creator sweep failed (continuing)" >> "$LOG"
node scripts/scrape-competitor-posts.mjs >> "$LOG" 2>&1 || echo "competitor posts failed" >> "$LOG"
