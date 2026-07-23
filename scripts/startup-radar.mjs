// Startup radar -> Telegram. Once a day it sweeps a few free sources for news on
// the topics AND the people/companies on your watchlist, runs a Claude pass to filter
// hard for relevance, and pushes a clean, ranked digest to the phone. Curated
// shortlist in plain language, not a firehose.
//
// WHY: a live daily read on your market and the founders/companies you track,
// delivered before coffee. Configure via RADAR_TOPICS and RADAR_WATCHLIST.
//
//   node scripts/startup-radar.mjs             # real run (cron: once a day)
//   node scripts/startup-radar.mjs --dry-run   # fetch + summarize, send nothing
//   node scripts/startup-radar.mjs --no-llm    # just dump the raw items it found
//   node scripts/startup-radar.mjs --test-ping  # send a sample digest now
//
// SOURCES (all free, no key):
//   - Hacker News (Algolia) — Show HN, Ask HN, front page.
//   - Google News RSS — best for tracking named people and companies.
//   - Reddit (public .json, best-effort; often 403s, degrades quietly).
//   - Brave News (free tier) — ONLY if BRAVE_API_KEY is in .env. Optional.
//
// The Claude pass shells the same `claude` CLI health-monitor uses (no new deps)
// and summarizes ONLY the items handed to it (no tools, so it can't stall).
//
// Env (.env): TG_BOT_TOKEN, TG_CHAT_ID, RADAR_TOPICS, RADAR_WATCHLIST
//   (comma-separated); optional BRAVE_API_KEY, RADAR_MODEL, RADAR_CLAUDE_BIN,
//   RADAR_SUBREDDITS, RADAR_TZ (default UTC), RADAR_WINDOW_HOURS (default 36),
//   ANTHROPIC_API_KEY.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const DRY = process.argv.includes('--dry-run');
const NO_LLM = process.argv.includes('--no-llm');
const TEST_PING = process.argv.includes('--test-ping');

const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = process.env.TG_CHAT_ID;
const BRAVE_KEY = process.env.BRAVE_API_KEY;
const WINDOW_H = Number(process.env.RADAR_WINDOW_HOURS || 36);
const MODEL = process.env.RADAR_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const CLAUDE_BIN = process.env.RADAR_CLAUDE_BIN || "claude";
const LOG_PATH = path.resolve('.claude-data/startup-radar.log');

// ===========================================================================
// WHAT TO WATCH — comes from env, comma-separated.
// ===========================================================================
const splitList = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
// Topics you are tracking, e.g. RADAR_TOPICS="open source licensing,edge AI".
const TOPICS = splitList(process.env.RADAR_TOPICS);
// People and companies to track by name, e.g. RADAR_WATCHLIST="Jane Doe,Example Corp".
const WATCHLIST = splitList(process.env.RADAR_WATCHLIST);
// Optional subreddits to sweep, e.g. RADAR_SUBREDDITS="startups,selfhosted".
const SUBREDDITS = splitList(process.env.RADAR_SUBREDDITS);
if (!TOPICS.length && !WATCHLIST.length) {
  console.error("startup-radar: set RADAR_TOPICS and/or RADAR_WATCHLIST in .env (comma-separated lists of topics and people/companies to track). Nothing to sweep otherwise.");
  process.exit(1);
}
// ===========================================================================

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync('.claude-data', { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch { /* best-effort */ }
}

const UA = 'startup-radar/1.0 (personal news digest)';
const SENT_PATH = path.resolve('.claude-data/radar-last-sent.json');
const X_CACHE = path.resolve('.claude-data/x-cache.json');
const localDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.RADAR_TZ || "UTC" }).format(new Date());
const sinceSec = Math.floor((Date.now() - WINDOW_H * 3600 * 1000) / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

// ---- fetchers. Every one is best-effort: a dead source never kills the run. --
async function fetchHN(query) {
  try {
    const url =
      `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}` +
      `&tags=story&numericFilters=created_at_i>${sinceSec}&hitsPerPage=12`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HN ${res.status}`);
    const json = await res.json();
    return (json.hits || []).filter((h) => h.title).map((h) => ({
      source: 'HN',
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
      score: h.points || 0,
      comments: h.num_comments || 0,
    }));
  } catch (err) {
    log(`[radar] HN "${query}" failed: ${err.message}`);
    return [];
  }
}

// Google News RSS — no key, ideal for tracking named people/companies.
async function fetchNews(query, tag) {
  try {
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:2d')}` +
      `&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`gnews ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map((m) => {
      const b = m[1];
      const pick = (re) => decodeEntities((b.match(re) || [])[1] || '').trim();
      return {
        source: tag ? `News/${tag}` : 'News',
        title: pick(/<title>([\s\S]*?)<\/title>/),
        url: pick(/<link>([\s\S]*?)<\/link>/),
        publisher: pick(/<source[^>]*>([\s\S]*?)<\/source>/),
        score: null,
      };
    }).filter((x) => x.title && x.url);
  } catch (err) {
    log(`[radar] news "${query}" failed: ${err.message}`);
    return [];
  }
}

async function fetchReddit(sub) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=8`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`reddit ${res.status}`);
    const json = await res.json();
    return (json.data?.children || []).map((c) => ({
      source: `r/${sub}`,
      title: c.data.title,
      url: c.data.url_overridden_by_dest || `https://reddit.com${c.data.permalink}`,
      discuss: `https://reddit.com${c.data.permalink}`,
      score: c.data.score || 0,
      comments: c.data.num_comments || 0,
    }));
  } catch (err) {
    log(`[radar] reddit r/${sub} failed: ${err.message}`);
    return [];
  }
}

