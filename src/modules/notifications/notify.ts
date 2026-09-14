import { tenantDb, currentTenantId } from '@/core/db/context';

export type NotifyKind = 'CRITICAL' | 'RETAKE' | 'SENT_BACK' | 'DELAYED' | 'B2B_BOOKING' | 'ANALYZER' | 'INFO';

/**
 * Tell the staff who can act on something that it happened.
 *
 * Addressed by permission, not by name: "whoever handles critical results",
 * so a new hire in that role is told too. Stored as a message key and values,
 * so each reader sees it in their own language. Never throws — a notification
 * that fails to send must not undo the work that caused it.
 */
export async function notifyStaff(
  permissionCodes: string[],
  message: { key: string; params?: Record<string, string> },
  opts: { link?: string; kind?: NotifyKind; excludeUserId?: string } = {},
): Promise<void> {
  try {
    const db = await tenantDb();
    const users = await db.user.findMany({
      where: {
        isActive: true,
        partnerLabId: null,
        doctorId: null,
        ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
        role: { permissions: { some: { permission: { code: { in: permissionCodes } } } } },
      },
      select: { id: true },
    });
    if (users.length === 0) return;
    const tenantId = await currentTenantId();
    await db.notification.createMany({
      data: users.map((u) => ({
        tenantId,
        userId: u.id,
        message: JSON.stringify(message),
        link: opts.link ?? null,
        kind: opts.kind ?? 'INFO',
      })),
    });
  } catch (e) {
    console.error('[notify] failed', e);
  }
}

/** The words a notification about one test needs. */
export async function describeLine(orderLineId: string) {
  const line = await (await tenantDb()).orderLine.findUnique({
    where: { id: orderLineId },
    select: { test: { select: { name: true } }, visit: { select: { slipNo: true, patient: { select: { fullName: true } } } } },
  });
  return {
    test: line?.test.name ?? '',
    patient: line?.visit.patient.fullName ?? '',
    slip: line?.visit.slipNo ?? '',
  };
}
