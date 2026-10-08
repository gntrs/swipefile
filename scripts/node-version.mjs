// The scripts talk to Supabase through supabase-js, which needs the WebSocket
// built into Node.js 22. On older Node it crashes with a stack trace, so the
// scripts check first and say what to do in one line.
export const MIN_NODE_MAJOR = 22;

// Returns null when the version is new enough, else the message to print.
export function nodeVersionProblem(version = process.versions.node) {
  const major = Number.parseInt(String(version ?? '').replace(/^v/, ''), 10);
  if (Number.isFinite(major) && major >= MIN_NODE_MAJOR) return null;
  const have = Number.isFinite(major) ? `Node.js ${String(version).replace(/^v/, '')}` : 'an unknown Node.js version';
  return `The scripts need Node.js ${MIN_NODE_MAJOR} or newer, this is ${have}. Install Node.js ${MIN_NODE_MAJOR} (nodejs.org, or "nvm install ${MIN_NODE_MAJOR}"), then run the command again.`;
}

// Prints the problem and exits with code 1 when Node.js is too old.
export function requireNode(version, exit = process.exit, log = console.error) {
  const problem = nodeVersionProblem(version);
  if (!problem) return true;
  log(problem);
  exit(1);
  return false;
}
