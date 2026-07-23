// Bulk-move scraped creators (creator_leads status 'new') into the outreach
// log, grouped by follower tier - for kicking off an email campaign without
// tapping "add to outreach" fifty times. Leads flip to 'outreached'.
//
// Usage:  node scripts/bulk-add-outreach.mjs                 # add all new leads
//         node scripts/bulk-add-outreach.mjs --dry-run       # print, no writes
//         node scripts/bulk-add-outreach.mjs --status sent   # outreach status
//                                                            # (default 'sent';
//                                                            # any of sent|followup|replied|deal|dead)
// Needs in .env: VITE_DB_URL, DB_SERVICE_KEY.
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

const url = (process.env.VITE_DB_URL || process.env.VITE_SUPABASE_URL);
const key = (process.env.DB_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY);
if (!url || !key) {
  console.error('Missing VITE_DB_URL or DB_SERVICE_KEY in .env');
  process.exit(1);
}
const sb = createClient(url, key);

const dryRun = process.argv.includes('--dry-run');
const status = process.argv.flatMap((a, i) => (a === '--status' ? [process.argv[i + 1]] : []))[0] || 'sent';
if (!['sent', 'followup', 'replied', 'deal', 'dead'].includes(status)) {
  console.error(`Bad --status "${status}". One of: sent, followup, replied, deal, dead.`);
  process.exit(1);
}

const { data: leads, error: leadsError } = await sb
  .from('creator_leads')
  .select('*')
  .eq('status', 'new')
  .order('followers', { ascending: false, nullsFirst: false });
if (leadsError) {
  console.error('Error:', leadsError.message);
  process.exit(1);
}
if (!leads?.length) {
  console.log('No new creator leads to add.');
  process.exit(0);
}

// Group by tier so the log reads like the pricing bands.
const tiers = {};
for (const lead of leads) (tiers[lead.tier || 'unknown'] ||= []).push(lead);

let added = 0;
for (const [tier, tierLeads] of Object.entries(tiers)) {
  console.log(`\n[${tier.toUpperCase()}] ${tierLeads.length} creators:`);
  for (const lead of tierLeads) {
    const row = {
      creator: lead.name ? `${lead.name} (@${lead.handle})` : `@${lead.handle}`,
      platform: 'email',
      status,
      link: lead.url,
      notes: [
        lead.followers ? `${lead.followers.toLocaleString()} followers` : 'followers unknown',
        lead.email && `email: ${lead.email}`,
        lead.source_query,
      ]
        .filter(Boolean)
        .join(' | '),
      added_by_email: 'claude@analysis',
    };
    if (dryRun) {
      console.log(`  ~ ${row.creator} (${lead.followers ?? '?'} followers${lead.email ? `, ${lead.email}` : ''})`);
      added++;
      continue;
    }
    const { error } = await sb.from('outreach').insert(row);
    if (error) {
      console.error(`  x ${lead.handle}: ${error.message}`);
      continue;
    }
    await sb.from('creator_leads').update({ status: 'outreached' }).eq('id', lead.id);
    console.log(`  + ${row.creator} (${lead.followers ?? '?'} followers)`);
    added++;
  }
}

console.log(`\nDone${dryRun ? ' (dry run)' : ''}: ${added}/${leads.length} creators ${dryRun ? 'would move' : 'moved'} to outreach as "${status}".`);
