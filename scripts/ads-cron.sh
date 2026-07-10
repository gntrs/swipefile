#!/usr/bin/env bash
# Daily ads-stats pass. Runs on your cron box (same machine as
# watch-chat-cron.sh), e.g. every morning:
#
#   30 7 * * * /path/to/swipefile/scripts/ads-cron.sh
#
# 1. Pull fresh numbers: our own ads from the Meta Marketing API, site
#    analytics from PostHog, everything from Supabase into export.json.
# 2. Hand the fresh data to a headless Claude (Sonnet) pass that compares it
#    with the latest briefs + open goals and ONLY speaks when something
#    material changed: then it saves one short brief, logs concrete goals,
#    and drops one line in team chat. Otherwise it outputs NOTHING_NEW and
#    stays silent. It never touches code or git - findings only; execution
#    still waits for a real session.
#
# Needs META_ACCESS_TOKEN + META_AD_ACCOUNT_ID in the cron box's .env
# (plus the usual SUPABASE_SERVICE_KEY and POSTHOG_API_KEY).
set -euo pipefail
cd "$(dirname "$0")/.."  # repo root, wherever it lives

exec 9>.claude-data/ads-cron.lock
flock -n 9 || exit 0   # skip if the previous run is still going

mkdir -p .claude-data
CLAUDE="${CLAUDE_BIN:-claude}"  # path to the Claude Code CLI; override with CLAUDE_BIN
LOG=.claude-data/ads-cron.log

echo "=== $(date -Is) ===" >> "$LOG"

# --- 1. Pull. If the Meta pull fails (token expired, API down), log and stop:
# an analysis pass on stale ad numbers is worse than no pass. ---
if ! node scripts/import-meta-ads.mjs >> "$LOG" 2>&1; then
  echo "meta import failed, skipping analysis" >> "$LOG"
  exit 0
fi
# Competitor ads from the Meta Ad Library (replaces Foreplay). Non-fatal:
# yesterday's competitor rows are fine for the analysis pass.
node scripts/import-ad-library.mjs >> "$LOG" 2>&1 || echo "ad library import failed (continuing)" >> "$LOG"
node scripts/posthog-pull.mjs >> "$LOG" 2>&1 || echo "posthog pull failed (continuing)" >> "$LOG"
# Daily KPI snapshot (funnel + traffic) into Supabase for the dashboard graphs.
# Non-fatal: a missed snapshot just leaves a gap in the trend.
node scripts/snapshot-kpis.mjs >> "$LOG" 2>&1 || echo "kpi snapshot failed (continuing)" >> "$LOG"
# Stripe revenue (MRR + lifetime gross + sales rows for the live counter).
# Non-fatal, and a no-op until STRIPE_API_KEY is in .env. The */5 crontab line
# (see stripe-pull.mjs header) keeps it near-live; this daily run is backstop.
node scripts/stripe-pull.mjs >> "$LOG" 2>&1 || echo "stripe pull failed (continuing)" >> "$LOG"
if ! node scripts/export.mjs >> "$LOG" 2>&1; then
  echo "export failed, skipping analysis" >> "$LOG"
  exit 0
fi

# --- 2. Analysis pass. ---
ANALYSIS_PROMPT='You are Claude running the automated daily ads-stats pass for a marketing dashboard. Fresh data was pulled seconds ago for you: .claude-data/export.json (all ads, posts, goals, briefs - own-brand ad metrics straight from the Meta API) and .claude-data/posthog.json (site traffic + funnel events).
1. Read both files. Read the most recent briefs inside export.json to see what was already known, and run: node scripts/add-goal.mjs --list-open
2. Decide if anything MATERIAL changed since the latest brief: an own ad crossing a kill/scale threshold (CPC blowing past your kill threshold, CTR collapsing or spiking, spend pacing hard on a loser), a funnel number moving sharply (payment_initiated vs payment_completed, onboarding starts vs completes, payment_abandoned volume), a Stripe anomaly in the latest kpi_snapshots metrics.revenue (disputes_open above 0, a failed_30d spike, refunded_total jumping, MRR dropping day-over-day), or a watch item from an open goal or recent brief resolving either way. Routine daily drift is NOT material.
3. If nothing material: output the single line NOTHING_NEW and stop. No brief, no goals, no chat. Silence is the correct default.
4. If something material: save ONE short brief - verdicts + actions only, under 30 lines. Write the body to .claude-data/ads-cron-brief.txt, then run: node scripts/add-brief.mjs --title "<short title>" --file .claude-data/ads-cron-brief.txt
5. Log a goal ONLY for a concrete new action not already covered by an open goal (match on meaning): node scripts/add-goal.mjs --title "..." --horizon 1w (add --urgent / --deadline YYYY-MM-DD when clearly warranted). Never mark goals done.
6. Then post exactly ONE short casual chat line pointing at the brief: node scripts/chat.mjs "..." (under ~200 chars, no essays).
7. Never change code, never touch git, never run imports yourself, never post more than one chat message. Findings only - execution waits for a live session.'

"$CLAUDE" -p "$ANALYSIS_PROMPT" \
  --model claude-sonnet-5 \
  --allowedTools "Read" "Write" \
    "Bash(node scripts/add-goal.mjs*)" \
    "Bash(node scripts/add-brief.mjs*)" \
    "Bash(node scripts/chat.mjs*)" \
  --permission-mode dontAsk >> "$LOG" 2>&1 || true
