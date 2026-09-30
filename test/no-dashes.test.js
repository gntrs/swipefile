import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo bans the em dash and the en dash in every file. The pattern is built
// from char codes so this file never contains either character itself.
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vite']);
const BINARY = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp4', '.mov', '.webm',
  '.woff', '.woff2', '.ttf', '.pdf', '.zip', '.gz',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (!BINARY.has(extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

describe('no dashes', () => {
  it('has no em dash or en dash in any text file', () => {
    const hits = [];
    for (const file of walk(ROOT)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (DASH.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
