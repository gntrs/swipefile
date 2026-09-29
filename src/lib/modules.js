// Which parts of the app are switched on. Set VITE_MODULES in .env to a comma
// list of module ids, or `all`. Unset means the solo default: library, hooks,
// briefs, competitors and intel. The team and ops modules (chat, goals,
// availability, outreach, organic posts, revenue, funnel, celebrations) are
// opt in. A module that is off is hidden, never deleted: its routes redirect to
// /ads and its dashboard cards stop rendering, but its data stays where it is.

export const MODULE_IDS = ['library', 'hooks', 'briefs', 'competitors', 'intel', 'team', 'ops'];
export const DEFAULT_MODULES = ['library', 'hooks', 'briefs', 'competitors', 'intel'];

let warned = false;
function warnUnknown(ids) {
  if (warned || typeof window === 'undefined' || !ids.length) return;
  warned = true;
  console.warn(`VITE_MODULES: unknown module ${ids.join(', ')} ignored. Known: ${MODULE_IDS.join(', ')}, or all.`);
}

// Pure apart from the one browser warning. Always returns a new Set that
// contains `library`.
export function parseModules(raw) {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!text) return new Set(DEFAULT_MODULES);
  if (text === 'all') return new Set(MODULE_IDS);
  const ids = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.includes('all')) return new Set(MODULE_IDS);
  const known = ids.filter((id) => MODULE_IDS.includes(id));
  warnUnknown(ids.filter((id) => !MODULE_IDS.includes(id)));
  if (!known.length) return new Set(DEFAULT_MODULES);
  return new Set(['library', ...known]);
}

// Team mode decides the home route and the nav flavour: on when either
// team feature set is.
export const isTeamMode = (modules) => modules.has('team') || modules.has('ops');

// Guarded like db.js so plain Node can import this file too.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const MODULES = parseModules(env.VITE_MODULES);
export const isOn = (id) => MODULES.has(id);
export const TEAM_MODE = isTeamMode(MODULES);

// Placeholders built ahead of their feature stay hidden until it is ready.
export const FEATURE_READY = { capture: false };
