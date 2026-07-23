// Pull the meaningful PostHog numbers into .claude-data/posthog.json so
// Claude Code can read them next to the database export (same pattern as
// scripts/export.mjs: local only, gitignored, no deps).
//
// Usage:  node scripts/posthog-pull.mjs [--days N]   (default 30)
//
// Needs in .env:
//   POSTHOG_API_KEY      personal API key with Query Read scope
//                        (eu.posthog.com -> avatar -> Settings ->
//                         Personal API Keys -> create; local only, gitignored)
//   POSTHOG_PROJECT_ID   required - your PostHog project id (in the project URL)
//   POSTHOG_HOST         optional, defaults to https://eu.posthog.com
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

const key = process.env.POSTHOG_API_KEY;
const project = process.env.POSTHOG_PROJECT_ID;
if (!project) {
  console.error('Missing POSTHOG_PROJECT_ID in .env (your PostHog project id, found in the project URL).');
  process.exit(1);
}
const host = (process.env.POSTHOG_HOST || 'https://eu.posthog.com').replace(/\/$/, '');
if (!key) {
  console.error(
    'Missing POSTHOG_API_KEY in .env.\n' +
      'Create one at eu.posthog.com -> avatar (bottom left) -> Settings ->\n' +
      'Personal API Keys -> New key with the Query Read scope.\n' +
      'It stays local (gitignored), same as the other keys.'
  );
  process.exit(1);
}

const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Math.max(1, Number(process.argv[daysArg + 1]) || 30) : 30;

async function hogql(query) {
  const res = await fetch(`${host}/api/projects/${project}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostHog ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  // Rows come back as arrays; zip them with the column names.
  const cols = json.columns || [];
  return (json.results || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

const since = `now() - interval ${days} day`;
// Plumbing events that would drown the real signal.
const NOISE = `('$pageleave','$autocapture','$$heatmap','$web_vitals','$set','$identify','$feature_flag_called','$groupidentify')`;

console.log(`Pulling ${days} days from PostHog project ${project}...`);

const [event_totals, daily_traffic, top_pages, sources, custom_events_daily, entry_pages] =
  await Promise.all([
    // What events exist and how often they fire (conversions live here).
    hogql(`
      select event, count() as total, count(distinct person_id) as people
      from events
      where timestamp >= ${since} and event not in ${NOISE}
      group by event order by total desc limit 50
    `),
    // Traffic per day.
    hogql(`
      select toDate(timestamp) as day,
             count() as pageviews,
             count(distinct person_id) as visitors
      from events
      where event = '$pageview' and timestamp >= ${since}
      group by day order by day
    `),
    // Where people actually go.
    hogql(`
      select properties.$pathname as path,
             count() as views,
             count(distinct person_id) as visitors
      from events
      where event = '$pageview' and timestamp >= ${since}
      group by path order by views desc limit 25
    `),
    // Where they come from (utm first, referrer as fallback). Paid ads should
    // show up here - if they do not, the ads are not tagged or not clicked.
    hogql(`
      select coalesce(nullif(properties.utm_source, ''), nullif(properties.$referring_domain, ''), 'direct') as source,
             coalesce(nullif(properties.utm_campaign, ''), '-') as campaign,
             count() as views,
             count(distinct person_id) as visitors
      from events
      where event = '$pageview' and timestamp >= ${since}
      group by source, campaign order by views desc limit 30
    `),
    // Custom (non-pageview) events per day - signups, clicks, whatever the
    // site tracks. This is the conversion trail.
    hogql(`
      select toDate(timestamp) as day, event, count() as total
      from events
      where timestamp >= ${since}
        and event not in ${NOISE} and event != '$pageview'
      group by day, event order by day desc, total desc limit 400
    `),
    // First page of each session = what the ad traffic lands on.
    hogql(`
      select properties.$entry_pathname as entry_path,
             count(distinct properties.$session_id) as sessions
      from events
      where event = '$pageview' and timestamp >= ${since}
        and properties.$entry_pathname is not null
      group by entry_path order by sessions desc limit 20
    `),
  ]);

const out = {
  pulled_at: new Date().toISOString(),
  host,
  project_id: project,
  window_days: days,
  event_totals,
  daily_traffic,
  top_pages,
  sources,
  custom_events_daily,
  entry_pages,
};

fs.mkdirSync('.claude-data', { recursive: true });
fs.writeFileSync('.claude-data/posthog.json', JSON.stringify(out, null, 2));

const views = daily_traffic.reduce((s, d) => s + Number(d.pageviews || 0), 0);
const customs = event_totals.filter((e) => !String(e.event).startsWith('$'));
console.log(
  `Pulled ${views} pageviews over ${days} days, ` +
    `${event_totals.length} event types (${customs.length} custom), ` +
    `${sources.length} traffic sources -> .claude-data/posthog.json`
);
if (customs.length === 0) {
  console.log(
    'Heads up: no custom events found - only pageviews. If signups are not' +
      ' tracked as an event, conversion analysis stops at the landing page.'
  );
}
