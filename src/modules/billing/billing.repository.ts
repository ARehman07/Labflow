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
      // The list shows a name, an MR number and four amounts; it used to load
      // whole Patient and Doctor rows for all 80 invoices to do it.
      select: {
        id: true,
        status: true,
        createdAt: true,
        grossAmount: true,
        discount: true,
        netAmount: true,
        paidAmount: true,
        visit: {
          select: {
            slipNo: true,
            patient: { select: { fullName: true, mrNo: true } },
            doctor: { select: { name: true } },
          },
        },
        payments: { select: { method: true, at: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
  },

  /** Branch-wide totals for the summary header (respects the current filter's spirit). */
  async summary(branchId: string) {
    // Added up by the database. This used to read every invoice the branch has
    // ever raised — unbounded, and growing — to produce four numbers.
    const db = await tenantDb();
    const where = { visit: { branchId } };
    const [totals, due] = await Promise.all([
      db.invoice.aggregate({ where, _sum: { netAmount: true, paidAmount: true }, _count: true }),
      db.invoice.aggregate({
        where: { ...where, status: { in: ['DUE', 'PARTIAL'] } },
        _sum: { netAmount: true, paidAmount: true },
        _count: true,
      }),
    ]);
    const collected = Number(totals._sum.paidAmount ?? 0);
    // Only unpaid invoices can carry a balance, so the outstanding sum comes from those.
    const outstanding = Math.max(0, Number(due._sum.netAmount ?? 0) - Number(due._sum.paidAmount ?? 0));
    return { collected, outstanding, dueCount: due._count, total: totals._count };
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
