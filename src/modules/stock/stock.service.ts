import { tenantDb, currentTenantId } from '@/core/db/context';

/** A refusal written for the person at the screen. */
export class StockError extends Error {}

type MoveType = 'RECEIVE' | 'ISSUE' | 'CONSUME' | 'ADJUST' | 'RETURN';

/**
 * Lab stock: reagents, tubes and kits. Every change is a numbered line in the
 * register — received, issued to a department, used by a test, adjusted after
 * a count — so the balance on screen and the paper register agree. What a test
 * uses is taken off stock when its sample is collected, and put back if that
 * collection is undone.
 */
export const stockService = {
  async listItems(includeInactive = false) {
    const soon = new Date(Date.now() + 30 * 86_400_000);
    const rows = await (await tenantDb()).inventoryItem.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { consumables: true } } },
    });
    return rows.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: Number(i.quantity),
      reorderLevel: Number(i.reorderLevel),
      expiresAt: i.expiresAt?.toISOString() ?? null,
      isActive: i.isActive,
      usedByTests: i._count.consumables,
      low: Number(i.quantity) <= Number(i.reorderLevel),
      expiringSoon: i.expiresAt != null && i.expiresAt <= soon,
    }));
  },

  async createItem(input: { name: string; unit: string; reorderLevel: number; expiresAt?: Date; openingQty: number }, userId: string) {
    const db = await tenantDb();
    if (await db.inventoryItem.findFirst({ where: { name: input.name }, select: { id: true } })) {
      throw new StockError(`"${input.name}" is already in stock.`);
    }
    const item = await db.inventoryItem.create({
      data: { tenantId: await currentTenantId(), name: input.name, unit: input.unit, reorderLevel: input.reorderLevel, expiresAt: input.expiresAt ?? null },
      select: { id: true },
    });
    if (input.openingQty > 0) {
      await stockService.move(item.id, { type: 'RECEIVE', quantity: input.openingQty, note: 'Opening stock' }, userId);
    }
    return item.id;
  },

  async setActive(id: string, isActive: boolean) {
    await (await tenantDb()).inventoryItem.update({ where: { id }, data: { isActive } });
  },

  /**
   * One line in the register. `quantity` is how much moved; the direction
   * comes from the type (ADJUST takes its sign from the quantity).
   */
  async move(
    itemId: string,
    input: { type: MoveType; quantity: number; department?: string; issuedBy?: string; receivedBy?: string; note?: string; orderLineId?: string },
    userId: string,
  ) {
    if (input.quantity === 0 || !Number.isFinite(input.quantity)) throw new StockError('Enter a quantity.');
    const signed = input.type === 'ADJUST'
      ? input.quantity
      : ['ISSUE', 'CONSUME'].includes(input.type) ? -Math.abs(input.quantity) : Math.abs(input.quantity);
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    return db.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { quantity: true } });
      if (!item) throw new StockError('That item is not in stock.');
      const balance = Number(item.quantity) + signed;
      if (input.type === 'ISSUE' && balance < 0) throw new StockError('There is not that much in stock.');
      const last = await tx.stockMovement.findFirst({ orderBy: { serialNo: 'desc' }, select: { serialNo: true } });
      await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: balance } });
      return tx.stockMovement.create({
        data: {
          tenantId, itemId, type: input.type, quantity: signed, balanceAfter: balance,
          department: input.department ?? null, issuedBy: input.issuedBy ?? null, receivedBy: input.receivedBy ?? null,
          note: input.note ?? null, orderLineId: input.orderLineId ?? null,
          serialNo: (last?.serialNo ?? 0) + 1, createdById: userId,
        },
        select: { id: true, serialNo: true, balanceAfter: true },
      });
    });
  },

  async register(filters: { start: Date; end: Date; itemId?: string }) {
    const rows = await (await tenantDb()).stockMovement.findMany({
      where: { at: { gte: filters.start, lt: filters.end }, ...(filters.itemId ? { itemId: filters.itemId } : {}) },
      orderBy: { serialNo: 'desc' },
      take: 500,
      include: { item: { select: { name: true, unit: true } }, orderLine: { select: { visit: { select: { slipNo: true } } } } },
    });
    return rows.map((m) => ({
      serialNo: m.serialNo, at: m.at.toISOString(), type: m.type, item: m.item.name, unit: m.item.unit,
      quantity: Number(m.quantity), balanceAfter: Number(m.balanceAfter),
      department: m.department, issuedBy: m.issuedBy, receivedBy: m.receivedBy, note: m.note,
      slipNo: m.orderLine?.visit.slipNo ?? null,
    }));
  },

  async consumables() {
    const rows = await (await tenantDb()).testConsumable.findMany({
      orderBy: [{ test: { name: 'asc' } }],
      include: { test: { select: { name: true } }, item: { select: { name: true, unit: true } } },
    });
    return rows.map((c) => ({ testId: c.testId, test: c.test.name, itemId: c.itemId, item: c.item.name, unit: c.item.unit, quantity: Number(c.quantity) }));
  },

  /** What a test uses. A quantity of zero removes it. */
  async setConsumable(testId: string, itemId: string, quantity: number) {
    const db = await tenantDb();
    if (quantity <= 0) {
      await db.testConsumable.deleteMany({ where: { testId, itemId } });
      return;
    }
    await db.testConsumable.upsert({
      where: { testId_itemId: { testId, itemId } },
      create: { tenantId: await currentTenantId(), testId, itemId, quantity },
      update: { quantity },
    });
  },

  /** Take a test's consumables off stock when its sample is collected. Safe to call twice. */
  async consumeFor(orderLineId: string, userId: string) {
    try {
      const db = await tenantDb();
      const line = await db.orderLine.findUnique({ where: { id: orderLineId }, select: { testId: true, visit: { select: { slipNo: true } } } });
      if (!line) return;
      const uses = await db.testConsumable.findMany({ where: { testId: line.testId }, select: { itemId: true, quantity: true } });
      for (const u of uses) {
        const done = await db.stockMovement.count({ where: { orderLineId, itemId: u.itemId, type: 'CONSUME' } });
        const returned = await db.stockMovement.count({ where: { orderLineId, itemId: u.itemId, type: 'RETURN' } });
        if (done > returned) continue;
        await stockService.move(u.itemId, { type: 'CONSUME', quantity: Number(u.quantity), note: `Slip #${line.visit.slipNo}`, orderLineId }, userId);
      }
    } catch (e) {
      console.error('[stock] consume failed', e);
    }
  },

  /** Put back what a collection took, when the collection is undone. */
  async returnFor(orderLineId: string, userId: string) {
    try {
      const db = await tenantDb();
      const used = await db.stockMovement.findMany({ where: { orderLineId, type: { in: ['CONSUME', 'RETURN'] } }, select: { itemId: true, type: true, quantity: true } });
      const net = new Map<string, number>();
      for (const m of used) net.set(m.itemId, (net.get(m.itemId) ?? 0) + Number(m.quantity));
      for (const [itemId, q] of net) {
        if (q < 0) await stockService.move(itemId, { type: 'RETURN', quantity: -q, note: 'Collection undone', orderLineId }, userId);
      }
    } catch (e) {
      console.error('[stock] return failed', e);
    }
  },
};
