import { tenantDb, currentTenantId } from '@/core/db/context';

export type AccountMethod = 'CASH' | 'CARD' | 'ONLINE';

/**
 * Tills and bank accounts money moves through.
 *
 * A lab takes cash, JazzCash and Easypaisa transfers and card payments into a
 * bank; "Online" alone does not say which wallet to check at day's end. Every
 * payment and refund can name the account, and the account says which method
 * it is, so reports that group by method keep working.
 */
export const accountsService = {
  /** Active accounts in display order. A lab with none gets a Cash account. */
  async list(includeInactive = false) {
    const db = await tenantDb();
    const count = await db.paymentAccount.count();
    if (count === 0) {
      await db.paymentAccount.create({ data: { tenantId: await currentTenantId(), name: 'Cash', method: 'CASH', sortOrder: 0 } });
    }
    return db.paymentAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, method: true, isActive: true },
    });
  },

  async create(input: { name: string; method: AccountMethod }) {
    const db = await tenantDb();
    const clash = await db.paymentAccount.findFirst({ where: { name: input.name }, select: { id: true } });
    if (clash) throw new Error(`An account named "${input.name}" already exists.`);
    const last = await db.paymentAccount.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return db.paymentAccount.create({
      data: { tenantId: await currentTenantId(), name: input.name, method: input.method, sortOrder: (last?.sortOrder ?? 0) + 1 },
      select: { id: true, name: true, method: true, isActive: true },
    });
  },

  async setActive(id: string, isActive: boolean) {
    const db = await tenantDb();
    if (!isActive) {
      const others = await db.paymentAccount.count({ where: { isActive: true, id: { not: id } } });
      if (others === 0) throw new Error('Keep at least one account active.');
    }
    await db.paymentAccount.update({ where: { id }, data: { isActive } });
  },
};
