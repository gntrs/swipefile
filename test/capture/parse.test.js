import { describe, it, expect } from 'vitest';
import { loadParse, fixture } from './load.js';

const P = loadParse();
const plain = (v) => JSON.parse(JSON.stringify(v));
const EN_DASH = String.fromCharCode(0x2013);

const card = (lines, extra = {}) => ({ lines, links: [], labels: [], media: [], ...extra });

describe('the script itself', () => {
  it('defines SwipefileParse and nothing else', async () => {
    const { loadScripts } = await import('./load.js');
    const ctx = loadScripts(['extension/parse.js']);
    const own = Object.keys(ctx).filter((k) => !['URL', 'URLSearchParams'].includes(k));
    expect(own).toEqual(['SwipefileParse']);
    expect(Object.keys(ctx.SwipefileParse).sort()).toEqual(
      ['captureUrl', 'findCards', 'fromLocation', 'parseCard', 'parseStartedDate', 'readCard'].sort()
    );
  });
});

describe('fixtures: parts give the expected capture', () => {
  for (const name of ['single-active', 'results-3', 'non-english']) {
    it(name, () => {
      const parts = fixture(`${name}.parts.json`);
      const expected = fixture(`${name}.expected.json`);
      expect(parts.length).toBe(expected.length);
      expect(plain(parts.map(P.parseCard))).toEqual(expected);
    });
  }

  it('results-3 holds the three kinds of card the spec asks for', () => {
    const [image, video, versions] = fixture('results-3.expected.json');
    expect(image).toMatchObject({ active: true, kind: 'image', stopped: null, versions: false });
    expect(video).toMatchObject({ active: false, kind: 'video', started: '2025-11-02', stopped: '2025-12-14' });
    expect(versions).toMatchObject({ versions: true, kind: 'image' });
    expect(versions.media).toHaveLength(1);
  });

  it('every fixture id is fictional (starts 99990000)', () => {
    for (const name of ['single-active', 'results-3']) {
      for (const c of fixture(`${name}.expected.json`)) expect(c.libraryId.startsWith('99990000')).toBe(true);
    }
  });
});

describe('parseStartedDate', () => {
  it.each([
    ['Jan 5, 2026', '2026-01-05'],
    ['January 5, 2026', '2026-01-05'],
    ['5 Jan 2026', '2026-01-05'],
    ['Sept 30, 2025', '2025-09-30'],
    ['Sep. 30, 2025', '2025-09-30'],
    ['31 December 2025', '2025-12-31'],
    ['Feb 29, 2024', '2024-02-29'],
    ['Started running on Mar 3, 2026', '2026-03-03'],
    ['Started running on Jun 3, 2026 \u00b7 Total active time 8 hrs', '2026-06-03'],
  ])('%s -> %s', (input, out) => {
    expect(P.parseStartedDate(input)).toBe(out);
  });

  it.each([
    ['Feb 30, 2026'],
    ['Feb 29, 2025'],
    ['Foo 5, 2026'],
    ['Ja 5, 2026'],
    ['2026-01-05'],
    ['5/1/2026'],
    [''],
    [null],
    [undefined],
    ['0 Jan 2026'],
  ])('%s -> null', (input) => {
    expect(P.parseStartedDate(input)).toBeNull();
  });
});

