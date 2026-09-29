import { describe, it, expect } from 'vitest';
import { compactNum, formatMoney, formatNum } from '../src/lib/format.js';

describe('compactNum', () => {
  it('keeps small numbers as they are', () => {
    expect(compactNum(999)).toBe('999');
    expect(compactNum(0)).toBe('0');
  });
  it('shortens thousands and millions', () => {
    expect(compactNum(1000)).toBe('1k');
    expect(compactNum(1500)).toBe('1.5k');
    expect(compactNum(1000000)).toBe('1M');
    expect(compactNum(2500000)).toBe('2.5M');
  });
  it('handles negatives', () => {
    expect(compactNum(-1500)).toBe('-1.5k');
  });
  it('shows a dash for anything that is not a number', () => {
    expect(compactNum(NaN)).toBe('-');
    expect(compactNum('abc')).toBe('-');
    expect(compactNum(undefined)).toBe('-');
  });
  it('accepts numeric strings', () => {
    expect(compactNum('1500')).toBe('1.5k');
  });
});

// Decimal and group separators follow the machine's locale, so the expected
// text is built with the same API.
const two = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

describe('formatMoney', () => {
  it('uses the euro sign by default, two decimals', () => {
    expect(formatMoney(12.5)).toBe(`€${two(12.5)}`);
    expect(formatMoney(12.5)).toMatch(/^€12[.,]50$/);
  });
  it('takes a custom symbol', () => {
    expect(formatMoney(3, '$')).toBe(`$${two(3)}`);
  });
  it('shows a dash for NaN', () => {
    expect(formatMoney(NaN)).toBe('-');
  });
});

describe('formatNum', () => {
  it('groups thousands the way the locale does', () => {
    expect(formatNum(1240)).toBe((1240).toLocaleString());
    expect(formatNum(12)).toBe('12');
  });
  it('shows a dash for anything that is not a number', () => {
    expect(formatNum(NaN)).toBe('-');
    expect(formatNum(Infinity)).toBe('-');
  });
});
