// The setup check's rules. Pure: it takes what the doctor gathered and returns
// the list of checks the Setup page shows. No network, no imports, so every
// row can be tested with hand built inputs.
//
// Levels: ok, info, warn, fail. Any fail blocks the app (it redirects to
// /setup); a warn shows a banner; ok and info are just listed.

// Bump this together with the schema_version returned by
// public.swipefile_health() in db-setup.sql.
export const EXPECTED_SCHEMA_VERSION = 3;

const RERUN_FIX =
  'Re-run db-setup.sql in the SQL editor. It is safe to run again and adds the storage bucket, its rules and newer features.';

export const FIX = {
  demo: 'Copy .env.example to .env, set VITE_DB_URL and VITE_DB_ANON_KEY from your Supabase project (Project Settings, API), then restart npm run dev.',
  missing: (name) => `Add ${name} to .env (Supabase: Project Settings, API) and restart npm run dev.`,
  badUrl: 'Use the project URL, like https://your-project.supabase.co',
  serviceKey:
    'Use the anon or publishable key. The secret key skips every security rule and would ship to every visitor. If this build was ever deployed, rotate that key in Supabase now.',
  unreachable: 'Check the URL in .env and that the Supabase project is not paused.',
  rejectedKey: 'Copy the anon or publishable key again from Project Settings, API.',
  openSignup:
    'Every signed in account can read and change your whole swipe file. In Supabase go to Authentication, Sign In / Providers, and turn off Allow new users to sign up.',
  allowSignup: 'Remove VITE_ALLOW_SIGNUP from .env once your accounts exist.',
  noTables: 'Open the Supabase SQL editor, paste all of db-setup.sql, run it, then reload this page.',
  rerun: RERUN_FIX,
  noBucket: 'Uploads will fail until you re-run db-setup.sql, which creates the bucket.',
  publicBucket: 'Anyone with a file link can open your media. Re-run db-setup.sql, it makes the bucket private again.',
};

const check = (id, level, title, detail = '', fix = null) => ({ id, level, title, detail, fix });

function isMissingFunction(result) {
  const e = result?.error;
  if (!e) return false;
  return e.code === 'PGRST202' || e.code === '42883' || e.status === 404 || result?.status === 404;
}

function isMissingTableError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === '42P01' || code === 'PGRST205' || /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg);
}

export function statusOf(checks) {
  if (checks.some((c) => c.level === 'fail')) return 'blocking';
  if (checks.some((c) => c.level === 'warn')) return 'warn';
  return 'ok';
}

// inputs: {
//   config:   readDbConfig() result
//   env:      { VITE_ALLOW_SIGNUP }
//   settings: { ok, status, body } | { ok: false, error }   GET /auth/v1/settings
//   health:   { data, error, status }                        rpc('swipefile_health')
//   adsProbe: { error } | null                               only when health is missing
//   keyKind:  classifyKey() of the anon key
//   session:  { email } | null
// }
export function evaluate(inputs = {}) {
  const { config = {}, env = {}, settings, health, adsProbe, keyKind, session } = inputs;
  const checks = [];

  if (config.mode === 'demo') {
    checks.push(check('env', 'info', 'Demo mode', 'No database is connected. You are looking at sample ads and nothing you change is saved.', FIX.demo));
    return { status: statusOf(checks), checks };
  }

  if (config.mode === 'misconfigured') {
    if (config.reason === 'missing_env') {
      for (const name of config.missing || []) {
        checks.push(check('env', 'fail', `${name} is missing`, 'The app needs both the project URL and the public key.', FIX.missing(name)));
      }
    } else if (config.reason === 'bad_url') {
      checks.push(check('env', 'fail', 'VITE_DB_URL is not a URL', `It is set to "${config.url || ''}".`, FIX.badUrl));
    } else if (config.reason === 'service_key') {
      checks.push(check('key_kind', 'fail', 'VITE_DB_ANON_KEY holds a secret key', 'Anything with a VITE_ prefix is readable by every visitor.', FIX.serviceKey));
    }
    return { status: statusOf(checks), checks };
  }

  // Live mode.
  checks.push(check('env', 'ok', 'VITE_DB_URL and VITE_DB_ANON_KEY are set', config.url || ''));
  if (keyKind === 'anon' || keyKind === 'publishable') {
    checks.push(check('key_kind', 'ok', 'Using the public key', keyKind === 'anon' ? 'Anon key.' : 'Publishable key.'));
  }

  // Can we reach the project at all?
  let reachable = false;
  if (!settings || settings.error || (!settings.ok && !settings.status)) {
    checks.push(check('reach', 'fail', 'Cannot reach VITE_DB_URL', settings?.error?.message || settings?.error || 'No answer within 6 seconds.', FIX.unreachable));
  } else if (settings.status === 401 || settings.status === 403) {
    checks.push(check('reach', 'fail', 'Supabase rejected VITE_DB_ANON_KEY', `The auth service answered ${settings.status}.`, FIX.rejectedKey));
  } else {
    reachable = true;
    checks.push(check('reach', 'ok', 'Supabase answers'));
  }

  // Sign ups.
  if (reachable && settings.body && settings.body.disable_signup === false) {
    checks.push(check('signup', 'warn', 'Anyone can sign up to this project', 'Public sign ups are on in Supabase Authentication.', FIX.openSignup));
  } else if (reachable && settings.body && settings.body.disable_signup === true) {
    checks.push(check('signup', 'ok', 'Public sign ups are off'));
  }
  if (env.VITE_ALLOW_SIGNUP === '1') {
    checks.push(check('signup', 'warn', 'Sign up is shown on the login page', 'VITE_ALLOW_SIGNUP is 1.', FIX.allowSignup));
  }

  // Schema, version and bucket, all from swipefile_health().
  if (reachable) {
    if (isMissingFunction(health)) {
      if (adsProbe && isMissingTableError(adsProbe.error)) {
        checks.push(check('schema', 'fail', 'The database has no swipefile tables', 'db-setup.sql has not been run on this project.', FIX.noTables));
      } else {
        checks.push(check('schema', 'warn', 'db-setup.sql is from an older version', 'The tables exist but the setup check function does not.', FIX.rerun));
      }
    } else if (health?.error) {
      checks.push(check('schema', 'warn', 'Could not read the database status', health.error.message || String(health.error), FIX.rerun));
    } else if (health?.data) {
      const h = health.data;
      checks.push(check('schema', 'ok', 'Tables are in place'));
      const version = Number(h.schema_version) || 0;
      if (version < EXPECTED_SCHEMA_VERSION) {
        checks.push(check('schema_version', 'warn', 'Some features need the latest db-setup.sql', `Database is at version ${version}, this app expects ${EXPECTED_SCHEMA_VERSION}.`, FIX.rerun));
      } else {
        checks.push(check('schema_version', 'ok', 'db-setup.sql is current', `Version ${version}.`));
      }
      if (h.bucket_exists === false) {
        checks.push(check('bucket', 'warn', 'Storage bucket ad-media is missing', 'Adding ads with images or video needs it.', FIX.noBucket));
      } else if (h.bucket_public === true) {
        checks.push(check('bucket', 'warn', 'Bucket ad-media is public', 'Files should only open through short lived signed links.', FIX.publicBucket));
      } else {
        checks.push(check('bucket', 'ok', 'Storage bucket ad-media is private'));
      }
    }
  }

  checks.push(check('session', 'info', session?.email ? `Signed in as ${session.email}` : 'Not signed in'));

  return { status: statusOf(checks), checks };
}
