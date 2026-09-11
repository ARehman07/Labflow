import { describe, it, expect } from 'vitest';
import { ageFromDob } from '../age';

const now = new Date('2026-09-11T12:00:00');

describe('ageFromDob', () => {
  it('uses days for a newborn', () => {
    expect(ageFromDob(new Date('2026-09-01'), now)).toEqual({ age: 10, unit: 'DAYS' });
  });
  it('uses months under two years', () => {
    expect(ageFromDob(new Date('2025-03-11'), now)).toEqual({ age: 18, unit: 'MONTHS' });
  });
  it('uses whole years after that, not rounding up before the birthday', () => {
    expect(ageFromDob(new Date('1990-09-12'), now)).toEqual({ age: 35, unit: 'YEARS' });
    expect(ageFromDob(new Date('1990-09-11'), now)).toEqual({ age: 36, unit: 'YEARS' });
  });
});
