/** Rounding a lab can choose for new prices: to the rupee, or to a tidy 5, 10, 50 or 100. */
export const ROUND_STEPS = [1, 5, 10, 50, 100] as const;

/**
 * A price after a percentage change, rounded to the nearest step. Never below
 * zero, and a test priced at zero stays free.
 */
export function adjustPrice(price: number, pct: number, roundTo: number): number {
  const step = roundTo > 0 ? roundTo : 1;
  const raw = price * (1 + pct / 100);
  return Math.max(0, Math.round(raw / step) * step);
}
