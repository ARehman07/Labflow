import { unscopedPrisma } from '@/core/db/tenant';
import { labAccess, type LabAccess } from './access';

/**
 * A lab's access, looked up at most every 15 seconds per lab. Every permission
 * check asks, so it must be cheap; a change from the platform console reaches
 * every server within that window.
 */
const memo = new Map<string, { at: number; access: LabAccess }>();
const TTL_MS = 15_000;

export async function labAccessFor(tenantId: string | null | undefined): Promise<LabAccess> {
  if (!tenantId) return { level: 'SUSPENDED', reason: 'SUSPENDED', restrictsOn: null };
  const hit = memo.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.access;
  const row = await unscopedPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { isActive: true, paidUntil: true, graceDays: true, accessOverride: true, overrideUntil: true },
  });
  const access = row ? labAccess(row) : { level: 'SUSPENDED' as const, reason: 'SUSPENDED' as const, restrictsOn: null };
  memo.set(tenantId, { at: Date.now(), access });
  return access;
}

/** Drop the cached access after the platform console changes it. */
export function forgetLabAccess(tenantId: string) {
  memo.delete(tenantId);
}

export class LabRestrictedError extends Error {
  constructor() {
    super('This lab’s LabFlow subscription is overdue, so LabFlow is read-only. The lab owner can contact LabFlow to renew.');
    this.name = 'LabRestrictedError';
  }
}

/** For writes that do not pass through a permission check — analyzers, the partner portal's booking. */
export async function assertLabWritable(tenantId: string) {
  const { level } = await labAccessFor(tenantId);
  if (level === 'READ_ONLY' || level === 'SUSPENDED') throw new LabRestrictedError();
}
