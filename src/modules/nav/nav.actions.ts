'use server';

import { can, currentUser } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';

/**
 * Counts shown against the safety worklists in the sidebar.
 *
 * These two queues are the ones that quietly rot: a panic value nobody phoned,
 * a notifiable disease nobody filed. Putting the number on the nav item means
 * you cannot walk past them without seeing them — which is the whole point of
 * having the worklists at all.
 */
export interface NavCounts {
  critical: number;
  notifiable: number;
  /** Reports released and waiting to be handed over at this branch. */
  ready: number;
  /** Results entered and waiting for someone to release them. */
  approvals: number;
}

export async function getNavCountsAction(): Promise<NavCounts> {
  const [mayCritical, mayNotifiable, mayPrint, mayDeliver, mayApprove, user] = await Promise.all([
    can('critical.manage'),
    can('notifiable.manage'),
    can('report.print'),
    can('report.deliver'),
    can('result.approve'),
    currentUser(),
  ]);
  const mayReady = (mayPrint || mayDeliver) && !!user.branchId;
  const mayApprovals = mayApprove && !!user.branchId;
  if (!mayCritical && !mayNotifiable && !mayReady && !mayApprovals) {
    return { critical: 0, notifiable: 0, ready: 0, approvals: 0 };
  }

  const db = await tenantDb();
  const [critical, notifiable, ready, approvals] = await Promise.all([
    mayCritical ? db.criticalNotification.count({ where: { notifiedAt: null } }) : 0,
    mayNotifiable ? db.notifiableReport.count({ where: { reportedAt: null } }) : 0,
    mayReady
      ? db.visit.count({
          where: {
            branchId: user.branchId!,
            status: 'OPEN',
            orderLines: {
              some: { status: { in: ['APPROVED', 'PRINTED'] } },
              none: { status: { in: ['BOOKED', 'SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RESULT_SAVED', 'RETAKE'] } },
            },
          },
        })
      : 0,
    mayApprovals
      ? db.orderLine.count({ where: { status: 'RESULT_SAVED', visit: { branchId: user.branchId! } } })
      : 0,
  ]);
  return { critical, notifiable, ready, approvals };
}
