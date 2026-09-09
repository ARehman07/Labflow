import { describe, it, expect } from 'vitest';
import { statusFor, statusAfterRefund } from '../invoice-status';

describe('statusFor', () => {
  it('maps how much is paid onto a status', () => {
    expect(statusFor(1000, 0)).toBe('DUE');
    expect(statusFor(1000, 400)).toBe('PARTIAL');
    expect(statusFor(1000, 1000)).toBe('PAID');
    expect(statusFor(1000, 1200)).toBe('PAID');
  });
});

describe('statusAfterRefund', () => {
  it('marks a full refund REFUNDED', () => {
    expect(statusAfterRefund(2780, 2780, 2780)).toBe('REFUNDED');
  });

  it('leaves a partially refunded invoice collectable, not REFUNDED', () => {
    // The regression: this used to return REFUNDED, which dropped the Rs 100
    // still owed out of the Due filter while the summary kept counting it.
    expect(statusAfterRefund(2780, 2780, 100)).toBe('PARTIAL');
  });

  it('a partial refund on a partly-paid invoice stays PARTIAL', () => {
    expect(statusAfterRefund(1000, 600, 100)).toBe('PARTIAL');
  });

  it('refunding everything that was paid on a part-paid invoice is REFUNDED', () => {
    expect(statusAfterRefund(1000, 600, 600)).toBe('REFUNDED');
  });

  it('never reports a status that hides an outstanding balance', () => {
    for (const [net, paid, refund] of [
      [1000, 1000, 1], [1000, 1000, 999], [500, 300, 50], [2780, 2780, 100],
    ]) {
      const status = statusAfterRefund(net, paid, refund);
      const owed = net - (paid - refund);
      if (owed > 0) expect(['DUE', 'PARTIAL']).toContain(status);
    }
  });
});
