import type { Prisma } from '@prisma/client';
import { tenantDb } from '@/core/db/context';
import { BOARD_STAGES, type BoardCounts } from './board-stages';
import { parseScan } from '@/lib/scan';

/** The board shows this many patient cards at once; the counts tell the truth about the rest. */
export const BOARD_LIMIT = 150;

/** The approvals queue shows this many at once, oldest first. */
export const APPROVALS_LIMIT = 60;

export interface BoardFilterInput {
  departmentId?: string;
  testStatus?: string;
  partnerLabId?: string;
}

/**
 * Which visits the board is asking about. Shared by the cards and the chip
 * counts, so the numbers on the chips describe the same work the cards come
 * from — counted over all of it, not over the page that fitted.
 */
/**
 * Annotated, and it has to be. Without a declared return type the object is
 * inferred structurally — `status: { not: string }` rather than the VisitStatus
 * enum — which Postgres's generated client rejects. Prisma then falls back to
 * the default payload for the whole query, `select` is ignored, and the errors
 * surface far away in whatever maps the result. The SQLite client used for
 * local development has no enums (they are plain strings there), so nothing
 * catches this until a Postgres build.
 */
function boardWhere(
  branchId: string,
  from: Date,
  to: Date,
  query?: string,
  filters: BoardFilterInput = {},
): Prisma.VisitWhereInput {
  const q = query?.trim();
  // A scanned tube label or slip QR finds its visit too, not only typed text.
  // A whole code (barcode, QR, or a five-digit slip number as printed) means
  // exactly that booking — a broad match would also pull in anyone whose MR#
  // or phone happens to contain the same digits.
  const scan = q ? parseScan(q) : null;
  const exact = scan != null && q != null
    && (scan.kind === 'barcode' || q.includes('Slip:') || /^#?\d{5}$/u.test(q));
  return {
        branchId,
      // A cancelled booking has nothing left for the bench to do.
      status: { not: 'CANCELLED' },
      bookedAt: { gte: from, lte: to },
      // Filters narrow which patients show; each card still carries all its tests.
      AND: [
        ...(filters.departmentId ? [{ orderLines: { some: { test: { departmentId: filters.departmentId } } } }] : []),
        // `as never` and not a named enum filter: that type exists in the
        // Postgres client and not in the SQLite one, where statuses are strings.
        ...(filters.testStatus ? [{ orderLines: { some: { status: filters.testStatus as never } } }] : []),
        ...(filters.partnerLabId === 'ANY' ? [{ partnerLabId: { not: null } }]
          : filters.partnerLabId === 'NONE' ? [{ partnerLabId: null }]
          : filters.partnerLabId ? [{ partnerLabId: filters.partnerLabId }] : []),
      ],
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
  };
}

export const labRepository = {
  /** Order lines for the branch within a date window, grouped by visit. */
  async workboard(
    branchId: string,
    from: Date,
    to: Date,
    query?: string,
    filters: BoardFilterInput = {},
  ) {
    return (await tenantDb()).visit.findMany({
      where: boardWhere(branchId, from, to, query, filters),
      // Only what a card draws. This used to `include` whole Patient and Test
      // rows — method notes, instructions, prices — for 150 visits, on a list
      // that polls every 15 seconds.
      select: {
        id: true,
        slipNo: true,
        bookedAt: true,
        notes: true,
        patient: { select: { fullName: true, mrNo: true, age: true, sex: true } },
        token: { select: { number: true, status: true, at: true } },
        orderLines: {
          select: {
            id: true,
            status: true,
            dueAt: true,
            sampleId: true,
            bookingRemarks: true,
            delayReason: true,
            test: { select: { name: true, specimenType: true } },
            results: { select: { flag: true } },
            outsourcedTo: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { bookedAt: 'desc' },
      take: BOARD_LIMIT,
    });
  },

  /**
   * How much work the filter actually matches.
   *
   * Counted in the database over every matching visit, because the chips used
   * to be tallied from the cards that loaded: on a busy branch "Phlebotomy 9"
   * meant "9 of the newest 150", which is exactly the number a phlebotomist
   * must not be given.
   */
  async workboardCounts(
    branchId: string,
    from: Date,
    to: Date,
    query?: string,
    filters: BoardFilterInput = {},
  ): Promise<{ total: number; counts: BoardCounts }> {
    const db = await tenantDb();
    const where = boardWhere(branchId, from, to, query, filters);
    const [total, tests, ...perStage] = await Promise.all([
      db.visit.count({ where }),
      db.orderLine.count({ where: { visit: where } }),
      ...BOARD_STAGES.flatMap((stage) => [
        db.visit.count({ where: { ...where, orderLines: { some: { status: { in: stage.statuses } } } } }),
        db.orderLine.count({ where: { visit: where, status: { in: stage.statuses } } }),
      ]),
    ]);
    const counts = { ALL: { patients: total, tests } } as BoardCounts;
    BOARD_STAGES.forEach((stage, i) => {
      counts[stage.key] = { patients: perStage[i * 2], tests: perStage[i * 2 + 1] };
    });
    return { total, counts };
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

  /** How many results are waiting in total, so the page can say what it is not showing. */
  async approvalsTotal(branchId: string) {
    return (await tenantDb()).orderLine.count({ where: { status: 'RESULT_SAVED', visit: { branchId } } });
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
      take: APPROVALS_LIMIT,
    });
  },
};
