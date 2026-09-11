import { describe, it, expect } from 'vitest';
import { CODE128_PATTERNS, code128Values, code128Widths } from '../code128';

describe('Code 128 table', () => {
  it('has 107 symbols, each the right width', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = p.split('').map(Number).reduce((a, b) => a + b, 0);
      expect(sum, `symbol ${i}`).toBe(i === 106 ? 13 : 11);
    });
  });

  it('never repeats a symbol', () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });
});

describe('code128Values', () => {
  it('wraps the text in start B, checksum and stop', () => {
    // "AB": A=33, B=34 → (104 + 33·1 + 34·2) mod 103 = 205 mod 103 = 102
    expect(code128Values('AB')).toEqual([104, 33, 34, 102, 106]);
  });

  it('encodes a tube code', () => {
    const v = code128Values('00001-BLD-9W58');
    expect(v[0]).toBe(104);
    expect(v.at(-1)).toBe(106);
    expect(v).toHaveLength(14 + 3);
  });

  it('refuses characters outside subset B', () => {
    expect(() => code128Values('é')).toThrow();
  });
});

describe('code128Widths', () => {
  it('is 11 modules per symbol plus a 13-module stop', () => {
    const w = code128Widths('12345');
    const total = w.reduce((a, b) => a + b, 0);
    // start + 5 chars + checksum = 7 symbols of 11, plus stop 13
    expect(total).toBe(7 * 11 + 13);
    expect(w.length % 2).toBe(1); // starts and ends on a bar
  });
});
