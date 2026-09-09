import { tenantDb } from '@/core/db/context';

type InvoiceFilter = 'ALL' | 'DUE' | 'PAID';

export const billingRepository = {
  async listInvoices(branchId: string, filter: InvoiceFilter, query?: string) {
    const q = query?.trim();
    return (await tenantDb()).invoice.findMany({
      where: {
        visit: {
          branchId,
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
        ...(filter === 'DUE' ? { status: { in: ['DUE', 'PARTIAL'] } } : {}),
        ...(filter === 'PAID' ? { status: 'PAID' } : {}),
      },
      include: {
        visit: { include: { patient: true, doctor: true } },
        payments: { select: { method: true, at: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
  },

  /** Branch-wide totals for the summary header (respects the current filter's spirit). */
  async summary(branchId: string) {
    const invoices = await (await tenantDb()).invoice.findMany({
      where: { visit: { branchId } },
      select: { netAmount: true, paidAmount: true, status: true },
    });
    let collected = 0;
    let outstanding = 0;
    let dueCount = 0;
    for (const inv of invoices) {
      collected += Number(inv.paidAmount);
      const bal = Math.max(0, Number(inv.netAmount) - Number(inv.paidAmount));
      outstanding += bal;
      if (bal > 0) dueCount += 1;
    }
    return { collected, outstanding, dueCount, total: invoices.length };
  },

  async getInvoice(invoiceId: string) {
    return (await tenantDb()).invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: { orderBy: { at: 'asc' } },
        refunds: { orderBy: { at: 'asc' } },
        visit: {
          include: {
            patient: true,
            doctor: true,
            branch: true,
            orderLines: { include: { test: true } },
          },
        },
      },
    });
  },
};
