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

/** Active tests with their price for the given branch, optionally filtered by a
 *  search query (name or code). Read-only catalog access shared across modules. */
export async function listTests(branchId: string | null, query?: string): Promise<TestListItem[]> {
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

  return tests.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    departmentName: t.department.name,
    price: effectivePrice(t.prices, branchId),
  }));
}

/** Prices for a specific set of test ids (used to compute a booking total
 *  server-side — never trust prices sent from the client). */
export async function priceTests(
  branchId: string | null,
  testIds: string[],
): Promise<Map<string, { name: string; price: number }>> {
  const tests = await (await tenantDb()).test.findMany({
    where: { id: { in: testIds }, isActive: true },
    include: { prices: true },
  });
  const map = new Map<string, { name: string; price: number }>();
  for (const t of tests) map.set(t.id, { name: t.name, price: effectivePrice(t.prices, branchId) });
  return map;
}
