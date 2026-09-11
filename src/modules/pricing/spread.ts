/**
 * Spread a package price across its tests, in proportion to their list prices.
 *
 * Each test on a package booking carries its own share, so removing one test
 * later refunds that test's share, and reports by test add up to what the
 * patient actually paid. Shares are whole rupees; the last test takes the
 * rounding so the shares always sum to the package price exactly.
 */
export function spreadPackagePrice(packagePrice: number, listPrices: number[]): number[] {
  const n = listPrices.length;
  if (n === 0) return [];
  const price = Math.max(0, Math.round(packagePrice));
  const total = listPrices.reduce((s, p) => s + Math.max(0, p), 0);
  const shares = listPrices.map((p) =>
    total > 0 ? Math.round((price * Math.max(0, p)) / total) : Math.round(price / n),
  );
  const allButLast = shares.slice(0, -1).reduce((s, x) => s + x, 0);
  shares[n - 1] = price - allButLast;
  return shares;
}
