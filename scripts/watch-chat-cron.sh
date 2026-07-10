#!/usr/bin/env bash
# Runs on a local crontab every ~3 min, 24/7, independent of any SSH session.
#
# Tier 1 (always, Haiku, cheap): triage chat -> log goals for follow-up work
# (dedup'd against open Claude goals), and decide if a chat reply is due.
#
# Tier 2 (only if tier 1 flags REPLY_NEEDED, Sonnet): compose and post ONE
# short chat reply. Can log a goal for real work but never does the work
# itself - reply-only, actual execution waits for an operator to say go.
set -euo pipefail
cd "$(dirname "$0")/.."  # repo root, wherever it lives

exec 9>.claude-data/watcher.lock
flock -n 9 || exit 0   # skip this tick if the previous run is still going

mkdir -p .claude-data
CLAUDE="${CLAUDE_BIN:-claude}"  # path to the Claude Code CLI; override with CLAUDE_BIN

HAIKU_PROMPT='You are doing a cheap triage pass on a marketing dashboard team chat.
1. Run: node scripts/chat.mjs --read 20
2. Run: node scripts/add-goal.mjs --list-open
3. New goals: for any recent teammate message that needs follow-up action and is not already covered by an open goal (match on meaning, not exact wording), run: node scripts/add-goal.mjs --title "<short action item>" --horizon 1w (add --urgent if time-sensitive, --deadline YYYY-MM-DD if a date is clearly implied).
4. Reply check: find the newest message authored by "Claude". Look at any teammate messages after it (or the whole recent history if Claude has never posted). Output the exact line REPLY_NEEDED only if one of them contains an actual question, a specific request, or a decision that needs Claude input - NOT for plain greetings/pings ("@claude yo", "hey", etc) with no real content, and not just because Claude was @mentioned with nothing substantive attached. When in doubt, do not flag it - staying quiet is the safe default.
   Otherwise do not output that line, and do not explain why not.
5. React check: if a teammate message @mentions or @tags claude (e.g. "@claude ...") and it is NOT getting a REPLY_NEEDED (so just a ping, praise, or content with nothing to answer), and it does not already show a reaction in the --read output (the "[emoji count]" suffix), react to it: node scripts/chat.mjs --react <n> <emoji> - pick whatever emoji fits the vibe (🔥 for hype/praise, 👍 for plain acknowledgment, 👀 for "noted/watching"). Only react to the newest such message, do not react to old ones already showing a reaction, and never react twice to the same message.
Never post to chat yourself. Never mark a goal done. Be terse, minimize tool calls, no extra commentary beyond the REPLY_NEEDED line when applicable.'

SONNET_PROMPT='You are Claude, replying live in a marketing dashboard team chat (internal marketing dashboard, small startup team). Steps:
1. Run: node scripts/chat.mjs --read 20 to see the conversation.
2. Figure out what the teammate(s) are asking or saying that needs a response from you.
3. Post exactly ONE short, casual reply: node scripts/chat.mjs "your reply" (match the established short/casual tone of past Claude messages, no essays, under ~400 chars).
4. If what is asked requires real work (code changes, running import/export scripts, analysis) rather than something you can just answer, say in the reply that you have logged it and will act once told to go, then run node scripts/add-goal.mjs --list-open and, only if no equivalent open goal exists yet, node scripts/add-goal.mjs --title "<short action item>" --horizon 1w.
5. Do NOT attempt any actual analysis, code changes, or other scripts (imports, exports, etc). Chat + logging a goal only.
6. Never announce that you woke up, checked in, or are running a background pass - no "just checking in", "still here", "all good on my end" type filler. Only speak if there is something substantive worth saying in response to what a teammate actually wrote.
Post exactly one chat message this run, nothing more.'

echo "=== $(date -Is) ===" >> .claude-data/watcher.log

haiku_out=$("$CLAUDE" -p "$HAIKU_PROMPT" \
  --model claude-haiku-4-5-20251001 \
  --allowedTools "Bash(node scripts/chat.mjs --read*)" "Bash(node scripts/chat.mjs --react*)" "Bash(node scripts/add-goal.mjs*)" \
  --permission-mode dontAsk 2>&1) || true

echo "$haiku_out" >> .claude-data/watcher.log

if grep -qx "REPLY_NEEDED" <<< "$haiku_out"; then
  echo "--- escalating to sonnet for a reply ---" >> .claude-data/watcher.log
  sonnet_out=$("$CLAUDE" -p "$SONNET_PROMPT" \
    --model claude-sonnet-5 \
    --allowedTools "Bash(node scripts/chat.mjs*)" "Bash(node scripts/add-goal.mjs*)" \
    --permission-mode dontAsk 2>&1) || true
  echo "$sonnet_out" >> .claude-data/watcher.log
fi
