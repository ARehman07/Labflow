import { tenantDb } from '@/core/db/context';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface QueueTokenRow {
  id: string;
  number: number;
  patientName: string;
  status: string;
}

export const queueService = {
  async list(branchId: string): Promise<{ tokens: QueueTokenRow[]; nowServing: number | null }> {
    const today = startOfToday();
    const tokens = await (await tenantDb()).queueToken.findMany({
      where: { at: { gte: today }, visit: { branchId } },
      include: { visit: { include: { patient: true } } },
      orderBy: { number: 'asc' },
    });
    const called = [...tokens].reverse().find((t) => t.status === 'CALLED');
    return {
      tokens: tokens.map((t) => ({
        id: t.id,
        number: t.number,
        patientName: t.visit.patient.fullName,
        status: t.status,
      })),
      nowServing: called ? called.number : null,
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
