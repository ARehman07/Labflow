import { describe, it, expect } from 'vitest';
import { searchTests } from '../search-rank';

const catalogue = [
  { code: 'CBC', name: 'Complete Blood Count' },
  { code: 'ABO', name: 'Blood Group (ABO & Rh)' },
  { code: 'RBS', name: 'Blood Sugar Random' },
  { code: 'LIPID', name: 'Lipid Profile' },
  { code: 'HBA1C', name: 'HbA1c' },
  { code: 'UCS', name: 'Urine Culture & Sensitivity' },
];
const names = (q: string) => searchTests(catalogue, q).map((t) => t.code);

describe('test search', () => {
  it('finds a test by its code in any case', () => {
    expect(names('CBC')[0]).toBe('CBC');
    expect(names('cbc')[0]).toBe('CBC');
    expect(names('hba1c')[0]).toBe('HBA1C');
  });

  it('finds a test by its initials', () => {
    expect(names('ucs')[0]).toBe('UCS');
  });

  it('finds a test by any word or the start of its name, in any case', () => {
    expect(names('complete')).toEqual(['CBC']);
    expect(names('Complete Blood')).toEqual(['CBC']);
    expect(names('blood count')[0]).toBe('CBC');
    expect(names('bl co')).toContain('CBC');
    expect(names('blood')).toEqual(expect.arrayContaining(['CBC', 'ABO', 'RBS']));
  });

  it('puts the exact code before tests that merely mention the letters', () => {
    expect(names('abo')[0]).toBe('ABO');
  });

  it('returns nothing for an unrelated query', () => {
    expect(names('thyroid')).toEqual([]);
  });
});
