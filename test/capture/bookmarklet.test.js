import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { buildBookmarklet, stripSource } from '../../src/features/capture/bookmarklet.js';
import { read, loadScripts } from './load.js';

const APP = 'https://swipe.example';

function decode(link) {
  expect(link.startsWith('javascript:')).toBe(true);
  return decodeURIComponent(link.slice('javascript:'.length));
}

// A page with no ad cards: document has no tree walker results, a stub
// location, and window.open / alert that record what they were given.
function stubPage(href) {
  const opened = [];
  const alerts = [];
  const url = new URL(href);
  const document = {
    nodeType: 9,
    body: { nodeType: 1 },
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  const sandbox = {
    URL,
    URLSearchParams,
    document,
    location: { href: url.href, hostname: url.hostname, pathname: url.pathname },
    open: (u, target) => {
      opened.push([u, target]);
      return { opener: 'page' };
    },
    alert: (m) => alerts.push(m),
  };
  sandbox.window = sandbox;
  return { sandbox, opened, alerts };
}

const runLink = (link, href) => {
  const page = stubPage(href);
  vm.runInNewContext(decode(link), page.sandbox);
  return page;
};

describe('buildBookmarklet', () => {
  const link = buildBookmarklet(APP);

  it('starts with javascript: and decodes to code that compiles', () => {
    expect(() => new vm.Script(decode(link))).not.toThrow();
  });

  it('carries the app origin as a JSON string', () => {
    expect(decode(link)).toContain('SwipefileBookmarklet.run({appOrigin:"https://swipe.example"})');
    const odd = buildBookmarklet('https://x.example/"});alert(1);//');
    expect(() => new vm.Script(decode(odd))).not.toThrow();
    expect(decode(odd)).toContain(JSON.stringify('https://x.example/"});alert(1);//'));
  });

  it('opens the capture page for the id on a single ad page with no readable cards', () => {
    const { opened, alerts } = runLink(link, 'https://www.facebook.com/ads/library/?id=999900001234567');
    expect(alerts).toEqual([]);
    expect(opened).toEqual([[`${APP}/capture?v=1&src=bookmarklet&id=999900001234567`, '_blank']]);
  });

  it('says to switch to English when there are no cards and no id', () => {
    const { opened, alerts } = runLink(link, 'https://www.facebook.com/ads/library/?q=socks');
    expect(opened).toEqual([]);
    expect(alerts).toEqual([
      'No ads found here. Scroll until the ad is visible, or switch Facebook to English: capture reads the English labels.',
    ]);
  });

  it('refuses to run off the Ad Library', () => {
    const { opened, alerts } = runLink(link, 'https://shop.example/ads/library/?id=999900001234567');
    expect(opened).toEqual([]);
    expect(alerts).toEqual(['Open an ad in the Meta Ad Library (facebook.com/ads/library), then click this bookmark.']);
  });

  it('clears the new tab opener', () => {
    const page = stubPage('https://www.facebook.com/ads/library/?id=999900001234567');
    let tab = null;
    page.sandbox.open = () => (tab = { opener: 'page' });
    vm.runInNewContext(decode(link), page.sandbox);
    expect(tab.opener).toBeNull();
  });

  it('stays well under the size browsers accept', () => {
    // Chrome takes far longer bookmarks; this guards against accidental growth.
    expect(link.length).toBeLessThan(40000);
  });
});

describe('the sources the bookmarklet is built from', () => {
  for (const file of ['extension/parse.js', 'extension/bookmarklet.js']) {
    it(`${file} has no template literals`, () => {
      expect(read(file).includes('`')).toBe(false);
    });
    it(`${file} still compiles with comments stripped`, () => {
      expect(() => new vm.Script(stripSource(read(file)))).not.toThrow();
    });
  }

  it('stripSource drops whole line comments and indentation only', () => {
    expect(stripSource('  // gone\n  var a = "http://x"; // kept\n\n')).toBe('var a = "http://x"; // kept');
  });

  it('bookmarklet.js defines SwipefileBookmarklet.run', () => {
    const ctx = loadScripts(['extension/parse.js', 'extension/bookmarklet.js']);
    expect(typeof ctx.SwipefileBookmarklet.run).toBe('function');
  });
});
