import { describe, it, expect } from 'vitest';
import { adjustPrice } from '../adjust';

describe('adjustPrice', () => {
  it('raises by a percentage and rounds to the step', () => {
    expect(adjustPrice(1000, 10, 10)).toBe(1100);
    expect(adjustPrice(850, 7, 5)).toBe(910);
    expect(adjustPrice(850, 7, 50)).toBe(900);
  });

  it('lowers with a negative percentage', () => {
    expect(adjustPrice(1200, -5, 10)).toBe(1140);
  });

  it('rounds to the rupee', () => {
    expect(adjustPrice(333, 10, 1)).toBe(366);
  });

  it('never goes below zero, and zero stays zero', () => {
    expect(adjustPrice(500, -100, 10)).toBe(0);
    expect(adjustPrice(0, 25, 10)).toBe(0);
  });
});
