import { describe, it, expect } from 'vitest';
import { westgard } from '../westgard';

// Target mean 100, SD 2: 1 SD = 102, 2 SD = 104, 3 SD = 106.
const run = (...v: number[]) => westgard(v, 100, 2);

describe('westgard', () => {
  it('passes an in-control value', () => {
    expect(run(101)).toEqual({ z: 0.5, warnings: [], rejections: [] });
  });

  it('warns at 1-2s and rejects at 1-3s', () => {
    expect(run(104.5).warnings).toEqual(['1-2s']);
    expect(run(106.5).rejections).toContain('1-3s');
  });

  it('rejects two in a row beyond 2 SD on the same side (2-2s)', () => {
    expect(run(104.5, 104.8).rejections).toContain('2-2s');
    expect(run(104.5, 95.5).rejections).not.toContain('2-2s');
  });

  it('rejects a 4 SD spread across the mean (R-4s)', () => {
    expect(run(104.5, 95.4).rejections).toContain('R-4s');
  });

  it('rejects four in a row beyond 1 SD on one side (4-1s)', () => {
    expect(run(102.5, 102.4, 103, 102.2).rejections).toContain('4-1s');
  });

  it('rejects ten in a row on one side of the mean (10-x)', () => {
    expect(run(100.5, 100.2, 101, 100.1, 100.4, 100.9, 100.3, 100.6, 100.2, 100.1).rejections).toEqual(['10-x']);
  });

  it('ignores a control with no SD', () => {
    expect(westgard([5], 5, 0)).toEqual({ z: 0, warnings: [], rejections: [] });
  });
});
