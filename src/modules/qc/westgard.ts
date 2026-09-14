/**
 * Westgard rules for a control run, judged on the newest value against the
 * control's target mean and SD, with the runs before it for the multi-run rules.
 *
 *   1-2s  one value beyond ±2 SD            → warning: look at the other rules
 *   1-3s  one value beyond ±3 SD            → reject (random error)
 *   2-2s  two in a row beyond 2 SD, same side → reject (systematic error)
 *   R-4s  two in a row 4 SD apart, opposite sides → reject (random error)
 *   4-1s  four in a row beyond 1 SD, same side → reject (systematic error)
 *   10-x  ten in a row on the same side of the mean → reject (systematic error)
 *
 * Pure and session-free so each rule is tested directly.
 */
export interface WestgardResult {
  z: number;
  warnings: string[];
  rejections: string[];
}

export function westgard(values: number[], mean: number, sd: number): WestgardResult {
  if (values.length === 0 || !(sd > 0)) return { z: 0, warnings: [], rejections: [] };
  const zs = values.map((v) => (v - mean) / sd);
  const last = zs[zs.length - 1];
  const lastN = (n: number) => (zs.length >= n ? zs.slice(-n) : null);
  const warnings: string[] = [];
  const rejections: string[] = [];

  if (Math.abs(last) > 3) rejections.push('1-3s');
  else if (Math.abs(last) > 2) warnings.push('1-2s');

  const two = lastN(2);
  if (two) {
    if ((two[0] > 2 && two[1] > 2) || (two[0] < -2 && two[1] < -2)) rejections.push('2-2s');
    if (Math.abs(two[0] - two[1]) > 4 && Math.sign(two[0]) !== Math.sign(two[1])) rejections.push('R-4s');
  }
  const four = lastN(4);
  if (four && (four.every((z) => z > 1) || four.every((z) => z < -1))) rejections.push('4-1s');
  const ten = lastN(10);
  if (ten && (ten.every((z) => z > 0) || ten.every((z) => z < 0))) rejections.push('10-x');

  return { z: Math.round(last * 100) / 100, warnings, rejections };
}
