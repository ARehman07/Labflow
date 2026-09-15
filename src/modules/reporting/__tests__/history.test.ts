import { describe, expect, it } from 'vitest';
import { analyteKey, historyCutoff, pickHistory, sameUnit, type EarlierRow } from '../history';

const visit = (id: string, month: number) => ({ id, slipNo: id.toUpperCase(), bookedAt: new Date(2026, month, 1) });
const row = (key: string, value: string | null, v: ReturnType<typeof visit>, unit = 'mg/dL', flag = 'NORMAL'): EarlierRow =>
  ({ key, value, flag, unit, visit: v });

describe('analyteKey', () => {
  it('joins parameters of different tests on the analyte code, case-insensitively', () => {
    expect(analyteKey({ id: 'lipid-tchol', analyteCode: 'tchol' })).toBe(analyteKey({ id: 'chol-alone', analyteCode: 'TCHOL ' }));
  });

  it('keeps a parameter without a code to itself', () => {
    expect(analyteKey({ id: 'p1', analyteCode: null })).toBe('P:p1');
    expect(analyteKey({ id: 'p1', analyteCode: '  ' })).not.toBe(analyteKey({ id: 'p2', analyteCode: '  ' }));
  });
});

describe('pickHistory', () => {
  const nov = visit('nov', 10);
  const sep = visit('sep', 8);
  const jun = visit('jun', 5);
  const mar = visit('mar', 2);

  it('takes the newest visits up to the limit', () => {
    const rows = [row('A:TCHOL', '240', nov), row('A:TCHOL', '255', sep), row('A:TCHOL', '262', jun), row('A:TCHOL', '270', mar)];
    const { columns } = pickHistory(['A:TCHOL'], rows, 3);
    expect(columns.map((c) => c.visitId)).toEqual(['nov', 'sep', 'jun']);
  });

  it('never makes a column from a visit with nothing printed today', () => {
    // Sep only measured VLDL, which is not on today's report.
    const rows = [row('A:TCHOL', '240', nov), row('A:VLDL', '30', sep), row('A:TCHOL', '262', jun)];
    const { columns } = pickHistory(['A:TCHOL', 'A:HDL'], rows, 3);
    expect(columns.map((c) => c.visitId)).toEqual(['nov', 'jun']);
  });

  it('ignores blank earlier values when choosing columns', () => {
    const rows = [row('A:HDL', '', nov), row('A:HDL', null, sep), row('A:HDL', '38', jun)];
    const { columns } = pickHistory(['A:HDL'], rows, 3);
    expect(columns.map((c) => c.visitId)).toEqual(['jun']);
  });

  it('fills cells by visit and analyte, keeping the newest when a visit has two', () => {
    const rows = [row('A:TCHOL', '210', nov), row('A:TCHOL', '215', nov), row('A:HDL', '40', sep)];
    const { cell } = pickHistory(['A:TCHOL', 'A:HDL'], rows, 3);
    expect(cell.get('nov:A:TCHOL')?.value).toBe('210');
    expect(cell.get('sep:A:HDL')?.value).toBe('40');
    expect(cell.get('sep:A:TCHOL')).toBeUndefined();
  });
});

describe('historyCutoff', () => {
  it('reaches back the given number of months', () => {
    expect(historyCutoff(new Date(2026, 8, 16), 24)?.getFullYear()).toBe(2024);
    expect(historyCutoff(new Date(2026, 8, 16), 24)?.getMonth()).toBe(8);
  });

  it('means no limit at zero', () => {
    expect(historyCutoff(new Date(), 0)).toBeNull();
  });
});

describe('sameUnit', () => {
  it('treats spelling and spacing of one unit as equal, and different units as not', () => {
    expect(sameUnit('mg/dL', 'mg/dl ')).toBe(true);
    expect(sameUnit(null, '')).toBe(true);
    expect(sameUnit('mg/dL', 'mmol/L')).toBe(false);
  });
});
