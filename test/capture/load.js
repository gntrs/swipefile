import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Loads the classic scripts from extension/ into a fresh vm context, the way a
// browser would run them, and hands back what they define.
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const read = (rel) => readFileSync(ROOT + rel, 'utf8');
export const fixture = (name) => JSON.parse(read(`test/fixtures/adlibrary/${name}`));

export function loadScripts(files, globals = {}) {
  const context = vm.createContext({ URL, URLSearchParams, ...globals });
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  return context;
}

export const loadParse = () => loadScripts(['extension/parse.js']).SwipefileParse;
