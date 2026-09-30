# Running the Stripe revenue pull on WSL

One time setup so the overview's revenue card (the `ops` module) stays near live. Run these inside your WSL terminal, in the `swipefile` repo folder. docs/SETUP.md has the full scheduling guide.

## 1. Pull the latest code

```bash
cd ~/swipefile
git pull
```

## 2. Confirm the Stripe key is in the WSL `.env`

```bash
grep -q '^STRIPE_API_KEY=' .env && echo "key is set" || echo "missing: add it"
```

If it is missing, add the line without an interactive editor:

```bash
echo 'STRIPE_API_KEY=your-restricted-read-only-key' >> .env
```

## 3. Test it once, no writes

```bash
node scripts/stripe-pull.mjs --dry-run
```

It prints your lifetime revenue and MRR and stops there.

## 4. Add the cron line

```bash
crontab -e
```

If the editor does not open, add the line without one:

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * cd $HOME/swipefile && node scripts/stripe-pull.mjs >> /tmp/stripe-pull.log 2>&1") | crontab -
```

Running that twice adds the line twice, so check first:

```bash
crontab -l | grep stripe-pull
```

If it is already there, skip the line above.

## 5. Verify the cron is registered

```bash
crontab -l
```

You should see the `stripe-pull.mjs` line, every 5 minutes.

## 6. Watch it run

```bash
tail -f /tmp/stripe-pull.log
```

Wait up to 5 minutes for the first automatic run, then Ctrl+C.

From then on, a new Stripe payment shows up in the Revenue card within about 5 minutes. Cron in WSL only runs while WSL is running.
