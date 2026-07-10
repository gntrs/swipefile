// Create (or fix up) the team's Supabase accounts + team profile rows.
// Passwords are generated at runtime and printed to the console ONLY - they
// are never written to disk. Supabase stores just a bcrypt hash.
//
// Usage:  node scripts/create-users.mjs                 # create missing users
//         node scripts/create-users.mjs --reset-pass a@b.com   # new temp pass
// Needs in .env:  VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY  (service_role,
// local only, gitignored - same as scripts/export.mjs).
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// The roster - edit this to your own team. nickname null = the app's welcome
// popup asks them to pick one (and to set their own password) on first open.
const ROSTER = [
  { email: 'admin@example.com', nickname: 'Admin', role: 'admin' },
  { email: 'teammate@example.com', nickname: null, role: 'member' },
];

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
if (!url || !key) {
  console.error('Missing env. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.');
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
  const found = existing.get(member.email.toLowerCase());
  let id = found?.id;
  let printed = '';

  if (!found) {
    const pass = tempPass();
    const { data, error } = await sb.auth.admin.createUser({
      email: member.email,
      password: pass,
      email_confirm: true,
    });
    if (error) throw new Error(`${member.email}: ${error.message}`);
    id = data.user.id;
    printed = `created - temp password: ${pass}`;
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
  const row = { id, email: member.email, role: member.role };
  if (member.nickname) row.nickname = member.nickname;
  const { error: teamErr } = await sb.from('team').upsert(row, { onConflict: 'id' });
  if (teamErr) throw new Error(`team row for ${member.email}: ${teamErr.message}`);

  console.log(`${member.email}  (${member.role})  ${printed}`);
}

console.log('\nDone. Temp passwords above are shown once - pass them on privately.');
