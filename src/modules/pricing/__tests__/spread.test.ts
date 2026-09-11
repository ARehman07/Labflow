import { describe, it, expect } from 'vitest';
import { spreadPackagePrice } from '../spread';

describe('spreadPackagePrice', () => {
  it('shares the package price by list price and sums exactly', () => {
    // CBC 600 + LFT 1200 + RFT 1200 = 3000 listed, sold as a 2400 package
    const s = spreadPackagePrice(2400, [600, 1200, 1200]);
    expect(s).toEqual([480, 960, 960]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(2400);
  });

  it('puts the rounding on the last test', () => {
    const s = spreadPackagePrice(1000, [1, 1, 1]);
    expect(s).toEqual([333, 333, 334]);
  });

  it('splits evenly when the tests have no list price', () => {
    expect(spreadPackagePrice(900, [0, 0, 0])).toEqual([300, 300, 300]);
  });

  it('handles an empty package', () => {
    expect(spreadPackagePrice(500, [])).toEqual([]);
  });
});
