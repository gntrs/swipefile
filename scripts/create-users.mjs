// Create (or fix up) the team's auth accounts + team profile rows.
// Passwords come from the roster file, or are generated at runtime and printed
// to the console ONLY - they are never written to disk. The database stores
// just a bcrypt hash.
//
// Usage:  node scripts/create-users.mjs users.json            # create missing users
//         node scripts/create-users.mjs users.json --reset-pass a@b.com   # new temp pass
//
// users.json is a JSON array of team members:
//   [{ "email": "a@b.com", "password": "optional", "nickname": "optional", "role": "admin|member" }]
//   - password omitted -> a temp password is generated and printed once
//   - nickname omitted/null -> the app's welcome popup asks them to pick one
//     (and to set their own password) on first open
//   - role omitted -> "member"
//
// Needs in .env:  VITE_DB_URL, DB_SERVICE_KEY  (service_role,
// local only, gitignored - same as scripts/export.mjs).
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Roster file = first CLI arg that isn't a flag or a flag's value.
const args = process.argv.slice(2);
const rosterPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--reset-pass');
if (!rosterPath) {
  console.error('Usage: node scripts/create-users.mjs users.json [--reset-pass a@b.com]');
  console.error('users.json format: [{"email":"...","password":"...","nickname":"...","role":"admin|member"}]');
  process.exit(1);
}
let ROSTER;
try {
  ROSTER = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), rosterPath), 'utf8'));
} catch (e) {
  console.error(`Could not read roster file "${rosterPath}": ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(ROSTER) || ROSTER.some((m) => !m || typeof m.email !== 'string')) {
  console.error('Roster must be a JSON array of objects, each with at least an "email" field.');
  process.exit(1);
}

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
  console.error('Missing env. Need VITE_DB_URL and DB_SERVICE_KEY in .env.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const WORDS = ['Coral', 'Mint', 'Cream', 'Sunny', 'Brave', 'Swift', 'Amber', 'Cedar', 'Maple', 'River', 'Stone', 'Cloud', 'Ember', 'Frost', 'Petal', 'Tidal', 'Vivid', 'Zesty', 'Noble', 'Lively'];
const tempPass = () =>
  `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 9999)}!`;

const resetEmails = process.argv
  .flatMap((a, i) => (a === '--reset-pass' ? [process.argv[i + 1]] : []))
  .filter(Boolean);

// Fetch existing users once (small team, one page is plenty).
const { data: page, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const existing = new Map(page.users.map((u) => [u.email?.toLowerCase(), u]));

for (const member of ROSTER) {
  const role = member.role || 'member';
  const found = existing.get(member.email.toLowerCase());
  let id = found?.id;
  let printed = '';

  if (!found) {
    const pass = member.password || tempPass();
    const { data, error } = await sb.auth.admin.createUser({
      email: member.email,
      password: pass,
      email_confirm: true,
    });
    if (error) throw new Error(`${member.email}: ${error.message}`);
    id = data.user.id;
    printed = member.password ? 'created with roster password' : `created - temp password: ${pass}`;
  } else if (resetEmails.includes(member.email)) {
    const pass = tempPass();
    const { error } = await sb.auth.admin.updateUserById(id, { password: pass });
    if (error) throw new Error(`${member.email}: ${error.message}`);
    printed = `password reset - new password: ${pass}`;
  } else {
    printed = 'already exists - left untouched';
  }

  // Profile row: seed email/role always, nickname only if the roster has one
  // (never overwrite a nickname the member picked themselves).
  const row = { id, email: member.email, role };
  if (member.nickname) row.nickname = member.nickname;
  const { error: teamErr } = await sb.from('team').upsert(row, { onConflict: 'id' });
  if (teamErr) throw new Error(`team row for ${member.email}: ${teamErr.message}`);

  console.log(`${member.email}  (${role})  ${printed}`);
}

console.log('\nDone. Temp passwords above are shown once - pass them on privately.');
