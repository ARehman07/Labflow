import { describe, it, expect } from 'vitest';
import { holdFrom } from '../report-hold';

const base = { net: 2100, paid: 0, onAccount: false, releasedUnpaid: false, holdOn: true };

describe('holdFrom — a report waits for its bill', () => {
  it('holds a report with money due, and says how much', () => {
    expect(holdFrom(base)).toEqual({ held: true, due: 2100 });
    expect(holdFrom({ ...base, paid: 1500 })).toEqual({ held: true, due: 600 });
  });
  it('lets a paid report go', () => {
    expect(holdFrom({ ...base, paid: 2100 }).held).toBe(false);
    expect(holdFrom({ ...base, paid: 2100 }).due).toBe(0);
  });
  it('does not hold over rounding', () => {
    expect(holdFrom({ ...base, net: 1785.4, paid: 1785 }).held).toBe(false);
  });
  it('never holds a slip billed to a partner lab on account', () => {
    expect(holdFrom({ ...base, onAccount: true }).held).toBe(false);
  });
  it('lets a report out that was released by hand, still showing the debt', () => {
    expect(holdFrom({ ...base, releasedUnpaid: true })).toEqual({ held: false, due: 2100 });
  });
  it('holds nothing when the lab has the rule off', () => {
    expect(holdFrom({ ...base, holdOn: false }).held).toBe(false);
  });
});
