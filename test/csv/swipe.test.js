import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, parseCsvWithLines } from '../../src/lib/csv/parse.js';
import { mapSwipeRows, swipeColumns, SWIPE_ALIASES, splitList } from '../../src/lib/csv/swipe.js';
import { detectFormat, SAMPLE_CSV, LIMITS, limitProblem } from '../../src/lib/csv/index.js';

const USER = { id: 'user-1', email: 'you@example.com' };
const NOW = new Date('2026-09-29T10:00:00.000Z');
const map = (text, opts = {}) => {
  const rows = parseCsv(text);
  return mapSwipeRows(rows[0], rows.slice(1), { user: USER, now: NOW, ...opts });
};

describe('swipe CSV headers', () => {
  it('reads every alias, ignoring case, spaces, underscores and dashes', () => {
    for (const [field, names] of Object.entries(SWIPE_ALIASES)) {
      for (const name of names) {
        for (const spelled of [name, name.toUpperCase(), ` ${name.replace(/ /g, '_')} `, name.replace(/ /g, '')]) {
          expect(swipeColumns(['other', spelled])[field], `${field} from "${spelled}"`).toBe(1);
        }
      }
    }
  });
  it('the first matching column wins', () => {
    expect(swipeColumns(['Headline', 'Hook']).hook).toBe(0);
  });
  it('ignores unknown columns', () => {
    expect(swipeColumns(['notes', 'whatever'])).toEqual({});
  });
});

describe('mapSwipeRows', () => {
  it('maps a full row', () => {
    const { ads, errors } = map(
      'Advertiser,Headline,Primary text,Destination,Permalink,Platform,Format,Verdict,Status,Tags,Start date,Days,Countries\n' +
        'Sample Co,Stop scrolling,Body text,https://example.com/p,https://www.facebook.com/ads/library/?id=999900000000123&access_token=SECRET,Instagram,Video,Winner,dead,"ugc; offer | ugc",2026-08-01,45,"es, fr;ES"'
    );
    expect(errors).toEqual([]);
    expect(ads).toHaveLength(1);
    const a = ads[0];
    expect(a).toMatchObject({
      brand: 'Sample Co', hook: 'Stop scrolling', ad_copy: 'Body text', landing_url: 'https://example.com/p',
      platform: 'Instagram', format: 'video', verdict: 'winner', status: 'dead', tags: ['ugc', 'offer'],
      countries: ['ES', 'FR'], media_path: null, added_by: 'user-1', added_by_email: 'you@example.com', _line: 2,
    });
    expect(a.metrics).toEqual({
      source: 'csv',
      ad_library_id: '999900000000123',
      ad_permalink: 'https://www.facebook.com/ads/library/?id=999900000000123',
      source_url: 'https://www.facebook.com/ads/library/?id=999900000000123',
      started_running: '2026-08-01',
      days_running: 45,
      verdict_by: 'human',
      verdict_at: '2026-09-29T10:00:00.000Z',
    });
    expect(JSON.stringify(a)).not.toContain('SECRET');
  });
  it('defaults: Facebook, image, unsure, running, no human marks', () => {
    const { ads } = map('brand\nSample Co');
    expect(ads[0]).toMatchObject({ platform: 'Facebook', format: 'image', verdict: 'unsure', status: 'running', tags: [], countries: [] });
    expect(ads[0].metrics).toEqual({ source: 'csv' });
  });
  it('a bad verdict is an error, not a guess', () => {
    const { ads, errors } = map('brand,verdict\nA,great\nB,winner');
    expect(ads.map((a) => a.brand)).toEqual(['B']);
    expect(errors).toEqual([{ line: 2, message: 'Verdict "great" is not one of unsure, winner, testing, loser.' }]);
  });
  it('bad status, format, dates, days and links are errors with their line', () => {
    const { ads, errors } = map(
      'brand,status,format,started,days,landing url,ad link,library id\n' +
        'A,alive,,,,,,\n' +
        'B,,gif,,,,,\n' +
        'C,,,2026-02-30,,,,\n' +
        'D,,,,4.5,,,\n' +
        'E,,,,,not a url,,\n' +
        'F,,,,,,javascript:alert(1),\n' +
        'G,,,,,,,12345\n' +
        'H,,,,,,https://www.facebook.com/ads/library/?id=999900000000001,999900000000002\n' +
        'I,,,,-3,,,'
    );
    expect(ads).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(errors[0].message).toMatch(/Status "alive"/);
    expect(errors[1].message).toMatch(/Format "gif"/);
    expect(errors[2].message).toMatch(/Start date "2026-02-30"/);
    expect(errors[3].message).toMatch(/Days running "4.5"/);
    expect(errors[4].message).toMatch(/Landing url/);
    expect(errors[5].message).toMatch(/Ad link is not a web address/);
    expect(errors[6].message).toMatch(/6 to 20 digits/);
    expect(errors[7].message).toMatch(/does not match/);
    expect(errors[8].message).toMatch(/Days running "-3"/);
  });
  it('a row needs a brand, hook, copy or ad link', () => {
    const { ads, errors } = map('brand,hook,copy,ad link,tags\n,,,,ugc\n,,,https://example.com/ad,');
    expect(errors).toEqual([{ line: 2, message: 'Needs a brand, hook, copy or ad link.' }]);
    expect(ads).toHaveLength(1);
    expect(ads[0].metrics.source_url).toBe('https://example.com/ad');
  });
  it('reads the library id from a link, and from its own column', () => {
    const { ads } = map('brand,ad link,library id\nA,facebook.com/ads/library/?id=999900000000777,\nB,,999900000000888');
    expect(ads[0].metrics.ad_library_id).toBe('999900000000777');
    expect(ads[1].metrics).toMatchObject({
      ad_library_id: '999900000000888',
      ad_permalink: 'https://www.facebook.com/ads/library/?id=999900000000888',
      source_url: 'https://www.facebook.com/ads/library/?id=999900000000888',
    });
  });
  it('splits tags on commas, semicolons and pipes, trimmed and unique', () => {
    expect(splitList(' a, b;c |a,, ')).toEqual(['a', 'b', 'c']);
    expect(splitList(undefined)).toEqual([]);
  });
  it('counts lines from the file when rows span several lines', () => {
    const { rows, lines } = parseCsvWithLines('brand,copy,verdict\nA,"two\nlines",winner\nB,x,bad');
    const { errors } = mapSwipeRows(rows[0], rows.slice(1), { user: USER, now: NOW, lines: lines.slice(1) });
    expect(errors).toEqual([{ line: 4, message: 'Verdict "bad" is not one of unsure, winner, testing, loser.' }]);
  });
  it('works without a user (added_by null)', () => {
    const rows = parseCsv('brand\nA');
    const { ads } = mapSwipeRows(rows[0], rows.slice(1));
    expect(ads[0].added_by).toBe(null);
  });
});

