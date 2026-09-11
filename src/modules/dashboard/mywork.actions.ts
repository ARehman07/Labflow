'use server';

import { can, currentUser } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';
import { LAB_BOARD_DAYS } from '@/modules/queue/queue.service';

/**
 * What is waiting for the person signed in, at their branch, right now.
 *
 * For staff who do not see revenue. Each figure exists only if their role can
 * act on it — a count you cannot do anything about is noise — so a null means
 * "not yours", and the card is left out rather than shown as zero.
 */
export interface MyWork {
  /** Patients with a sample still to draw, and how many tests that is. */
  toCollectPatients: number | null;
  toCollectTests: number | null;
  /** Tests collected and in the lab, not yet resulted. */
  inLab: number | null;
  toApprove: number | null;
  queueWaiting: number | null;
  duesCount: number | null;
  duesAmount: number | null;
}

const NONE: MyWork = {
  toCollectPatients: null, toCollectTests: null, inLab: null,
  toApprove: null, queueWaiting: null, duesCount: null, duesAmount: null,
};

export async function getMyWorkAction(): Promise<MyWork> {
  const user = await currentUser();
  if (!user.branchId) return NONE;
  const branchId = user.branchId;

  const [collect, enter, approve, advance, book, billing] = await Promise.all([
    can('sample.collect'), can('result.enter'), can('result.approve'),
    can('workflow.advance'), can('visit.create'), can('billing.view'),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Same window the Lab board shows, so the numbers here match the board.
  const from = new Date(today);
  from.setDate(from.getDate() - LAB_BOARD_DAYS);

  const db = await tenantDb();
  const [patients, tests, inLab, toApprove, queueWaiting, dues] = await Promise.all([
    collect ? db.visit.count({ where: { branchId, bookedAt: { gte: from }, orderLines: { some: { status: 'BOOKED' } } } }) : null,
    collect ? db.orderLine.count({ where: { status: 'BOOKED', visit: { branchId, bookedAt: { gte: from } } } }) : null,
    enter
      ? db.orderLine.count({
          where: {
            status: { in: ['SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RETAKE'] },
            visit: { branchId, bookedAt: { gte: from } },
          },
        })
      : null,
    approve ? db.orderLine.count({ where: { status: 'RESULT_SAVED', visit: { branchId } } }) : null,
    advance || book ? db.queueToken.count({ where: { status: 'WAITING', at: { gte: today }, visit: { branchId } } }) : null,
    billing
      ? db.invoice.findMany({
          where: { status: { in: ['DUE', 'PARTIAL'] }, visit: { branchId } },
          select: { netAmount: true, paidAmount: true },
        })
      : null,
  ]);

  return {
    toCollectPatients: patients,
    toCollectTests: tests,
    inLab,
    toApprove,
    queueWaiting,
    duesCount: dues ? dues.length : null,
    duesAmount: dues ? dues.reduce((sum, i) => sum + Number(i.netAmount) - Number(i.paidAmount), 0) : null,
  };
}