describe('parseCard rules', () => {
  const base = [
    'Active',
    'Library ID: 999900001111111',
    'Started running on Jan 5, 2026',
    'Brand Name',
    'Sponsored',
    'Line one',
    'Line two',
    'BRAND.EXAMPLE',
    'Headline here',
    'Description',
    'Shop now',
  ];

  it('reads the id with or without the colon', () => {
    expect(P.parseCard(card(['Library ID 999900001111111'])).libraryId).toBe('999900001111111');
    expect(P.parseCard(card(['Library ID: 12345'])).libraryId).toBeNull();
    expect(P.parseCard(card(['nothing here'])).libraryId).toBeNull();
  });

  it('active is exact: Active, Inactive, else null', () => {
    expect(P.parseCard(card(['Inactive'])).active).toBe(false);
    expect(P.parseCard(card(['Active'])).active).toBe(true);
    expect(P.parseCard(card(['Active now'])).active).toBeNull();
  });

  it('a date range with a hyphen or an en dash gives started and stopped', () => {
    for (const sep of [' - ', ` ${EN_DASH} `, '-', EN_DASH]) {
      const c = P.parseCard(card(['Inactive', `Nov 2, 2025${sep}Dec 14, 2025`]));
      expect([c.started, c.stopped]).toEqual(['2025-11-02', '2025-12-14']);
    }
  });

  it('text runs from Sponsored to the domain line, title follows it, cta from the list', () => {
    const c = P.parseCard(card(base));
    expect(c.brand).toBe('Brand Name');
    expect(c.text).toBe('Line one\nLine two');
    expect(c.title).toBe('Headline here');
    expect(c.cta).toBe('Shop now');
  });

  it('text stops at a call to action when there is no domain line', () => {
    const c = P.parseCard(card(['Brand', 'Sponsored', 'Body', 'Learn More', 'Other']));
    expect(c.text).toBe('Body');
    expect(c.cta).toBe('Learn more');
    expect(c.title).toBeNull();
  });

  it('title is null when a call to action follows the domain at once', () => {
    const c = P.parseCard(card(['Brand', 'Sponsored', 'Body', 'BRAND.EXAMPLE', 'Sign up', 'Footer link']));
    expect(c.title).toBeNull();
    expect(c.cta).toBe('Sign up');
  });

  it('detects domain lines only in capitals', () => {
    const lower = P.parseCard(card(['Brand', 'Sponsored', 'visit brand.example today', 'SHOP.BRAND.EXAMPLE/SALE', 'Title']));
    expect(lower.text).toBe('visit brand.example today');
    expect(lower.title).toBe('Title');
    const price = P.parseCard(card(['Brand', 'Sponsored', 'Only 3.99', 'Get offer']));
    expect(price.text).toBe('Only 3.99');
  });

  it('cuts text to 1,500 characters', () => {
    const c = P.parseCard(card(['Brand', 'Sponsored', 'x'.repeat(2000)]));
    expect(c.text).toHaveLength(1500);
  });

  it('knows every call to action on the list', () => {
    const list = ['Shop now', 'Learn more', 'Sign up', 'Subscribe', 'Download', 'Get offer', 'Order now', 'Book now',
      'Apply now', 'Contact us', 'Send message', 'Install now', 'Watch more', 'Get quote', 'See menu', 'Listen now',
      'Play game', 'Donate now', 'Buy tickets', 'Call now', 'Get directions'];
    for (const cta of list) expect(P.parseCard(card(['B', 'Sponsored', 'Body', cta.toUpperCase()])).cta).toBe(cta);
    expect(P.parseCard(card(['B', 'Sponsored', 'See ad details'])).cta).toBeNull();
  });

  it('platforms come from labels and from the lines after Platforms', () => {
    const fromLabels = P.parseCard(card([], { labels: ['Audience Network', 'Open menu', 'WhatsApp', 'facebook'] }));
    expect(fromLabels.platforms).toEqual(['audience_network', 'whatsapp', 'facebook']);
    const fromLines = P.parseCard(card(['Platforms', 'Instagram', 'Threads', 'Sponsored']));
    expect(fromLines.platforms).toEqual(['instagram', 'threads']);
    expect(P.parseCard(card(['Instagram'])).platforms).toEqual([]);
  });

  it('brand falls back to the first Facebook page link', () => {
    const links = [
      { href: 'https://www.facebook.com/ads/library/?id=1', text: 'See ad details' },
      { href: 'https://www.facebook.com/policies/ads/', text: 'Policies' },
      { href: 'https://www.facebook.com/brandpage/', text: '' },
      { href: 'https://www.facebook.com/brandpage/', text: 'Brand Page' },
    ];
    expect(P.parseCard(card(['no sponsored line'], { links })).brand).toBe('Brand Page');
    expect(P.parseCard(card(['nothing'])).brand).toBeNull();
  });

  it('pageId from view_all_page_id', () => {
    const links = [{ href: 'https://www.facebook.com/ads/library/?view_all_page_id=12345&x=1', text: '' }];
    expect(P.parseCard(card([], { links })).pageId).toBe('12345');
  });

  it('link: redirects unwrapped, Meta pages skipped, only https', () => {
    const wrapped = 'https://l.facebook.com/l.php?u=' + encodeURIComponent('https://shop.example/p?a=1') + '&h=x';
    const c = (links) => P.parseCard(card([], { links: links.map((href) => ({ href, text: '' })) })).link;
    expect(c([wrapped])).toBe('https://shop.example/p?a=1');
    expect(c(['https://www.facebook.com/brand/', 'https://www.instagram.com/brand/', 'https://shop.example/'])).toBe('https://shop.example/');
    expect(c(['http://plain.example/', 'https://secure.example/'])).toBe('https://secure.example/');
    expect(c(['https://l.facebook.com/l.php?u=' + encodeURIComponent('javascript:alert(1)')])).toBeNull();
    expect(c(['https://l.facebook.com/l.php?u=' + encodeURIComponent('http://plain.example/')])).toBeNull();
    expect(c(['not a url', 'mailto:a@b.example'])).toBeNull();
  });

  it('media: https only, at most 4, kind video wins', () => {
    const media = [
      { kind: 'image', src: 'http://a.example/1.jpg', poster: null },
      { kind: 'image', src: 'https://a.example/2.jpg', poster: null },
      { kind: 'video', src: 'https://a.example/3.mp4', poster: 'https://a.example/3.jpg' },
      { kind: 'image', src: 'https://a.example/4.jpg', poster: null },
      { kind: 'image', src: 'https://a.example/5.jpg', poster: null },
      { kind: 'image', src: 'https://a.example/6.jpg', poster: null },
    ];
    const c = P.parseCard(card([], { media }));
    expect(c.media).toEqual(['https://a.example/2.jpg', 'https://a.example/3.mp4', 'https://a.example/4.jpg', 'https://a.example/5.jpg']);
    expect(c.kind).toBe('video');
    expect(P.parseCard(card([])).kind).toBeNull();
    expect(P.parseCard(card([], { media: [media[1]] })).kind).toBe('image');
  });

  it('versions from the multiple versions line', () => {
    expect(P.parseCard(card(['This ad has multiple versions'])).versions).toBe(true);
    expect(P.parseCard(card([])).versions).toBe(false);
  });

  it('a non English card finds no id, brand or text', () => {
    const c = P.parseCard(card(['Activo', 'Identificador de la biblioteca: 999900007654321', 'Publicidad', 'Hola', 'Comprar']));
    expect(c.libraryId).toBeNull();
    expect(c.active).toBeNull();
    expect(c.text).toBeNull();
    expect(c.cta).toBeNull();
  });

  it('survives empty and missing parts', () => {
    expect(() => P.parseCard(undefined)).not.toThrow();
    expect(plain(P.parseCard({}))).toMatchObject({ libraryId: null, platforms: [], media: [], versions: false });
  });
});