describe('format detection, template and limits', () => {
  it('tells the two formats apart', () => {
    expect(detectFormat(['Ad name', 'Amount spent (EUR)', 'Impressions'])).toBe('meta');
    expect(detectFormat(['brand', 'hook'])).toBe('swipe');
    expect(detectFormat(['Ad library id'])).toBe('swipe');
    expect(detectFormat(['foo', 'bar'])).toBe(null);
    expect(detectFormat([])).toBe(null);
    expect(detectFormat(null)).toBe(null);
  });
  it('the template is a swipe file with two good rows', () => {
    const rows = parseCsv(SAMPLE_CSV);
    expect(detectFormat(rows[0])).toBe('swipe');
    const { ads, errors } = mapSwipeRows(rows[0], rows.slice(1), { user: USER, now: NOW });
    expect(errors).toEqual([]);
    expect(ads).toHaveLength(2);
  });
  it('the row and size limits', () => {
    expect(LIMITS).toEqual({ bytes: 10 * 1024 * 1024, rows: 5000 });
    expect(limitProblem({ bytes: 10 * 1024 * 1024, rows: 5000 })).toBe(null);
    expect(limitProblem({ rows: 5001 })).toBe('That file has 5,001 rows. The limit is 5,000 rows: split it into smaller files.');
    expect(limitProblem({ bytes: 10 * 1024 * 1024 + 1 })).toBe('That file is 11 MB. The limit is 10 MB: split it into smaller files.');
    expect(limitProblem()).toBe(null);
  });
  it('sample-100.csv: 100 good fictional rows with 9999 library ids', () => {
    const text = readFileSync(new URL('../fixtures/csv/sample-100.csv', import.meta.url), 'utf8');
    const rows = parseCsv(text);
    expect(detectFormat(rows[0])).toBe('swipe');
    const { ads, errors } = mapSwipeRows(rows[0], rows.slice(1), { user: USER, now: NOW });
    expect(errors).toEqual([]);
    expect(ads).toHaveLength(100);
    expect(new Set(ads.map((a) => a.metrics.ad_library_id)).size).toBe(100);
    for (const a of ads) expect(a.metrics.ad_library_id.startsWith('99990000')).toBe(true);
  });
});
