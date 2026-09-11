import { tenantDb, currentTenantId } from '@/core/db/context';
import { priceTests } from '@/modules/catalog/catalog.service';

/** A refusal written for the person at the screen. */
export class PricingError extends Error {}

/**
 * Packages, rate groups and collection points — the price lists a lab sells
 * from besides its standard one.
 */
export const pricingService = {
  // ── Packages ──
  async listPackages(branchId: string | null, includeInactive = false) {
    const db = await tenantDb();
    const rows = await db.testPackage.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { items: { include: { test: { select: { id: true, name: true } } } } },
    });
    const ids = [...new Set(rows.flatMap((r) => r.items.map((i) => i.testId)))];
    const prices = await priceTests(branchId, ids, { includeInactive: true });
    return rows.map((r) => {
      const tests = r.items.map((i) => ({ id: i.testId, name: i.test.name, price: prices.get(i.testId)?.price ?? 0 }));
      return {
        id: r.id,
        name: r.name,
        price: Number(r.price),
        isActive: r.isActive,
        listTotal: tests.reduce((s, x) => s + x.price, 0),
        tests,
      };
    });
  },

  async savePackage(id: string | null, input: { name: string; price: number; testIds: string[] }) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const testIds = [...new Set(input.testIds)];
    if (testIds.length < 2) throw new PricingError('A package needs at least two tests.');
    const found = await db.test.count({ where: { id: { in: testIds }, isActive: true } });
    if (found !== testIds.length) throw new PricingError('One or more selected tests are not available.');
    const clash = await db.testPackage.findFirst({ where: { name: input.name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (clash) throw new PricingError(`A package named "${input.name}" already exists.`);

    return db.$transaction(async (tx) => {
      const pkg = id
        ? await tx.testPackage.update({ where: { id }, data: { name: input.name, price: input.price }, select: { id: true } })
        : await tx.testPackage.create({ data: { tenantId, name: input.name, price: input.price }, select: { id: true } });
      await tx.testPackageItem.deleteMany({ where: { packageId: pkg.id } });
      for (const testId of testIds) {
        await tx.testPackageItem.create({ data: { tenantId, packageId: pkg.id, testId } });
      }
      return pkg.id;
    });
  },

  async setPackageActive(id: string, isActive: boolean) {
    await (await tenantDb()).testPackage.update({ where: { id }, data: { isActive } });
  },

  // ── Rate groups ──
  async listRateGroups(includeInactive = false) {
    const rows = await (await tenantDb()).rateGroup.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { prices: true, partnerLabs: true, collectionPoints: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      defaultDiscountPct: Number(r.defaultDiscountPct),
      isActive: r.isActive,
      priceCount: r._count.prices,
      usedBy: r._count.partnerLabs + r._count.collectionPoints,
    }));
  },

  async saveRateGroup(id: string | null, input: { name: string; defaultDiscountPct: number }) {
    const db = await tenantDb();
    const clash = await db.rateGroup.findFirst({ where: { name: input.name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (clash) throw new PricingError(`A rate group named "${input.name}" already exists.`);
    if (id) {
      await db.rateGroup.update({ where: { id }, data: input });
      return id;
    }
    const row = await db.rateGroup.create({ data: { tenantId: await currentTenantId(), ...input }, select: { id: true } });
    return row.id;
  },

  async setRateGroupActive(id: string, isActive: boolean) {
    await (await tenantDb()).rateGroup.update({ where: { id }, data: { isActive } });
  },

  /** Every active test, its standard price here, and this group's price if set. */
  async rateGroupPrices(rateGroupId: string, branchId: string | null) {
    const db = await tenantDb();
    const [group, tests, own] = await Promise.all([
      db.rateGroup.findUnique({ where: { id: rateGroupId }, select: { id: true, name: true, defaultDiscountPct: true } }),
      db.test.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, department: { select: { name: true } } } }),
      db.rateGroupPrice.findMany({ where: { rateGroupId }, select: { testId: true, price: true } }),
    ]);
    if (!group) return null;
    const standard = await priceTests(branchId, tests.map((t) => t.id));
    const ownMap = new Map(own.map((o) => [o.testId, Number(o.price)]));
    return {
      id: group.id,
      name: group.name,
      defaultDiscountPct: Number(group.defaultDiscountPct),
      tests: tests.map((t) => ({
        testId: t.id,
        name: t.name,
        code: t.code,
        department: t.department.name,
        standard: standard.get(t.id)?.price ?? 0,
        price: ownMap.get(t.id) ?? null,
      })),
    };
  },

  /** Set or clear this group's price per test. A null price falls back to standard. */
  async setRateGroupPrices(rateGroupId: string, entries: { testId: string; price: number | null }[]) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    await db.$transaction(async (tx) => {
      for (const e of entries) {
        if (e.price == null) {
          await tx.rateGroupPrice.deleteMany({ where: { rateGroupId, testId: e.testId } });
        } else {
          await tx.rateGroupPrice.upsert({
            where: { rateGroupId_testId: { rateGroupId, testId: e.testId } },
            create: { tenantId, rateGroupId, testId: e.testId, price: e.price },
            update: { price: e.price },
          });
        }
      }
    });
  },

  // ── Collection points ──
  async listCollectionPoints(includeInactive = false) {
    const rows = await (await tenantDb()).collectionPoint.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { branch: { select: { name: true } }, rateGroup: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      address: r.address,
      branchId: r.branchId,
      branchName: r.branch.name,
      rateGroupId: r.rateGroupId,
      rateGroupName: r.rateGroup?.name ?? null,
      isActive: r.isActive,
    }));
  },

  async saveCollectionPoint(
    id: string | null,
    input: { name: string; branchId: string; phone?: string; address?: string; rateGroupId?: string },
  ) {
    const db = await tenantDb();
    const clash = await db.collectionPoint.findFirst({ where: { name: input.name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (clash) throw new PricingError(`A collection point named "${input.name}" already exists.`);
    const data = {
      name: input.name,
      branchId: input.branchId,
      phone: input.phone ?? null,
      address: input.address ?? null,
      rateGroupId: input.rateGroupId ?? null,
    };
    if (id) {
      await db.collectionPoint.update({ where: { id }, data });
      return id;
    }
    const row = await db.collectionPoint.create({ data: { tenantId: await currentTenantId(), ...data }, select: { id: true } });
    return row.id;
  },

  async setCollectionPointActive(id: string, isActive: boolean) {
    await (await tenantDb()).collectionPoint.update({ where: { id }, data: { isActive } });
  },
};
