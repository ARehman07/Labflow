import { describe, expect, it } from 'vitest';
import { normaliseName, suggestAnalyte } from '../analyte-suggest';

describe('normaliseName', () => {
  it('drops capitals, brackets and punctuation', () => {
    expect(normaliseName('LDL Cholesterol (calculated)')).toBe('ldl cholesterol');
    expect(normaliseName('Cholesterol / HDL Ratio')).toBe('cholesterol hdl ratio');
    expect(normaliseName('  ALT (SGPT) ')).toBe('alt');
  });
});

describe('suggestAnalyte', () => {
  it('recognises the starter catalogue', () => {
    const cases: [string, string, string][] = [
      ['Haemoglobin', 'V1', 'HB'],
      ['Random Blood Sugar', 'V1', 'GLUCOSE_R'],
      ['Creatinine', 'V1', 'CREAT'],
      ['HbA1c', 'V1', 'HBA1C'],
      ['Uric Acid', 'V1', 'URIC'],
      ['Blood Group', 'V1', 'ABO'],
      ['Total Cholesterol', 'TCHOL', 'TCHOL'],
      ['HDL Cholesterol', 'HDL', 'HDL'],
      ['Triglycerides', 'TG', 'TG'],
      ['LDL Cholesterol (calculated)', 'LDL', 'LDL'],
      ['Cholesterol / HDL Ratio', 'CHOL_HDL', 'CHOL_HDL'],
      ['HBsAg index', 'V1', 'HBSAG'],
    ];
    for (const [name, code, want] of cases) expect(suggestAnalyte({ name, code }), name).toBe(want);
  });

  it('keeps fasting and random sugar apart', () => {
    expect(suggestAnalyte({ name: 'Fasting Blood Sugar', code: 'V1' })).toBe('GLUCOSE_F');
    expect(suggestAnalyte({ name: 'Blood Sugar Random', code: 'V1' })).toBe('GLUCOSE_R');
  });

  it('falls back to a parameter code that is already a known analyte', () => {
    expect(suggestAnalyte({ name: 'Chol.', code: 'tchol' })).toBe('TCHOL');
  });

  it('never guesses', () => {
    expect(suggestAnalyte({ name: 'Mystery marker', code: 'V1' })).toBeNull();
    expect(suggestAnalyte({ name: 'Cholesterol crystals in urine', code: 'X1' })).toBeNull();
  });
});
