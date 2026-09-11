import { describe, it, expect } from 'vitest';
import { allocateCredit, creditOf } from '../allocate';

describe('allocateCredit', () => {
  const invoices = [{ id: 'a', net: 1000 }, { id: 'b', net: 500 }, { id: 'c', net: 800 }];

  it('settles the oldest bookings first', () => {
    const paid = allocateCredit(1300, invoices);
    expect([...paid.entries()]).toEqual([['a', 1000], ['b', 300], ['c', 0]]);
  });

  it('leaves everything due when nothing is paid', () => {
    expect([...allocateCredit(0, invoices).values()]).toEqual([0, 0, 0]);
  });

  it('pays everything and keeps the rest as credit', () => {
    expect([...allocateCredit(5000, invoices).values()]).toEqual([1000, 500, 800]);
  });

  it('treats a negative balance as nothing paid', () => {
    expect([...allocateCredit(-200, invoices).values()]).toEqual([0, 0, 0]);
  });
});

describe('creditOf', () => {
  it('counts payments and top-ups as credit, refunds against it', () => {
    expect(creditOf('PAYMENT', 500)).toBe(500);
    expect(creditOf('TOPUP', 2000)).toBe(2000);
    expect(creditOf('REFUND', 300)).toBe(-300);
    expect(creditOf('ADJUSTMENT', -100)).toBe(-100);
  });
});
