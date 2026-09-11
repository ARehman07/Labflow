import { tenantDb } from '@/core/db/context';
import { parseScan } from '@/lib/scan';

export const labRepository = {
  /** Order lines for the branch within a date window, grouped by visit. */
  async workboard(branchId: string, from: Date, to: Date, query?: string) {
    const q = query?.trim();
    // A scanned tube label or slip QR finds its visit too, not only typed text.
    // A whole code (barcode, QR, or a five-digit slip number as printed) means
    // exactly that booking — a broad match would also pull in anyone whose MR#
    // or phone happens to contain the same digits.
    const scan = q ? parseScan(q) : null;
    const exact = scan != null && q != null
      && (scan.kind === 'barcode' || q.includes('Slip:') || /^#?\d{5}$/u.test(q));
    return (await tenantDb()).visit.findMany({
      where: {
        branchId,
        // A cancelled booking has nothing left for the bench to do.
        status: { not: 'CANCELLED' },
        bookedAt: { gte: from, lte: to },
        ...(exact && scan
          ? {
              OR: [
                { slipNo: scan.slipNo },
                ...(scan.kind === 'barcode' ? [{ samples: { some: { barcode: scan.barcode } } }] : []),
              ],
            }
          : q
          ? {
              OR: [
                { slipNo: { contains: q } },
                ...(scan ? [{ slipNo: scan.slipNo }] : []),
                ...(scan?.kind === 'barcode' ? [{ samples: { some: { barcode: scan.barcode } } }] : []),
                { patient: { fullName: { contains: q } } },
                { patient: { mrNo: { contains: q } } },
                { patient: { mobile: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        patient: true,
        token: { select: { number: true, status: true, at: true } },
        orderLines: {
          include: { test: true, results: { select: { flag: true } }, outsourcedTo: { select: { name: true } } },
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
        outsourcedTo: { select: { name: true } },
        culture: { include: { sensitivities: { orderBy: { sortOrder: 'asc' } } } },
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
        test: {
          include: {
            parameters: {
              orderBy: { sortOrder: 'asc' },
              include: { referenceRanges: true },
            },
          },
        },
        visit: { include: { patient: true } },
        results: { include: { enteredBy: true } },
        culture: { select: { growth: true, organism: true, colonyCount: true, _count: { select: { sensitivities: true } } } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 60,
    });
  },
};