async function fetchBrave(query) {
  if (!BRAVE_KEY) return [];
  try {
    const url =
      `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}` +
      `&count=6&freshness=pw`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
    });
    if (!res.ok) throw new Error(`brave ${res.status}`);
    const json = await res.json();
    return (json.results || []).map((r) => ({
      source: 'Brave',
      title: r.title,
      url: r.url,
      desc: (r.description || '').replace(/<[^>]+>/g, '').slice(0, 180),
      score: null,
    }));
  } catch (err) {
    log(`[radar] brave "${query}" failed: ${err.message}`);
    return [];
  }
}

// X (Twitter) via API v2 recent search. Deliberately lean and quality-gated:
// two OR-queries built from the lists above, and only posts with real
// engagement (or from a real account) survive, so it pulls signal not slop.
// Usage-based: ~2 * X_MAX reads per run. Skipped entirely if no X_BEARER_TOKEN.
async function fetchX() {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) return [];
  // Save cash: pull X once per day, reuse the same posts for later runs (gm/refresh).
  // News, HN and Brave still refresh live; only the pricey X reads are cached.
  try {
    const c = JSON.parse(fs.readFileSync(X_CACHE, 'utf8'));
    if (c.day === localDay() && Array.isArray(c.items)) { log(`[radar] X cache hit (${c.items.length}, no reads spent)`); return c.items; }
  } catch { /* no cache yet */ }
  const minLikes = Number(process.env.X_MIN_LIKES || 20);
  const maxR = Math.min(Number(process.env.X_MAX || 15), 100);
  const build = (terms) =>
    `(${terms.map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(' OR ')}) -is:retweet -is:reply lang:en`;
  const queries = [build(WATCHLIST), build(TOPICS)];
  const out = [];
  for (const query of queries) {
    try {
      const url =
        `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}` +
        `&max_results=${maxR}&tweet.fields=public_metrics,created_at` +
        `&expansions=author_id&user.fields=username,name,public_metrics`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      if (!res.ok) { log(`[radar] X ${res.status}: ${(await res.text()).slice(0, 120)}`); continue; }
      const j = await res.json();
      const users = Object.fromEntries((j.includes?.users || []).map((u) => [u.id, u]));
      for (const t of j.data || []) {
        const u = users[t.author_id] || {};
        const likes = t.public_metrics?.like_count || 0;
        const followers = u.public_metrics?.followers_count || 0;
        if (likes < minLikes && followers < 10000) continue; // the anti-slop gate
        out.push({
          source: 'X',
          title: t.text.replace(/\s+/g, ' ').trim().slice(0, 240),
          url: `https://x.com/${u.username || 'i'}/status/${t.id}`,
          author: u.username ? `@${u.username}` : '',
          score: likes,
        });
      }
    } catch (err) { log(`[radar] X query failed: ${err.message}`); }
  }
  out.sort((a, b) => (b.score || 0) - (a.score || 0));
  const result = out.slice(0, Number(process.env.X_KEEP || 8)); // not much, just the good ones
  try { fs.writeFileSync(X_CACHE, JSON.stringify({ day: localDay(), ts: new Date().toISOString(), items: result })); }
  catch { /* best-effort */ }
  return result;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it.title) continue;
    const key = (it.url || it.title).replace(/[#?].*$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function gather() {
  const jobs = [
    // HN: topics + watchlist names.
    ...TOPICS.map(fetchHN),
    ...WATCHLIST.map(fetchHN),
    // Google News: topics + every watchlist name (this is the people feed).
    ...TOPICS.map((t) => fetchNews(t, 'topic')),
    ...WATCHLIST.map((p) => fetchNews(p, p)),
    // Reddit: best-effort, only if RADAR_SUBREDDITS is set.
    ...SUBREDDITS.map(fetchReddit),
  ];
  let items = (await Promise.all(jobs)).flat();

  // X posts: short real-people takes, quality-gated.
  items.push(...(await fetchX()));

  if (BRAVE_KEY) {
    for (const q of [...TOPICS, ...WATCHLIST]) {
      items.push(...(await fetchBrave(q)));
      await sleep(1100); // free tier is 1 req/sec
    }
  }

  items = dedupe(items);
  items.sort((a, b) => (b.score || 0) - (a.score || 0));
  return items.slice(0, 70);
}

// ---- the Claude filter pass ------------------------------------------------
async function summarize(items) {
  const feed = items.map((it, i) => {
    const who = it.author ? ` ${it.author}` : '';
    const meta = it.score != null ? ` [${it.score}${it.source === 'X' ? ' likes' : ' pts'}]` : '';
    const pub = it.publisher ? ` (${it.publisher})` : '';
    const extra = it.desc ? ` ${it.desc}` : '';
    const disc = it.discuss && it.discuss !== it.url ? `\n   discussion: ${it.discuss}` : '';
    return `${i + 1}. [${it.source}]${who}${meta}${pub} ${it.title}${extra}\n   link: ${it.url}${disc}`;
  }).join('\n');

  const prompt = `You are a scout for a founder tracking a specific space.

Their focus topics, in priority order:
${TOPICS.map((t) => '- ' + t).join('\n') || '- (none listed, judge by the watchlist below)'}

They are also tracking these people and companies by name. If any of them are in today's items, call that out:
${WATCHLIST.map((w) => '- ' + w).join('\n') || '- (none listed)'}

Below are today's items (last ${WINDOW_H} hours) from Hacker News, Google News, Reddit${BRAVE_KEY ? ", and Brave" : ""}. Work ONLY from these items. Do not use any tools.

Pick the 4 to 7 that actually matter to them and write a short Telegram message.

Write it like you are explaining to a smart friend who does not follow this space. Super simple. Rules for the writing:
- Plain, short sentences. A 12 year old should get it. Easy to read on a phone in five seconds.
- NEVER use em dashes or en dashes. No " - " as a connector either. Use periods and commas.
- No jargon without a plain-words explanation. If you use a term like "E2E" or "VPN", explain it in a few words the first time (e.g. "a VPN, which hides what sites you visit").
- No AI-slop or corporate words: no "delve", "leverage", "boost", "game-changer", "landscape", "in a world where", "villain origin story", no forced metaphors, no hype adjectives.
- For each pick, in this order:
  1) One short line saying WHAT the thing is, like the friend has never heard of it (e.g. "Acme is a company that makes password managers."). You can skip this one line only if it is something obviously famous.
  2) One line: what just happened, in simple words.
  3) One short line: why it matters to what they are building.
  4) The link on its own line as "link: <url>". If it is a Hacker News or Reddit item and a discussion link is given, add "discussion: <url>" on the next line.
- Give the real direct link to the post. Never invent a link.
- Items marked [X] are short posts from real people on X (Twitter). Treat them as someone's take or opinion, and name the handle (like "@handle on X:"). They are good for the mood and for spotting what people actually care about right now.
- Prefer solid, real signal over noise. Skip anything that is an ad, a "best VPN deals" listicle, giveaway spam, or empty hot takes with nothing behind them.
- Put anything about a watchlist person/company or a priority topic at the top.
- If nothing is genuinely relevant today, say that in one honest line instead of padding.

End with ONE short line of encouragement in a casual lowercase voice. No em dashes there either.

Keep the whole message under about 1500 characters. Start it with this exact line:
startup radar

ITEMS:
${feed}`;

  const { stdout } = await execFileP(
    CLAUDE_BIN,
    ['-p', prompt, '--model', MODEL, '--permission-mode', 'dontAsk'],
    { timeout: Number(process.env.RADAR_TIMEOUT_MS || 180000), maxBuffer: 4 * 1024 * 1024 }
  );
  // Belt and suspenders: strip any dashes the model slips in anyway.
  return (stdout || '').trim().replace(/\s[—–]\s/g, '. ').replace(/[—–]/g, ',');
}

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

// Turn the model's plain "link: <url>" / "discussion: <url>" lines into clean
// tappable HTML links, so a 300-char Google News redirect shows as just "read".
// Everything else is HTML-escaped so Telegram HTML mode renders it safely.
function fmtTelegram(text) {
  return text.split('\n').map((line) => {
    const m = line.match(/^(\s*)(link|discussion)\s*:\s*(\S+)\s*$/i);
    if (m) {
      const isDisc = m[2].toLowerCase() === 'discussion';
      return `${m[1]}${isDisc ? '💬 ' : '🔗 '}<a href="${escAttr(m[3])}">${isDisc ? 'discussion' : 'read'}</a>`;
    }
    return escText(line);
  }).join('\n');
}

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { log(`[radar] (tg not armed) would push:\n${text}`); return; }
  if (DRY) { log(`[radar] (dry-run) would push:\n${text}\n---`); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // HTML mode renders links as clean "read" anchors; previews ON for the top link.
      body: JSON.stringify({ chat_id: TG_CHAT, text: fmtTelegram(text), parse_mode: 'HTML' }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log('[radar] telegram pushed');
  } catch (err) { log(`[radar] TELEGRAM FAILED (${err.message})`); }
}

// ---- main ------------------------------------------------------------------
async function main() {
  if (TEST_PING) {
    await sendTelegram(
      `startup radar. sample\n\n` +
      `Example Corp ships a big update in your space. right in the middle of your thesis.\n` +
      `link: https://news.google.com\n\n` +
      `Show HN: open source E2E messenger hits the front page. worth a look at what they left out.\n` +
      `link: https://news.ycombinator.com\n` +
      `discussion: https://news.ycombinator.com\n\n` +
      `test ping. if you can read this the radar reaches your phone. lets go`
    );
    log('[radar] test ping done');
    return;
  }

  const items = await gather();
  log(`[radar] gathered ${items.length} items (brave ${BRAVE_KEY ? 'on' : 'off'}, x ${process.env.X_BEARER_TOKEN ? 'on' : 'off'})`);

  if (NO_LLM) {
    for (const it of items) console.log(`[${it.source}] ${it.title}\n   ${it.url}`);
    return;
  }
  if (!items.length) { log('[radar] nothing gathered, staying silent'); return; }

  let digest;
  try {
    digest = await summarize(items);
  } catch (err) {
    log(`[radar] summarize failed: ${err.message}`);
    return;
  }
  if (!digest) { log('[radar] empty digest, staying silent'); return; }

  await sendTelegram(digest);
  log(`[radar] sent digest (${digest.length} chars)`);
  // Leave a "sent today" marker so the gm listener knows not to double-send.
  if (!DRY) {
    try { fs.writeFileSync(SENT_PATH, JSON.stringify({ day: localDay(), ts: new Date().toISOString() })); }
    catch { /* best-effort */ }
  }
}

main().catch((err) => {
  log(`[radar] cycle error: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
