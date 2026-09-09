import { describe, it, expect } from 'vitest';
import { computeResultSet, pickRange, flagValue, type ParameterDef } from '../calc-engine';

const range = (over: Partial<ParameterDef['referenceRanges'][number]> = {}) => ({
  sex: 'ANY' as const,
  ageMinDays: 0,
  ageMaxDays: 43800,
  low: null,
  high: null,
  criticalLow: null,
  criticalHigh: null,
  displayText: null,
  ...over,
});

const lipidParams: ParameterDef[] = [
  { id: 'p1', code: 'TCHOL', name: 'Total Cholesterol', unit: 'mg/dL', valueType: 'NUMBER', sortOrder: 1, referenceRanges: [range({ high: 200 })], formula: null },
  { id: 'p2', code: 'HDL', name: 'HDL', unit: 'mg/dL', valueType: 'NUMBER', sortOrder: 2, referenceRanges: [range({ low: 40 })], formula: null },
  { id: 'p3', code: 'TG', name: 'Triglycerides', unit: 'mg/dL', valueType: 'NUMBER', sortOrder: 3, referenceRanges: [range({ high: 150 })], formula: null },
  { id: 'p4', code: 'LDL', name: 'LDL', unit: 'mg/dL', valueType: 'CALCULATED', sortOrder: 4, referenceRanges: [range({ high: 100 })], formula: { expression: 'TCHOL - HDL - (TG / 5)', inputs: ['TCHOL', 'HDL', 'TG'] } },
  { id: 'p5', code: 'RATIO', name: 'Chol/HDL Ratio', unit: null, valueType: 'CALCULATED', sortOrder: 5, referenceRanges: [range({ low: 3.5, high: 5 })], formula: { expression: 'TCHOL / HDL', inputs: ['TCHOL', 'HDL'] } },
];

describe('computeResultSet', () => {
  it('computes calculated parameters (LDL, ratio) from measured values', () => {
    const out = computeResultSet(lipidParams, { TCHOL: '210', HDL: '45', TG: '150' }, { ageDays: 14600, sex: 'MALE' });
    const ldl = out.find((r) => r.code === 'LDL')!;
    const ratio = out.find((r) => r.code === 'RATIO')!;
    expect(ldl.numericValue).toBe(135);
    expect(ldl.isCalculated).toBe(true);
    expect(ratio.numericValue).toBeCloseTo(4.67, 2);
  });

  it('flags out-of-range values correctly', () => {
    const out = computeResultSet(lipidParams, { TCHOL: '210', HDL: '45', TG: '150' }, { ageDays: 14600, sex: 'MALE' });
    expect(out.find((r) => r.code === 'TCHOL')!.flag).toBe('HIGH'); // 210 > 200
    expect(out.find((r) => r.code === 'HDL')!.flag).toBe('NORMAL'); // 45 > low 40
    expect(out.find((r) => r.code === 'LDL')!.flag).toBe('HIGH'); // 135 > 100
    expect(out.find((r) => r.code === 'RATIO')!.flag).toBe('NORMAL'); // 4.67 within 3.5–5
  });

  it('leaves a calculated value blank if an input is missing (no crash)', () => {
    const out = computeResultSet(lipidParams, { TCHOL: '210', HDL: '', TG: '150' }, { ageDays: 14600, sex: 'MALE' });
    const ldl = out.find((r) => r.code === 'LDL')!;
    expect(ldl.numericValue).toBeNull();
    expect(ldl.value).toBeNull();
  });

  it('keeps OPTION/TEXT values as-is without flags', () => {
    const params: ParameterDef[] = [
      { id: 'b', code: 'GRP', name: 'Blood Group', unit: null, valueType: 'OPTION', sortOrder: 1, referenceRanges: [], formula: null },
    ];
    const out = computeResultSet(params, { GRP: 'B+' }, { ageDays: 10950, sex: 'FEMALE' });
    expect(out[0].value).toBe('B+');
    expect(out[0].flag).toBe('NORMAL');
    expect(out[0].numericValue).toBeNull();
  });
});

describe('pickRange (age/sex aware)', () => {
  const ranges = [
    range({ sex: 'MALE', low: 13, high: 17 }),
    range({ sex: 'FEMALE', low: 12, high: 15 }),
  ];
  it('picks the male range for a male patient', () => {
    expect(pickRange(ranges, { ageDays: 10950, sex: 'MALE' })).toMatchObject({ sex: 'MALE' });
  });
  it('picks the female range for a female patient', () => {
    expect(pickRange(ranges, { ageDays: 10950, sex: 'FEMALE' })).toMatchObject({ sex: 'FEMALE' });
  });
});

describe('flagValue', () => {
  it('returns LOW / HIGH / NORMAL', () => {
    const r = range({ low: 10, high: 20 });
    expect(flagValue(5, r)).toBe('LOW');
    expect(flagValue(25, r)).toBe('HIGH');
    expect(flagValue(15, r)).toBe('NORMAL');
    expect(flagValue(null, r)).toBe('NORMAL');
  });
});
