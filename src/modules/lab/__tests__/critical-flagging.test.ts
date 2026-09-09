import { describe, it, expect } from 'vitest';
import { flagValue, pickRange, ageInDays, type ReferenceRangeDef } from '../calc-engine';

const range = (over: Partial<ReferenceRangeDef> = {}): ReferenceRangeDef => ({
  sex: 'ANY',
  ageMinDays: 0,
  ageMaxDays: 43800,
  low: null,
  high: null,
  criticalLow: null,
  criticalHigh: null,
  displayText: null,
  ...over,
});

describe('critical thresholds (G1)', () => {
  // Potassium: normal 3.5–5.1, panic below 2.5 or above 6.5
  const potassium = range({ low: 3.5, high: 5.1, criticalLow: 2.5, criticalHigh: 6.5 });

  it('flags a panic-high value CRITICAL, not merely HIGH', () => {
    expect(flagValue(7.5, potassium)).toBe('CRITICAL');
  });

  it('flags a panic-low value CRITICAL', () => {
    expect(flagValue(2.0, potassium)).toBe('CRITICAL');
  });

  it('still distinguishes ordinary high from critical', () => {
    expect(flagValue(5.6, potassium)).toBe('HIGH');
    expect(flagValue(3.0, potassium)).toBe('LOW');
    expect(flagValue(4.2, potassium)).toBe('NORMAL');
  });

  it('treats the threshold itself as critical', () => {
    expect(flagValue(6.5, potassium)).toBe('CRITICAL');
    expect(flagValue(2.5, potassium)).toBe('CRITICAL');
  });

  it('falls back to HIGH/LOW when no panic thresholds are configured', () => {
    const plain = range({ low: 3.5, high: 5.1 });
    expect(flagValue(99, plain)).toBe('HIGH');
    expect(flagValue(0.1, plain)).toBe('LOW');
  });
});

describe('age in days (G2)', () => {
  it('converts entered age by its unit', () => {
    expect(ageInDays({ age: 30, ageUnit: 'YEARS' })).toBe(10950);
    expect(ageInDays({ age: 3, ageUnit: 'MONTHS' })).toBe(90);
    expect(ageInDays({ age: 3, ageUnit: 'DAYS' })).toBe(3);
  });

  it('prefers a date of birth when present', () => {
    const now = new Date('2026-09-08');
    const dob = new Date('2026-09-05');
    expect(ageInDays({ dateOfBirth: dob, age: 40, ageUnit: 'YEARS' }, now)).toBe(3);
  });

  it('returns null when age is unknown', () => {
    expect(ageInDays({ age: null })).toBeNull();
  });

  it('selects a neonatal band that years alone could not express', () => {
    // Bilirubin: newborns run far higher than adults for the first week.
    const ranges = [
      range({ ageMinDays: 0, ageMaxDays: 7, low: 1, high: 12 }),
      range({ ageMinDays: 8, ageMaxDays: 43800, low: 0.2, high: 1.2 }),
    ];
    const newborn = pickRange(ranges, { ageDays: 3, sex: 'MALE' })!;
    const adult = pickRange(ranges, { ageDays: 10950, sex: 'MALE' })!;

    expect(newborn.high).toBe(12);
    expect(adult.high).toBe(1.2);
    // A 3-day-old bilirubin of 10 is normal; the adult range would call it critical.
    expect(flagValue(10, newborn)).toBe('NORMAL');
    expect(flagValue(10, adult)).toBe('HIGH');
  });
});

describe('range selection prefers the most specific match', () => {
  const ranges = [
    range({ sex: 'ANY', low: 12, high: 16 }),
    range({ sex: 'FEMALE', low: 11.5, high: 14 }),
    range({ sex: 'MALE', low: 13.5, high: 17.5 }),
  ];

  it('picks the sex-specific band over ANY, whatever the declaration order', () => {
    expect(pickRange(ranges, { ageDays: 10950, sex: 'FEMALE' })!.high).toBe(14);
    expect(pickRange(ranges, { ageDays: 10950, sex: 'MALE' })!.high).toBe(17.5);
  });

  it('falls back to ANY for an unrecorded sex', () => {
    expect(pickRange(ranges, { ageDays: 10950, sex: null })!.high).toBe(16);
  });

  it('picks the narrowest age band among equally specific matches', () => {
    const banded = [
      range({ ageMinDays: 0, ageMaxDays: 43800, high: 100 }),
      range({ ageMinDays: 0, ageMaxDays: 365, high: 50 }),
    ];
    expect(pickRange(banded, { ageDays: 100, sex: 'MALE' })!.high).toBe(50);
  });

  it('returns null when nothing applies', () => {
    const infantOnly = [range({ ageMinDays: 0, ageMaxDays: 30 })];
    expect(pickRange(infantOnly, { ageDays: 10950, sex: 'MALE' })).toBeNull();
  });
});
