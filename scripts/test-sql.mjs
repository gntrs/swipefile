#!/usr/bin/env node
// SQL tests for db-setup.sql on a plain local Postgres.
//
// Creates a throwaway database, loads test/sql/shim.sql (a stand in for the
// Supabase roles, auth and storage schemas), runs db-setup.sql twice to prove
// it is idempotent, then runs every test/sql/*.test.sql in name order. The
// database is always dropped at the end.
//
// Env:
//   PGHOST      default 127.0.0.1. Only 127.0.0.1, localhost or ::1 are accepted.
//   PGPORT      default 5432
//   PGUSER      default postgres
//   PGPASSWORD  optional
//   DATABASE_URL must NOT be set: this script never runs against a remote database.
//
// Local run (needs psql and a local server you can throw away):
//   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres node scripts/test-sql.mjs
//   or: npm run test:sql
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const host = process.env.PGHOST || '127.0.0.1';
const port = process.env.PGPORT || '5432';
const user = process.env.PGUSER || 'postgres';

if (process.env.DATABASE_URL) {
  console.error('test-sql: DATABASE_URL is set. Unset it: this script only runs against a local Postgres.');
  process.exit(2);
}
if (!LOCAL_HOSTS.has(host)) {
  console.error(`test-sql: refusing PGHOST=${host}. Use 127.0.0.1, localhost or ::1.`);
  process.exit(2);
}

const env = { ...process.env, PGHOST: host, PGPORT: port, PGUSER: user };
const dbName = `swipefile_test_${process.pid}`;

function psql(args) {
  const r = spawnSync('psql', ['-X', '-q', ...args], { env, encoding: 'utf8' });
  if (r.error) return { ok: false, out: '', err: r.error.message };
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '' };
}

const files = [
  join(ROOT, 'test/sql/shim.sql'),
  join(ROOT, 'db-setup.sql'),
  join(ROOT, 'db-setup.sql'),
  ...readdirSync(join(ROOT, 'test/sql'))
    .filter((f) => f.endsWith('.test.sql'))
    .sort()
    .map((f) => join(ROOT, 'test/sql', f)),
];

let failed = false;
const created = psql(['-d', 'postgres', '-c', `create database ${dbName}`]);
if (!created.ok) {
  console.error(`test-sql: could not create database ${dbName} on ${host}:${port}`);
  console.error(created.err.trim());
  process.exit(1);
}

try {
  for (const file of files) {
    const label = relative(ROOT, file);
    // Test files use \ir with paths relative to themselves, so run from ROOT.
    const r = psql(['-v', 'ON_ERROR_STOP=1', '-d', dbName, '-f', file]);
    if (r.ok) {
      console.log(`PASS ${label}`);
    } else {
      console.log(`FAIL ${label}`);
      if (r.err.trim()) console.log(r.err.trim());
      failed = true;
      break;
    }
  }
} finally {
  const dropped = psql(['-d', 'postgres', '-c', `drop database if exists ${dbName} with (force)`]);
  if (!dropped.ok) {
    console.error(`test-sql: could not drop ${dbName}: ${dropped.err.trim()}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
