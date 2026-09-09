'use server';

import { currentUser, requirePermission } from '@/core/rbac/guard';
import { queueService, type QueueTokenRow } from './queue.service';

export type { QueueTokenRow };

export async function getQueueAction(): Promise<{ tokens: QueueTokenRow[]; nowServing: number | null }> {
  const user = await currentUser();
  if (!user.branchId) return { tokens: [], nowServing: null };
  return queueService.list(user.branchId);
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
