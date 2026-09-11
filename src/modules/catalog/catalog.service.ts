import { tenantDb } from '@/core/db/context';

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
  const tests = await (await tenantDb()).test.findMany({
    where: {
      isActive: true,
      ...(query
        ? {
            OR: [
              // NOTE: case-insensitive on SQLite (LIKE) by default. For Postgres,
              // add a citext column or ILIKE for case-insensitive name search.
              { name: { contains: query } },
              { code: { contains: query } },
            ],
          }
        : {}),
    },
    include: { department: true, prices: true },
    orderBy: { name: 'asc' },
    take: 50,
  });
  const group = await groupPrices(rateGroupId, tests.map((t) => t.id));

  return tests.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    departmentName: t.department.name,
    price: group.get(t.id) ?? effectivePrice(t.prices, branchId),
  }));
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
