// Find the business/contact email for scraped creator leads (creator_leads
// rows without an email yet). No Instagram scraping here either - creators
// in this space publish a collab email on purpose, and it shows up on the
// open web. Per lead, cheapest source first:
//
//   1. the bio snippet we already stored (free)
//   2. their link-in-bio page: linktr.ee/<handle>, beacons.ai/<handle> (free)
//   3. one Brave search: "<handle>" instagram email - snippets, plus the top
//      non-Instagram result pages (personal site, press page) fetched and
//      scanned (1 Brave query per lead)
//
// Every attempt stamps email_checked_at so a lead is only ever tried once;
// found emails record where they came from in email_source.
//
// Usage:
//   node scripts/scrape-emails.mjs               # up to 25 unchecked leads
//   node scripts/scrape-emails.mjs --limit 50
//   node scripts/scrape-emails.mjs --handle somecreator   # force one lead
//
// Needs in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, BRAVE_API_KEY.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Tiny .env loader (no dotenv dep).
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const braveKey = process.env.BRAVE_API_KEY;
if (!url || !key || !braveKey) {
  console.error('Missing env. Need VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY and BRAVE_API_KEY in .env.');
  process.exit(1);
}
const sb = createClient(url, key);

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) || 25 : 25;
const onlyHandle = args.includes('--handle') ? args[args.indexOf('--handle') + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------- email extraction --------------------------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Domains that show up in page source but are never a person's contact.
const JUNK_DOMAINS = /(instagram\.com|facebook\.com|example\.|sentry\.|wixpress|schema\.org|w3\.org|googleapis|gstatic|cloudfront|akamai|.*\.(png|jpe?g|gif|webp|svg|css|js)$)/i;

function emailsIn(text) {
  const seen = new Set();
  for (const m of (text || '').match(EMAIL_RE) || []) {
    const email = m.toLowerCase().replace(/^\d+x/, ''); // strip "2x" image-prefix artifacts
    const domain = email.split('@')[1] || '';
    if (JUNK_DOMAINS.test(domain) || JUNK_DOMAINS.test(email)) continue;
    if (email.length > 60) continue;
    seen.add(email);
  }
  return [...seen];
}

// When a page yields several addresses, prefer one that looks like the
// creator (handle fragment in it), else the first.
function pickEmail(emails, handle) {
  if (!emails.length) return null;
  const frag = handle.replace(/[._]/g, '').slice(0, 8);
  return emails.find((e) => e.replace(/[._]/g, '').includes(frag)) || emails[0];
}

// ----------------------------- fetchers ------------------------------
async function fetchText(pageUrl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return '';
    return (await res.text()).slice(0, 500_000);
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

async function braveSearch(query) {
  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', query);
  u.searchParams.set('count', '10');
  const res = await fetch(u, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
  });
  if (!res.ok) throw new Error(`Brave API ${res.status}`);
  return (await res.json())?.web?.results || [];
}

// --------------------------- per-lead hunt ---------------------------
async function findEmail(lead) {
  // 1. Free: the bio snippet we already have.
  const fromBio = pickEmail(emailsIn(lead.bio), lead.handle);
  if (fromBio) return { email: fromBio, source: 'bio-snippet' };

  // 2. Free: the usual link-in-bio pages under the same handle.
  for (const linkUrl of [`https://linktr.ee/${lead.handle}`, `https://beacons.ai/${lead.handle}`]) {
    const html = await fetchText(linkUrl);
    const found = pickEmail(emailsIn(html), lead.handle);
    if (found) return { email: found, source: new URL(linkUrl).hostname };
  }

  // 3. One Brave query: snippets first, then the top non-Instagram pages.
  let results = [];
  try {
    results = await braveSearch(`"${lead.handle}" instagram email contact`);
  } catch (e) {
    console.error(`  brave failed for ${lead.handle}: ${e.message}`);
  }
  const snippetText = results.map((r) => `${r.title || ''} ${r.description || ''}`).join(' ');
  const fromSnippets = pickEmail(emailsIn(snippetText), lead.handle);
  if (fromSnippets) return { email: fromSnippets, source: 'search-snippet' };

  const candidatePages = results
    .map((r) => r.url)
    .filter((u2) => u2 && !/instagram\.com|facebook\.com|tiktok\.com|youtube\.com|pinterest\./i.test(u2))
    .slice(0, 2);
  for (const pageUrl of candidatePages) {
    const html = await fetchText(pageUrl);
    const found = pickEmail(emailsIn(html), lead.handle);
    if (found) {
      try {
        return { email: found, source: new URL(pageUrl).hostname };
      } catch {
        return { email: found, source: 'web' };
      }
    }
  }
  return null;
}

// ------------------------------- run ---------------------------------
let q = sb
  .from('creator_leads')
  .select('id, handle, bio')
  .is('email', null)
  .is('email_checked_at', null)
  .neq('status', 'dismissed')
  .order('created_at', { ascending: false })
  .limit(limit);
if (onlyHandle) {
  q = sb.from('creator_leads').select('id, handle, bio').eq('handle', onlyHandle.replace(/^@/, '').toLowerCase());
}
const { data: leads, error } = await q;
if (error) {
  if (/email/.test(error.message)) {
    console.error('creator_leads has no email columns yet - run supabase-migration-14.sql first.');
    process.exit(1);
  }
  console.error(error.message);
  process.exit(1);
}
if (!leads?.length) {
  console.log('No unchecked leads.');
  process.exit(0);
}

let found = 0;
for (const lead of leads) {
  const hit = await findEmail(lead);
  await sb
    .from('creator_leads')
    .update({
      email: hit?.email || null,
      email_source: hit?.source || null,
      email_checked_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
  if (hit) found++;
  console.log(`  @${lead.handle} -> ${hit ? `${hit.email} (${hit.source})` : 'not found'}`);
  await sleep(1100); // Brave free plan: 1 request/second
}
console.log(`Emails: ${found} found for ${leads.length} leads checked.`);
