// Claude's line into the team chat (chat_messages + chat_reactions tables).
//
//   node scripts/chat.mjs "short message"       post as Claude (@name tags resolve, see below)
//   node scripts/chat.mjs --read [N]            print the last N messages (default 30)
//   node scripts/chat.mjs --mentions [N]         print the last N messages that @mention Claude
//   node scripts/chat.mjs --react <n> <emoji>    react to the n-th newest message
//                                                (1 = newest; toggles off if already set)
//
// Posts show up as "Claude" in the dashboard chat (realtime, so instantly).
// Keep messages short and straight to the point - it is a ping board, not a
// place for essays. Long stuff belongs in a brief (scripts/add-brief.mjs).
//
// @mentions: write @nickname in the message body (e.g. "@alex check
// this") and it resolves against the team table the same way the dashboard's
// compose box does, so that person's chat highlights the message for them.
// There's no background process watching this table (by design - see
// no-cron-ai-digests in memory), so tags aimed at Claude aren't pushed to a
// running session automatically. Check --mentions at the start of a session,
// or whenever the user says they tagged you, to see what's waiting.
//
// Needs in .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing env. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const CLAUDE_EMAIL = 'claude@analysis';
const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Same resolution the dashboard's compose box uses: @slug -> email, where
// slug is the nickname (or email local-part) with punctuation stripped.
// Keeps the two @mention implementations in agreement without sharing code
// across a Node script and a React app.
async function resolveMentions(body) {
  const { data: team } = await sb.from('team').select('email, nickname');
  const people = [
    { email: CLAUDE_EMAIL, label: 'Claude' },
    ...(team || []).map((m) => ({ email: m.email, label: m.nickname?.trim() || m.email.split('@')[0] })),
  ];
  const bySlug = new Map();
  const used = new Set();
  for (const p of people) {
    let slug = slugify(p.label) || slugify(p.email.split('@')[0]);
    let unique = slug;
    let i = 2;
    while (used.has(unique)) unique = `${slug}${i++}`;
    used.add(unique);
    bySlug.set(unique, p.email);
  }
  const emails = new Set();
  for (const m of body.matchAll(/@([a-z0-9]+)/gi)) {
    const email = bySlug.get(m[1].toLowerCase());
    if (email) emails.add(email);
  }
  return [...emails];
}

const args = process.argv.slice(2);

if (args[0] === '--read' || args[0] === '--mentions') {
  const onlyMentions = args[0] === '--mentions';
  const n = Math.min(Math.max(Number(args[1]) || 30, 1), 200);
  let query = sb.from('chat_messages').select('id, author_email, body, mentions, created_at');
  if (onlyMentions) query = query.contains('mentions', [CLAUDE_EMAIL]);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(n);
  if (error) {
    console.error(error.message);
    if (onlyMentions && /column .*mentions/i.test(error.message)) {
      console.error('Run supabase-migration-11.sql to add the mentions column.');
    }
    process.exit(1);
  }
  const msgs = data || [];
  if (onlyMentions && msgs.length === 0) {
    console.log('No mentions of Claude found.');
    process.exit(0);
  }
  // Reactions per message (table may not exist before migration 10).
  const { data: reacts } = await sb
    .from('chat_reactions')
    .select('message_id, emoji')
    .in('message_id', msgs.map((m) => m.id));
  const per = new Map();
  for (const r of reacts || []) {
    const m = per.get(r.message_id) || new Map();
    m.set(r.emoji, (m.get(r.emoji) || 0) + 1);
    per.set(r.message_id, m);
  }
  msgs.reverse().forEach((m, i) => {
    const who = m.author_email === CLAUDE_EMAIL ? 'Claude' : m.author_email;
    const rx = per.has(m.id)
      ? '  [' + [...per.get(m.id).entries()].map(([e, c]) => `${e}${c}`).join(' ') + ']'
      : '';
    // #index counts from newest = 1, for --react.
    console.log(`#${msgs.length - i} [${m.created_at.slice(0, 16).replace('T', ' ')}] ${who}: ${m.body}${rx}`);
  });
  process.exit(0);
}

if (args[0] === '--react') {
  const n = Math.max(Number(args[1]) || 1, 1);
  const emoji = args[2];
  if (!emoji) {
    console.error('Usage: node scripts/chat.mjs --react <n> <emoji>   (n: 1 = newest message)');
    process.exit(1);
  }
  const { data: msgs, error } = await sb
    .from('chat_messages')
    .select('id, author_email, body')
    .order('created_at', { ascending: false })
    .limit(n);
  if (error || !msgs?.[n - 1]) {
    console.error(error?.message || `No message #${n}.`);
    process.exit(1);
  }
  const target = msgs[n - 1];
  const mine = { message_id: target.id, emoji, author_email: CLAUDE_EMAIL };
  const { error: insErr } = await sb.from('chat_reactions').insert(mine);
  if (insErr && /duplicate/i.test(insErr.message)) {
    await sb.from('chat_reactions').delete().match(mine);
    console.log(`Removed ${emoji} from: ${target.body.slice(0, 60)}`);
  } else if (insErr) {
    console.error(`React failed: ${insErr.message}`);
    process.exit(1);
  } else {
    console.log(`Reacted ${emoji} to: ${target.body.slice(0, 60)}`);
  }
  process.exit(0);
}

const body = args.join(' ').trim();
if (!body) {
  console.error('Usage: node scripts/chat.mjs "message"  |  node scripts/chat.mjs --read [N]  |  node scripts/chat.mjs --mentions [N]');
  process.exit(1);
}
if (body.length > 500) {
  console.error('Too long for chat (max 500 chars). Put it in a brief instead.');
  process.exit(1);
}
const mentions = await resolveMentions(body);
let { error } = await sb.from('chat_messages').insert({ body, author_email: CLAUDE_EMAIL, mentions });
if (error && /could not find the .*mentions.* column/i.test(error.message)) {
  // supabase-migration-11.sql not run yet - send without @mention data.
  ({ error } = await sb.from('chat_messages').insert({ body, author_email: CLAUDE_EMAIL }));
}
if (error) {
  console.error(`Send failed: ${error.message}`);
  process.exit(1);
}
console.log('Sent.' + (mentions.length ? ` (tagged: ${mentions.join(', ')})` : ''));
