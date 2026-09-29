import { describe, it, expect } from 'vitest';
import { parseAdLibraryInput, isAdLibraryUrl, permalinkFor, AD_LIBRARY_HOSTS } from '../src/lib/adlibrary.js';

const ID = '123456789012345';
const PERMA = `https://www.facebook.com/ads/library/?id=${ID}`;

describe('permalinkFor', () => {
  it('builds the canonical Ad Library link', () => {
    expect(permalinkFor(ID)).toBe(PERMA);
  });
});

describe('parseAdLibraryInput', () => {
  it('takes a bare id', () => {
    expect(parseAdLibraryInput(ID)).toEqual({ libraryId: ID, permalink: PERMA, kind: 'id' });
    expect(parseAdLibraryInput(`  ${ID}\n`)).toEqual({ libraryId: ID, permalink: PERMA, kind: 'id' });
  });

  it('takes an Ad Library link', () => {
    expect(parseAdLibraryInput(PERMA)).toEqual({ libraryId: ID, permalink: PERMA, kind: 'url' });
  });

  it('takes a link without the protocol', () => {
    expect(parseAdLibraryInput(`www.facebook.com/ads/library/?id=${ID}`)).toEqual({ libraryId: ID, permalink: PERMA, kind: 'url' });
    expect(parseAdLibraryInput(`facebook.com/ads/library/?id=${ID}`)?.libraryId).toBe(ID);
  });

  it('takes every Ad Library host', () => {
    for (const host of AD_LIBRARY_HOSTS) {
      expect(parseAdLibraryInput(`https://${host}/ads/library/?id=${ID}`)?.permalink).toBe(PERMA);
    }
    expect(parseAdLibraryInput(`https://m.facebook.com/ads/library/?id=${ID}`)?.kind).toBe('url');
  });

  it('finds the id among other params, before and after', () => {
    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ID}&media_type=all&search_type=page`;
    expect(parseAdLibraryInput(url)).toEqual({ libraryId: ID, permalink: PERMA, kind: 'url' });
  });

  it('takes a render_ad link and never keeps its access token', () => {
    const r = parseAdLibraryInput('https://www.facebook.com/ads/archive/render_ad/?id=987654321098765&access_token=SECRET');
    expect(r).toEqual({
      libraryId: '987654321098765',
      permalink: 'https://www.facebook.com/ads/library/?id=987654321098765',
      kind: 'url',
    });
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('returns null for a search link with no id, which is still an Ad Library URL', () => {
    const search = 'https://www.facebook.com/ads/library/?active_status=all&q=oats&search_type=keyword_unordered';
    expect(parseAdLibraryInput(search)).toBeNull();
    expect(isAdLibraryUrl(search)).toBe(true);
  });

  it('refuses other hosts', () => {
    expect(parseAdLibraryInput('https://evil.example/ads/library/?id=123456789')).toBeNull();
    expect(parseAdLibraryInput(`https://facebook.com.evil.example/ads/library/?id=${ID}`)).toBeNull();
    expect(parseAdLibraryInput(`https://evil.example/?u=https://www.facebook.com/ads/library/?id=${ID}`)).toBeNull();
  });

  it('refuses other paths and protocols', () => {
    expect(parseAdLibraryInput(`https://www.facebook.com/somepage/?id=${ID}`)).toBeNull();
    expect(parseAdLibraryInput(`https://www.facebook.com/ads/libraryx/?id=${ID}`)).toBeNull();
    expect(parseAdLibraryInput(`ftp://www.facebook.com/ads/library/?id=${ID}`)).toBeNull();
    expect(parseAdLibraryInput(`javascript://www.facebook.com/ads/library/?id=${ID}`)).toBeNull();
  });

  it('refuses ids that are too short, too long or not digits', () => {
    expect(parseAdLibraryInput('12345')).toBeNull();
    expect(parseAdLibraryInput('123456789012345678901')).toBeNull();
    expect(parseAdLibraryInput('12345678a')).toBeNull();
    expect(parseAdLibraryInput('https://www.facebook.com/ads/library/?id=12345')).toBeNull();
    expect(parseAdLibraryInput('https://www.facebook.com/ads/library/?id=abc123456')).toBeNull();
  });

  it('returns null for empty and non string input', () => {
    expect(parseAdLibraryInput('')).toBeNull();
    expect(parseAdLibraryInput('   ')).toBeNull();
    expect(parseAdLibraryInput(null)).toBeNull();
    expect(parseAdLibraryInput(undefined)).toBeNull();
    expect(parseAdLibraryInput(123456789012345)).toBeNull();
    expect(parseAdLibraryInput({ id: ID })).toBeNull();
    expect(parseAdLibraryInput('not a link at all')).toBeNull();
  });
});

describe('isAdLibraryUrl', () => {
  it('is true with or without an id', () => {
    expect(isAdLibraryUrl(PERMA)).toBe(true);
    expect(isAdLibraryUrl('facebook.com/ads/library')).toBe(true);
  });
  it('is false for a bare id, other hosts and junk', () => {
    expect(isAdLibraryUrl(ID)).toBe(false);
    expect(isAdLibraryUrl('https://evil.example/ads/library/?id=123456789')).toBe(false);
    expect(isAdLibraryUrl('')).toBe(false);
    expect(isAdLibraryUrl(null)).toBe(false);
  });
});
