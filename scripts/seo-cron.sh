#!/usr/bin/env bash
# Daily SEO rank + Google Trends pull. Same shape as ads-cron.sh.
#
# Enable with (WSL crontab, 07:20 daily - after ads-cron so the two do not
# fight over the Brave rate limit):
#   (crontab -l 2>/dev/null; echo "20 7 * * * $HOME/swipefile/scripts/seo-cron.sh >> /tmp/seo-cron.log 2>&1") | crontab -
#
# Both steps run even if the other fails: SEO ranks and Trends are independent
# signals and losing one must not lose the other. Exit code is non-zero if
# either failed, so /tmp/seo-cron.log is the place to look when a chart flatlines.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# Do not stack runs on top of each other. Git Bash on Windows has no flock, so
# there the run just goes ahead unlocked rather than refusing to start.
if command -v flock >/dev/null 2>&1; then
  exec 9>/tmp/seo-cron.lock
  flock -n 9 || { echo "$(date -Is) another seo-cron is running, skipping"; exit 0; }
fi

echo "=== $(date -Is) seo-cron start ==="

rc=0

echo "--- seo-rank-pull ---"
node scripts/seo-rank-pull.mjs || { echo "seo-rank-pull exited $?"; rc=1; }

echo "--- trends-pull ---"
# Trends is the fragile one (unofficial endpoints, see the header of
# trends-pull.mjs). It failing is expected occasionally and must not be
# treated as the SEO pull failing.
node scripts/trends-pull.mjs || { echo "trends-pull exited $?"; rc=1; }

echo "=== $(date -Is) seo-cron done (rc=$rc) ==="
exit $rc
