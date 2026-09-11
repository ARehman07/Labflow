import { describe, it, expect } from 'vitest';
import { computeResultSet, cutoffFlag, interpretCutoff, type ParameterDef } from '../calc-engine';

describe('cut-off results', () => {
  it('reads at or above the cut-off as positive', () => {
    expect(cutoffFlag(1.2, 1)).toBe('HIGH');
    expect(cutoffFlag(1, 1)).toBe('HIGH');
    expect(cutoffFlag(0.4, 1)).toBe('NORMAL');
    expect(cutoffFlag(null, 1)).toBe('NORMAL');
  });

  it('prints Reactive / Non-reactive unless told otherwise', () => {
    expect(interpretCutoff(2.5, 1)).toBe('Reactive');
    expect(interpretCutoff(0.2, 1)).toBe('Non-reactive');
    expect(interpretCutoff(0.2, 1, 'Positive', 'Negative')).toBe('Negative');
    expect(interpretCutoff(null, 1)).toBeNull();
  });

  it('flags a cut-off parameter when results are computed', () => {
    const params: ParameterDef[] = [{
      id: 'p1', code: 'HBSAG', name: 'HBsAg (index)', unit: 'S/CO', valueType: 'CUTOFF',
      sortOrder: 1, referenceRanges: [], formula: null, cutoff: 1,
    }];
    const [r] = computeResultSet(params, { HBSAG: '3.4' }, { ageDays: null, sex: null });
    expect(r.flag).toBe('HIGH');
    expect(r.numericValue).toBe(3.4);
  });
});
