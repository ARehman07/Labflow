import { tenantDb } from '@/core/db/context';
import { searchTests } from './search-rank';

export interface TestListItem {
  id: string;
  code: string;
  name: string;
  departmentName: string;
  price: number;
}

/** Resolve the effective price of a test at a branch (latest price whose
 *  effectiveFrom is in the past). Returns 0 if none configured. */
function effectivePrice(
  prices: { price: unknown; branchId: string; effectiveFrom: Date }[],
  branchId: string | null,
): number {
  const now = new Date();
  const applicable = prices
    .filter((p) => (branchId ? p.branchId === branchId : true) && p.effectiveFrom <= now)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return applicable.length ? Number(applicable[0].price) : 0;
}

/** A rate group's own prices for these tests, where it sets one. */
async function groupPrices(rateGroupId: string | null | undefined, testIds: string[]) {
  if (!rateGroupId || testIds.length === 0) return new Map<string, number>();
  const rows = await (await tenantDb()).rateGroupPrice.findMany({
    where: { rateGroupId, testId: { in: testIds } },
    select: { testId: true, price: true },
  });
  return new Map(rows.map((r) => [r.testId, Number(r.price)]));
}

/** Active tests with their price for the given branch, optionally filtered by a
 *  search query (name or code). A rate group's price replaces the branch price
 *  for tests it lists. Read-only catalog access shared across modules. */
export async function listTests(branchId: string | null, query?: string, rateGroupId?: string | null): Promise<TestListItem[]> {
  const db = await tenantDb();
  // Two steps on purpose: rank over names and codes alone — that is all the
  // ranking reads — then fetch departments and price history for the fifty that
  // survive. One keystroke used to pull every test in the catalogue with all of
  // its prices and its department.
  const all = await db.test.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });
  // Ranked in memory: case-insensitive on every database, code and initials first.
  const matched = query ? searchTests(all, query) : all.slice(0, 50);
  const ids = matched.map((t) => t.id);
  if (ids.length === 0) return [];
  const [detail, group] = await Promise.all([
    db.test.findMany({
      where: { id: { in: ids } },
      select: { id: true, department: { select: { name: true } }, prices: true },
    }),
    groupPrices(rateGroupId, ids),
  ]);
  const byId = new Map(detail.map((t) => [t.id, t]));

  return matched.flatMap((t) => {
    const d = byId.get(t.id);
    if (!d) return [];
    return [{
      id: t.id,
      code: t.code,
      name: t.name,
      departmentName: d.department.name,
      price: group.get(t.id) ?? effectivePrice(d.prices, branchId),
    }];
  });
}

/** Prices for a specific set of test ids (used to compute a booking total
 *  server-side — never trust prices sent from the client). */
export async function priceTests(
  branchId: string | null,
  testIds: string[],
  opts?: {
    /** Price retired tests too — removing one from an old booking still has to take its price off. */
    includeInactive?: boolean;
    /** Charge from this price list where it sets a price. */
    rateGroupId?: string | null;
  },
): Promise<Map<string, { name: string; price: number }>> {
  const tests = await (await tenantDb()).test.findMany({
    where: { id: { in: testIds }, ...(opts?.includeInactive ? {} : { isActive: true }) },
    include: { prices: true },
  });
  const group = await groupPrices(opts?.rateGroupId, tests.map((t) => t.id));
  const map = new Map<string, { name: string; price: number }>();
  for (const t of tests) map.set(t.id, { name: t.name, price: group.get(t.id) ?? effectivePrice(t.prices, branchId) });
  return map;
}