describe('captureUrl', () => {
  const [first] = fixture('results-3.expected.json');

  it('builds the 5.11 URL in order with only non empty fields', () => {
    const url = P.captureUrl('https://app.example/', first, 'extension');
    expect(url.startsWith('https://app.example/capture?v=1&src=extension&id=999900001234567&brand=Lumen%20Loop&title=')).toBe(true);
    const q = new URL(url).searchParams;
    expect([...q.keys()]).toEqual(['v', 'src', 'id', 'brand', 'title', 'text', 'cta', 'link', 'started', 'active', 'platforms', 'page', 'kind', 'media']);
    expect(q.get('text')).toBe(first.text);
    expect(q.get('active')).toBe('1');
    expect(q.get('platforms')).toBe('facebook,instagram,messenger');
    expect(q.getAll('media')).toEqual(first.media);
  });

  it('writes active=0 for inactive ads and repeats media', () => {
    const q = new URL(P.captureUrl('https://app.example', { active: false, media: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] }, 'bookmarklet')).searchParams;
    expect(q.get('active')).toBe('0');
    expect(q.getAll('media')).toHaveLength(2);
    expect(q.has('id')).toBe(false);
  });

  it('keeps the URL under 6,000 characters: text first, then media from the end', () => {
    const media = [1, 2, 3, 4].map((n) => `https://scontent.example-cdn.test/${String(n).repeat(1100)}.jpg`);
    const text = 'word '.repeat(1000).trim();
    expect(text.length).toBeGreaterThan(4900);
    const url = P.captureUrl('https://app.example', { libraryId: '999900001234567', text, media }, 'bookmarklet');
    expect(url.length).toBeLessThan(6000);
    const q = new URL(url).searchParams;
    // The text is capped at 1,500, then trimmed further to fit; all four media stay.
    expect(q.get('text').length).toBeLessThan(1500);
    expect(q.get('text').length).toBeGreaterThan(500);
    // Trimmed to fit, not cut blindly: one more word would not fit.
    expect(url.length).toBeGreaterThan(5990);
    expect(text.startsWith(q.get('text'))).toBe(true);
    expect(q.getAll('media')).toEqual(media);
  });

  it('drops media from the end when the text alone is not enough', () => {
    const media = [1, 2, 3, 4].map((n) => `https://scontent.example-cdn.test/${String(n).repeat(1800)}.jpg`);
    const url = P.captureUrl('https://app.example', { libraryId: '999900001234567', text: 'x'.repeat(1500), media }, 'bookmarklet');
    expect(url.length).toBeLessThan(6000);
    const q = new URL(url).searchParams;
    expect(q.has('text')).toBe(false);
    expect(q.getAll('media')).toEqual(media.slice(0, 3));
  });

  it('never splits an emoji or other surrogate pair when trimming', () => {
    const text = String.fromCodePoint(0x1f600).repeat(1400);
    expect(() => P.captureUrl('https://app.example', { text }, 'bookmarklet')).not.toThrow();
    const url = P.captureUrl('https://app.example', { text }, 'bookmarklet');
    expect(url.length).toBeLessThan(6000);
  });

  it('drops a non https link and non https media', () => {
    const q = new URL(P.captureUrl('https://app.example', { link: 'javascript:alert(1)', media: ['http://a.example/1.jpg'] }, 'bookmarklet')).searchParams;
    expect(q.has('link')).toBe(false);
    expect(q.has('media')).toBe(false);
  });
});

describe('fromLocation', () => {
  it('reads the id from an Ad Library URL', () => {
    expect(plain(P.fromLocation('https://www.facebook.com/ads/library/?id=999900001234567'))).toEqual({ libraryId: '999900001234567' });
    expect(plain(P.fromLocation('https://m.facebook.com/ads/library/?active_status=all&id=999900001234567'))).toEqual({ libraryId: '999900001234567' });
  });
  it.each([
    'https://www.facebook.com/ads/library/?q=socks',
    'https://www.facebook.com/ads/library/?id=12',
    'https://www.facebook.com/somepage/?id=999900001234567',
    'https://evil.example/ads/library/?id=999900001234567',
    'https://facebook.com.evil.example/ads/library/?id=999900001234567',
    'javascript:alert(1)',
    '',
    null,
  ])('null for %s', (href) => {
    expect(P.fromLocation(href)).toBeNull();
  });
});
