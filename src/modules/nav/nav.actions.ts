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
}

export async function getNavCountsAction(): Promise<NavCounts> {
  const [mayCritical, mayNotifiable, mayPrint, mayDeliver, user] = await Promise.all([
    can('critical.manage'),
    can('notifiable.manage'),
    can('report.print'),
    can('report.deliver'),
    currentUser(),
  ]);
  const mayReady = (mayPrint || mayDeliver) && !!user.branchId;
  if (!mayCritical && !mayNotifiable && !mayReady) return { critical: 0, notifiable: 0, ready: 0 };

  const db = await tenantDb();
  const [critical, notifiable, ready] = await Promise.all([
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
  ]);
  return { critical, notifiable, ready };
}
