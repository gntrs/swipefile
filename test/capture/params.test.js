import { describe, it, expect } from 'vitest';
import {
  parseCaptureParams, capturePath, VERSION_WARNING, cleanLine, cleanText, httpsUrl, isoDay, LIMITS,
} from '../../src/features/capture/params.js';
import { SAMPLE_CAPTURE } from '../../src/features/capture/capture.js';
import { loadParse, fixture } from './load.js';

const parse = (query) => parseCaptureParams(new URLSearchParams(query));
const qs = (obj) => new URLSearchParams(obj).toString();

describe('parseCaptureParams', () => {
  it('reads a full capture URL', () => {
    const { capture, warnings } = parse(
      'v=1&src=extension&id=999900001234567&brand=Lumen%20Loop&title=Light&text=Line%20one%0ALine%20two&cta=Shop%20now' +
        '&link=https%3A%2F%2Flumenloop.example%2Flamp&started=2026-01-05&stopped=2026-02-01&active=0' +
        '&platforms=facebook,instagram&page=999900000000011&kind=video&media=https%3A%2F%2Fa.example%2F1.mp4'
    );
    expect(warnings).toEqual([]);
    expect(capture).toEqual({
      src: 'extension',
      libraryId: '999900001234567',
      brand: 'Lumen Loop',
      title: 'Light',
      text: 'Line one\nLine two',
      cta: 'Shop now',
      link: 'https://lumenloop.example/lamp',
      started: '2026-01-05',
      stopped: '2026-02-01',
      active: false,
      platforms: ['facebook', 'instagram'],
      pageId: '999900000000011',
      kind: 'video',
      media: ['https://a.example/1.mp4'],
    });
  });

  it('accepts a string with or without the question mark', () => {
    expect(parseCaptureParams('?v=1&id=999900001234567').capture.libraryId).toBe('999900001234567');
    expect(parseCaptureParams('v=1&id=999900001234567').capture.libraryId).toBe('999900001234567');
    expect(parseCaptureParams(undefined).capture.libraryId).toBeNull();
  });

  it('warns on a missing or other version and keeps parsing', () => {
    for (const v of ['', 'v=2&', 'v=01&']) {
      const { capture, warnings } = parse(`${v}id=999900001234567`);
      expect(warnings).toEqual([VERSION_WARNING]);
      expect(capture.libraryId).toBe('999900001234567');
    }
  });

  it('an empty query gives an empty capture, never a throw', () => {
    const { capture } = parse('v=1');
    expect(capture).toMatchObject({
      src: null, libraryId: null, brand: null, title: null, text: null, cta: null, link: null,
      started: null, stopped: null, active: null, platforms: [], pageId: null, kind: null, media: [],
    });
  });

  it('src only bookmarklet or extension', () => {
    expect(parse('v=1&src=bookmarklet').capture.src).toBe('bookmarklet');
    expect(parse('v=1&src=other').capture.src).toBeNull();
  });

  it.each([
    ['999900001234567', '999900001234567'],
    ['123456', '123456'],
    ['12345678901234567890', '12345678901234567890'],
    ['12345', null],
    ['123456789012345678901', null],
    ['12a456', null],
    ['-123456', null],
    [' 999900001234567 ', '999900001234567'],
  ])('id %s -> %s', (id, out) => {
    expect(parse(qs({ v: '1', id })).capture.libraryId).toBe(out);
  });

  it('page is digits only', () => {
    expect(parse('v=1&page=12345').capture.pageId).toBe('12345');
    expect(parse('v=1&page=12a45').capture.pageId).toBeNull();
    expect(parse('v=1&page=').capture.pageId).toBeNull();
  });

  it('caps and trims strings: brand 200, title 300, text 1500, cta 60', () => {
    const { capture } = parse(
      qs({ v: '1', brand: `  ${'b'.repeat(300)}  `, title: 't'.repeat(400), text: 'x'.repeat(2000), cta: 'c'.repeat(100) })
    );
    expect(capture.brand).toHaveLength(LIMITS.brand);
    expect(capture.title).toHaveLength(LIMITS.title);
    expect(capture.text).toHaveLength(LIMITS.text);
    expect(capture.cta).toHaveLength(LIMITS.cta);
  });

  it('collapses whitespace in one line fields and keeps line breaks in text', () => {
    const { capture } = parse(qs({ v: '1', brand: 'Lumen\n\n  Loop', text: 'one  \r\ntwo\n\n\n\nthree\u0000' }));
    expect(capture.brand).toBe('Lumen Loop');
    expect(capture.text).toBe('one\ntwo\n\nthree');
  });

  it.each([
    ['javascript:alert(1)'],
    ['http://shop.example/'],
    ['data:text/html,hi'],
    ['//shop.example/'],
    ['https://user:pass@shop.example/'],
    ['not a url'],
    [''],
  ])('drops link %s', (link) => {
    expect(parse(qs({ v: '1', link })).capture.link).toBeNull();
  });

  it('keeps only https media, deduped, at most 4', () => {
    const q = new URLSearchParams('v=1');
    for (const m of [
      'http://a.example/0.jpg', 'javascript:alert(1)', 'https://a.example/1.jpg', 'https://a.example/1.jpg',
      'https://a.example/2.jpg', 'https://a.example/3.jpg', 'https://a.example/4.jpg', 'https://a.example/5.jpg',
    ]) q.append('media', m);
    expect(parseCaptureParams(q).capture.media).toEqual([
      'https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg', 'https://a.example/4.jpg',
    ]);
  });

  it.each([
    ['2026-01-05', '2026-01-05'],
    ['2024-02-29', '2024-02-29'],
    ['2025-02-29', null],
    ['2026-13-01', null],
    ['2026-1-5', null],
    ['Jan 5, 2026', null],
    ['2026-01-05T00:00:00Z', null],
  ])('date %s -> %s', (d, out) => {
    expect(parse(qs({ v: '1', started: d, stopped: d })).capture.started).toBe(out);
    expect(parse(qs({ v: '1', started: d, stopped: d })).capture.stopped).toBe(out);
  });

  it('active is 1 or 0, anything else null', () => {
    expect(parse('v=1&active=1').capture.active).toBe(true);
    expect(parse('v=1&active=0').capture.active).toBe(false);
    expect(parse('v=1&active=true').capture.active).toBeNull();
  });

  it('platforms from the known list only, lowercased, deduped', () => {
    expect(parse('v=1&platforms=Facebook,,instagram,myspace,facebook,audience%20network').capture.platforms).toEqual([
      'facebook', 'instagram', 'audience_network',
    ]);
  });

  it('kind is image or video', () => {
    expect(parse('v=1&kind=video').capture.kind).toBe('video');
    expect(parse('v=1&kind=image').capture.kind).toBe('image');
    expect(parse('v=1&kind=carousel').capture.kind).toBeNull();
  });

  it('treats markup as plain text', () => {
    expect(parse(qs({ v: '1', title: '<img src=x onerror=alert(1)>' })).capture.title).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('helpers', () => {
  it('cleanLine and cleanText return null for non strings and blanks', () => {
    expect(cleanLine(null, 10)).toBeNull();
    expect(cleanLine('   ', 10)).toBeNull();
    expect(cleanText(42, 10)).toBeNull();
  });
  it('never leaves half an emoji at the cap', () => {
    const s = cleanLine('a' + String.fromCodePoint(0x1f600).repeat(10), 4);
    expect(() => encodeURIComponent(s)).not.toThrow();
  });
  it('httpsUrl and isoDay', () => {
    expect(httpsUrl('https://a.example')).toBe('https://a.example/');
    expect(isoDay(null)).toBeNull();
  });
});

describe('the sample capture and capturePath', () => {
  const P = loadParse();

  it('the sample is the first capture in results-3', () => {
    expect(SAMPLE_CAPTURE).toEqual(fixture('results-3.expected.json')[0]);
  });

  it('capturePath matches the parser captureUrl for fixture captures', () => {
    for (const c of [...fixture('results-3.expected.json'), ...fixture('single-active.expected.json')]) {
      expect(capturePath(c, 'bookmarklet')).toBe(P.captureUrl('', c, 'bookmarklet'));
    }
  });

  it('a capture survives the round trip through the URL', () => {
    const path = capturePath(SAMPLE_CAPTURE, 'bookmarklet');
    const { capture, warnings } = parseCaptureParams(path.slice(path.indexOf('?')));
    expect(warnings).toEqual([]);
    const { versions, ...rest } = SAMPLE_CAPTURE;
    expect(versions).toBe(false);
    expect(capture).toEqual({ src: 'bookmarklet', ...rest });
  });
});
