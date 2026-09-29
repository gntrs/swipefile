import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { read, loadScripts, ROOT } from './load.js';

describe('manifest.json', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));

  it('ships with the app: its version is the package version', () => {
    expect(manifest.version).toBe(JSON.parse(read('package.json')).version);
  });

  it('is Manifest V3 with only the storage permission and one content script', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.background).toBeUndefined();
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://www.facebook.com/ads/library*'],
        js: ['parse.js', 'content.js'],
        css: ['content.css'],
        run_at: 'document_idle',
      },
    ]);
    expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
  });

  it('every file it names exists, icons are PNGs of the right size', () => {
    const files = [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.options_ui.page];
    for (const f of files) expect(existsSync(`${ROOT}extension/${f}`)).toBe(true);
    for (const [size, path] of Object.entries(manifest.icons)) {
      const png = readFileSync(`${ROOT}extension/${path}`);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(Number(size));
      expect(png.readUInt32BE(20)).toBe(Number(size));
    }
  });
});

describe('content.js sends nothing anywhere', () => {
  const src = read('extension/content.js');
  it('has no network, cookie or messaging calls', () => {
    for (const banned of ['fetch(', 'XMLHttpRequest', 'document.cookie', 'sendBeacon', 'WebSocket', 'chrome.runtime.sendMessage', 'importScripts']) {
      expect(src.includes(banned)).toBe(false);
    }
  });
});

describe('options: normalizeAppUrl', () => {
  const { normalizeAppUrl } = loadScripts(['extension/options.js']).SwipefileOptions;
  const plain = (v) => JSON.parse(JSON.stringify(v));

  it.each([
    ['https://swipe.example.com', 'https://swipe.example.com'],
    ['https://swipe.example.com/ads?x=1', 'https://swipe.example.com'],
    ['  swipe.example.com  ', 'https://swipe.example.com'],
    ['http://localhost:5173', 'http://localhost:5173'],
    ['http://127.0.0.1:5193/', 'http://127.0.0.1:5193'],
    ['https://swipe.example.com:8443', 'https://swipe.example.com:8443'],
  ])('%s -> %s', (input, origin) => {
    expect(plain(normalizeAppUrl(input))).toEqual({ ok: true, origin });
  });

  it.each([
    ['', 'Enter the address'],
    [null, 'Enter the address'],
    ['http://swipe.example.com', 'Use an https address'],
    ['http://192.168.1.10:5173', 'Use an https address'],
    ['ftp://swipe.example.com', 'Use an https address'],
    ['javascript:alert(1)', 'not a web address'],
    ['https://user:pw@swipe.example.com', 'user name and password'],
    ['https://exa mple.com', 'not a web address'],
  ])('refuses %s', (input, reason) => {
    const r = normalizeAppUrl(input);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(reason);
  });
});
