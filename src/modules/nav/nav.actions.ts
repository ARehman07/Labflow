'use server';

import { can } from '@/core/rbac/guard';
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
}

export async function getNavCountsAction(): Promise<NavCounts> {
  const [mayCritical, mayNotifiable] = await Promise.all([
    can('critical.manage'),
    can('notifiable.manage'),
  ]);
  if (!mayCritical && !mayNotifiable) return { critical: 0, notifiable: 0 };

  const db = await tenantDb();
  const [critical, notifiable] = await Promise.all([
    mayCritical ? db.criticalNotification.count({ where: { notifiedAt: null } }) : 0,
    mayNotifiable ? db.notifiableReport.count({ where: { reportedAt: null } }) : 0,
  ]);
  return { critical, notifiable };
}
