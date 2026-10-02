// Argument parsing for scripts/create-users.mjs, kept apart so it can be
// tested without touching a database. Pure: returns what to do, or an error.

export const USAGE = [
  'Usage:',
  "  node scripts/create-users.mjs --email you@example.com --password 'at least 8 chars' [--role admin|member] [--nickname Name]",
  '  node scripts/create-users.mjs users.json [--reset-pass a@b.com]',
  '',
  'users.json format: [{"email":"...","password":"...","nickname":"...","role":"admin|member"}]',
  'Leave out --password to get a temporary one, printed once.',
].join('\n');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALUE_FLAGS = new Set(['--email', '--password', '--role', '--nickname', '--reset-pass']);
export const MIN_PASSWORD = 8;

// -> { mode: 'single', member, resetEmails: [] }
//  | { mode: 'roster', rosterPath, resetEmails }
//  | { error: 'one line', usage: boolean }
export function parseArgs(argv) {
  const args = [...argv];
  if (args.length === 0) return { error: 'No arguments.', usage: true };

  const values = {};
  const resetEmails = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
      if (!VALUE_FLAGS.has(flag)) return { error: `Unknown option ${flag}.`, usage: true };
      const value = inline !== undefined ? inline : args[++i];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        return { error: `${flag} needs a value.`, usage: false };
      }
      if (flag === '--reset-pass') resetEmails.push(value);
      else values[flag.slice(2)] = value;
    } else {
      positional.push(a);
    }
  }

  if (positional.length > 1) return { error: `One roster file at most, got ${positional.length}.`, usage: false };
  const rosterPath = positional[0];

  if (rosterPath && values.email !== undefined) {
    return { error: 'Use either a roster file or --email, not both.', usage: false };
  }

  if (rosterPath) {
    const stray = ['password', 'role', 'nickname'].filter((k) => values[k] !== undefined);
    if (stray.length) return { error: `--${stray[0]} only goes with --email. Put it in the roster file instead.`, usage: false };
    return { mode: 'roster', rosterPath, resetEmails };
  }

  if (values.email === undefined) {
    return { error: 'Pass --email for one account, or a roster file for several.', usage: true };
  }
  const email = values.email.trim();
  if (!EMAIL.test(email)) return { error: `--email "${email}" does not look like an email address.`, usage: false };
  if (values.password !== undefined && values.password.length < MIN_PASSWORD) {
    return { error: `--password must be at least ${MIN_PASSWORD} characters.`, usage: false };
  }
  const role = values.role === undefined ? 'member' : values.role;
  if (role !== 'admin' && role !== 'member') return { error: `--role must be admin or member, not "${role}".`, usage: false };
  if (resetEmails.length) return { error: '--reset-pass only goes with a roster file.', usage: false };

  const member = { email, role };
  if (values.password !== undefined) member.password = values.password;
  if (values.nickname !== undefined && values.nickname.trim()) member.nickname = values.nickname.trim();
  return { mode: 'single', member, resetEmails: [] };
}
