'use server';

import { currentUser, requirePermission } from '@/core/rbac/guard';
import { queueService, type QueueTokenRow } from './queue.service';
import { tenantDb, currentTenantId } from '@/core/db/context';

export type { QueueTokenRow };

export async function getQueueAction(): Promise<{
  tokens: QueueTokenRow[];
  nowServing: number | null;
  earlierAwaitingCollection: number;
}> {
  const user = await currentUser();
  if (!user.branchId) return { tokens: [], nowServing: null, earlierAwaitingCollection: 0 };
  return queueService.list(user.branchId);
}

/** The lab and branch a waiting-room display belongs to, for its header. */
export async function getDisplayIdentityAction(): Promise<{ labName: string; branchName: string | null }> {
  const user = await currentUser();
  const db = await tenantDb();
  const [tenant, branch] = await Promise.all([
    db.tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true } }),
    user.branchId ? db.branch.findUnique({ where: { id: user.branchId }, select: { name: true } }) : null,
  ]);
  return { labName: tenant?.name ?? 'LabFlow', branchName: branch?.name ?? null };
}

export async function callNextAction(): Promise<{ ok: boolean; nowServing: number | null }> {
  const user = await requirePermission('workflow.advance');
  if (!user.branchId) return { ok: false, nowServing: null };
  const nowServing = await queueService.callNext(user.branchId);
  return { ok: true, nowServing };
}

export async function markTokenDoneAction(tokenId: string): Promise<{ ok: boolean }> {
  await requirePermission('workflow.advance');
  await queueService.markDone(tokenId);
  return { ok: true };
}
