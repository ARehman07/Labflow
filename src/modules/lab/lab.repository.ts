import { tenantDb } from '@/core/db/context';

export const labRepository = {
  /** Order lines for the branch within a date window, grouped by visit. */
  async workboard(branchId: string, from: Date, to: Date, query?: string) {
    const q = query?.trim();
    return (await tenantDb()).visit.findMany({
      where: {
        branchId,
        bookedAt: { gte: from, lte: to },
        ...(q
          ? {
              OR: [
                { slipNo: { contains: q } },
                { patient: { fullName: { contains: q } } },
                { patient: { mrNo: { contains: q } } },
                { patient: { mobile: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        patient: true,
        orderLines: {
          include: { test: true, results: { select: { flag: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { bookedAt: 'desc' },
      take: 60,
    });
  },

  async orderLineForEntry(orderLineId: string) {
    return (await tenantDb()).orderLine.findUnique({
      where: { id: orderLineId },
      include: {
        visit: { include: { patient: true } },
        test: {
          include: {
            parameters: {
              orderBy: { sortOrder: 'asc' },
              include: { referenceRanges: true, formula: true },
            },
          },
        },
        results: true,
      },
    });
  },

  async approvalsQueue(branchId: string) {
    return (await tenantDb()).orderLine.findMany({
      where: { status: 'RESULT_SAVED', visit: { branchId } },
      include: {
        test: true,
        visit: { include: { patient: true } },
        results: { include: { enteredBy: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 60,
    });
  },
};
