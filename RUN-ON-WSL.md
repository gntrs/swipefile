# What to run on WSL (Stripe revenue pipeline)

One-time setup so the dashboard's revenue counter stays near-live. Run these
inside your WSL terminal, in the `swipefile` repo folder.

## 1. Pull the latest code

```bash
cd ~/swipefile
git pull
```

## 2. Confirm the Stripe key is in the WSL `.env`

```bash
grep -q '^STRIPE_API_KEY=' .env && echo "key is set" || echo "MISSING - add it"
```

If missing, use the non-nano script from earlier in this chat (upserts the
line without an interactive editor).

## 3. Test it once, no writes

```bash
node scripts/stripe-pull.mjs --dry-run
```

Should print your real lifetime revenue + MRR and stop there.

## 4. Add the near-live cron line

```bash
crontab -e
```

If `crontab -e` also crashes like nano did, use this non-interactive version
instead:

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * cd $HOME/swipefile && node scripts/stripe-pull.mjs >> .claude-data/stripe-cron.log 2>&1") | crontab -
```

That's idempotent-ish but can duplicate the line if run twice - check first:

```bash
crontab -l | grep stripe-pull
```

If it's already there, skip the line above.

## 5. Verify the cron is registered

```bash
crontab -l
```

You should see the `ads-cron.sh` line (already there) and the new
`stripe-pull.mjs` line every 5 minutes.

## 6. Watch it run

```bash
tail -f .claude-data/stripe-cron.log
```

Wait up to 5 minutes for the first automatic run, then Ctrl+C.

---

That's it. From here, every new Stripe payment shows up in the dashboard's
Revenue card within ~5 minutes, and if the dashboard tab is open when it
lands, it pops confetti live.
