import { describe, it, expect } from 'vitest';
import { rebill } from '../rebill';

describe('rebill', () => {
  it('keeps a percentage discount at the same rate', () => {
    // 15% card on Rs 1800 was Rs 270. Remove a Rs 600 test.
    expect(rebill({ gross: 1800, discount: 270, source: 'FAMILY_CARD', cardFee: 0, newGross: 1200 }))
      .toEqual({ gross: 1200, discount: 180, net: 1020 });
  });

  it('keeps a care-of rate when a test is added', () => {
    expect(rebill({ gross: 1000, discount: 100, source: 'CARE_OF', cardFee: 0, newGross: 1450 }))
      .toEqual({ gross: 1450, discount: 145, net: 1305 });
  });

  it('keeps a fixed amount, but never more than the bill', () => {
    expect(rebill({ gross: 1000, discount: 300, source: 'MANUAL_FIXED', cardFee: 0, newGross: 800 }).discount).toBe(300);
    expect(rebill({ gross: 1000, discount: 300, source: 'MANUAL_FIXED', cardFee: 0, newGross: 200 }))
      .toEqual({ gross: 200, discount: 200, net: 0 });
  });

  it('leaves the card fee on the bill', () => {
    expect(rebill({ gross: 1800, discount: 270, source: 'FAMILY_CARD', cardFee: 300, newGross: 0 }))
      .toEqual({ gross: 0, discount: 0, net: 300 });
  });

  it('adds no discount where there was none', () => {
    expect(rebill({ gross: 450, discount: 0, source: 'NONE', cardFee: 0, newGross: 900 }))
      .toEqual({ gross: 900, discount: 0, net: 900 });
  });
});
