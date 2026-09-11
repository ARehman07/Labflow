import { tenantDb } from '@/core/db/context';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** How far back the Lab board looks (see getWorkboardAction). Kept in step. */
export const LAB_BOARD_DAYS = 30;

function startOfDaysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

export interface QueueTokenRow {
  id: string;
  number: number;
  patientName: string;
  status: string;
}

export const queueService = {
  async list(branchId: string): Promise<{
    tokens: QueueTokenRow[];
    nowServing: number | null;
    earlierAwaitingCollection: number;
  }> {
    const today = startOfToday();
    const db = await tenantDb();
    const [tokens, earlierAwaitingCollection] = await Promise.all([
      db.queueToken.findMany({
        where: { at: { gte: today }, visit: { branchId } },
        include: { visit: { include: { patient: true } } },
        orderBy: { number: 'asc' },
      }),
      // The queue is today's waiting room: token numbers restart at #1 each
      // morning, so an older token cannot sit on the board beside today's #1.
      // But a patient booked on an earlier day who still has a sample to give
      // is real work, and it used to vanish from this screen while staying on
      // the Lab board. Counted exactly as the Lab board's "To collect" list is
      // built — same window, BOOKED lines only — because the note links there
      // and the two numbers must agree. Retakes show under "In progress" on
      // that board, so they are not counted here either.
      db.visit.count({
        where: {
          branchId,
          bookedAt: { gte: startOfDaysAgo(LAB_BOARD_DAYS), lt: today },
          orderLines: { some: { status: 'BOOKED' } },
        },
      }),
    ]);
    const called = [...tokens].reverse().find((t) => t.status === 'CALLED');
    return {
      tokens: tokens.map((t) => ({
        id: t.id,
        number: t.number,
        patientName: t.visit.patient.fullName,
        status: t.status,
      })),
      nowServing: called ? called.number : null,
      earlierAwaitingCollection,
    };
  },

  /**
   * The next number this branch should issue today.
   *
   * Derived from the TOKENS already issued, not from the visit count. Counting
   * visits drifts the moment a visit exists without a token (or the reverse),
   * and it used a different day boundary than the queue display — so the board
   * could show #1..#3 while reception handed out #27.
   */
  async nextNumber(tx: { queueToken: { findFirst: Function } }, branchId: string): Promise<number> {
    const today = startOfToday();
    const last = await tx.queueToken.findFirst({
      where: { at: { gte: today }, visit: { branchId } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  },

  /** Move the current serving token to DONE and call the next waiting one. */
  async callNext(branchId: string): Promise<number | null> {
    const today = startOfToday();
    return (await tenantDb()).$transaction(async (tx) => {
      // Close out anything still marked CALLED. There should only ever be one,
      // but an interrupted call or a double click can leave two — and picking
      // an arbitrary one with findFirst left the other stuck as CALLED forever,
      // which then showed as "now serving" on the waiting-room screen.
      await tx.queueToken.updateMany({
        where: { status: 'CALLED', at: { gte: today }, visit: { branchId } },
        data: { status: 'DONE' },
      });

      const next = await tx.queueToken.findFirst({
        where: { status: 'WAITING', at: { gte: today }, visit: { branchId } },
        orderBy: { number: 'asc' },
      });
      if (!next) return null;
      await tx.queueToken.update({ where: { id: next.id }, data: { status: 'CALLED' } });
      return next.number;
    });
  },

  async markDone(tokenId: string) {
    await (await tenantDb()).queueToken.update({ where: { id: tokenId }, data: { status: 'DONE' } });
  },
};
