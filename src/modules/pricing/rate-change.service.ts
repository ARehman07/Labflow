import { tenantDb, currentTenantId } from '@/core/db/context';
import { adjustPrice } from './adjust';

export interface RateChangeInput {
  /** Standard prices at a branch (or every branch), or one rate group's own prices. */
  scope: 'BRANCH' | 'RATE_GROUP';
  branchId: string | null;
  rateGroupId: string | null;
  departmentId: string | null;
  groupId: string | null;
  status: 'ACTIVE' | 'ALL';
  pct: number;
  roundTo: number;
}

export interface RateChangeRow {
  key: string;
  testId: string;
  name: string;
  code: string;
  department: string;
  branchId: string | null;
  branchName: string | null;
  current: number;
  next: number;
}

/** Every price the change reaches, with what it is now and what it would become. */
async function rows(input: RateChangeInput): Promise<RateChangeRow[]> {
  const db = await tenantDb();
  const testWhere = {
    ...(input.status === 'ACTIVE' ? { isActive: true } : {}),
    ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
  };

  // A rate group changes only the prices it sets itself; its other tests follow
  // the standard price, and giving them one here would quietly fork them off it.
  if (input.scope === 'RATE_GROUP') {
    if (!input.rateGroupId) return [];
    const own = await db.rateGroupPrice.findMany({
      where: { rateGroupId: input.rateGroupId, test: testWhere },
      select: { testId: true, price: true, test: { select: { name: true, code: true, department: { select: { name: true } } } } },
      orderBy: { test: { name: 'asc' } },
    });
    return own.map((o) => {
      const current = Number(o.price);
      return {
        key: o.testId, testId: o.testId, name: o.test.name, code: o.test.code, department: o.test.department.name,
        branchId: null, branchName: null, current, next: adjustPrice(current, input.pct, input.roundTo),
      };
    });
  }

  const [branches, tests] = await Promise.all([
    db.branch.findMany({ where: { isActive: true, ...(input.branchId ? { id: input.branchId } : {}) }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
    db.test.findMany({
      where: testWhere,
      select: { id: true, name: true, code: true, department: { select: { name: true } }, prices: { select: { branchId: true, price: true, effectiveFrom: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  const now = new Date();
  const out: RateChangeRow[] = [];
  for (const t of tests) {
    for (const b of branches) {
      // The price in force today: the latest one dated before now.
      const latest = t.prices
        .filter((p) => p.branchId === b.id && p.effectiveFrom <= now)
        .sort((x, y) => y.effectiveFrom.getTime() - x.effectiveFrom.getTime())[0];
      if (!latest) continue;
      const current = Number(latest.price);
      out.push({
        key: `${t.id}:${b.id}`, testId: t.id, name: t.name, code: t.code, department: t.department.name,
        branchId: b.id, branchName: b.name, current, next: adjustPrice(current, input.pct, input.roundTo),
      });
    }
  }
  return out;
}

export const rateChangeService = {
  preview: rows,

  /**
   * Apply the change. Worked out again here from the choices, never from
   * prices a browser sent. A standard price change is a new dated price, so
   * slips already billed keep what they were charged; a rate group's price is
   * simply replaced, as editing that list by hand does.
   */
  async apply(input: RateChangeInput, userId: string): Promise<number> {
    const changed = (await rows(input)).filter((r) => r.next !== r.current);
    if (changed.length === 0) return 0;
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const at = new Date();
    await db.$transaction(async (tx) => {
      if (input.scope === 'RATE_GROUP') {
        for (const r of changed) {
          await tx.rateGroupPrice.update({
            where: { rateGroupId_testId: { rateGroupId: input.rateGroupId!, testId: r.testId } },
            data: { price: r.next },
          });
        }
      } else {
        await tx.testPrice.createMany({
          data: changed.map((r) => ({ tenantId, testId: r.testId, branchId: r.branchId!, price: r.next, effectiveFrom: at })),
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId, actorId: userId, entity: 'Tenant', entityId: tenantId, action: 'RATES_CHANGED',
          after: JSON.stringify({ ...input, prices: changed.length }),
        },
      });
    }, { timeout: 60_000 });
    return changed.length;
  },

  async options() {
    const db = await tenantDb();
    const [branches, departments, groups, rateGroups] = await Promise.all([
      db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
      db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.testGroup.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.rateGroup.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { branches, departments, groups, rateGroups };
  },
};
