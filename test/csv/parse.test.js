import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvWithLines, detectDelimiter } from '../../src/lib/csv/parse.js';

describe('parseCsv', () => {
  it('splits plain rows and cells', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('keeps commas inside quotes and unescapes doubled quotes', () => {
    expect(parseCsv('name,copy\n"Brand, Inc","She said ""hi"""')).toEqual([
      ['name', 'copy'],
      ['Brand, Inc', 'She said "hi"'],
    ]);
  });
  it('handles CRLF and a lone CR', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('strips a byte order mark', () => {
    expect(parseCsv('﻿brand,hook\nX,Y')[0]).toEqual(['brand', 'hook']);
  });
  it('skips blank lines and lines of empty cells, and a trailing newline', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps newlines inside quotes', () => {
    expect(parseCsv('hook,copy\nH,"line one\nline two"\n')).toEqual([['hook', 'copy'], ['H', 'line one\nline two']]);
  });
  it('does not trim cells', () => {
    expect(parseCsv(' a , b ')).toEqual([[' a ', ' b ']]);
  });
  it('reads semicolon files when the header has more semicolons than commas', () => {
    expect(parseCsv('brand;copy;days\nX;"a, b";3')).toEqual([['brand', 'copy', 'days'], ['X', 'a, b', '3']]);
  });
  it('an explicit delimiter wins', () => {
    expect(parseCsv('a;b,c', { delimiter: ',' })).toEqual([['a;b', 'c']]);
  });
  it('empty and missing input give no rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
    expect(parseCsv(undefined)).toEqual([]);
  });
  it('an unclosed quote runs to the end of the file', () => {
    expect(parseCsv('a,b\n"x,y')).toEqual([['a', 'b'], ['x,y']]);
  });
});

describe('detectDelimiter', () => {
  it('counts only outside quotes and only on the first line', () => {
    expect(detectDelimiter('"a;b;c",d')).toBe(',');
    expect(detectDelimiter('a;b\n,,,,,')).toBe(';');
    expect(detectDelimiter('a,b;c')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
  });
});

describe('parseCsvWithLines', () => {
  it('gives the same rows as parseCsv and the line each starts on', () => {
    const text = 'brand,copy\r\nA,"one\r\ntwo"\r\n\r\nB,x\nC,"a\nb\nc"\nD,y';
    const { rows, lines } = parseCsvWithLines(text);
    expect(rows).toEqual(parseCsv(text));
    expect(lines).toEqual([1, 2, 5, 6, 9]);
  });
});
