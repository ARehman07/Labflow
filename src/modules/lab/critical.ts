/**
 * Critical-result callback logic.
 *
 * Deliberately free of session and auth imports: it takes whatever client it
 * is given. That keeps it testable in isolation, and makes it reusable from a
 * transaction, a background job, or a bulk importer later.
 */

/** Minimal shape this module needs — satisfied by a tenant-scoped client or a tx. */
export interface CriticalDbClient {
  resultValue: { findMany(args: unknown): Promise<{ id: string }[]> };
  criticalNotification: { upsert(args: unknown): Promise<unknown> };
}

/**
 * Open a callback record for every critical result on a line that lacks one.
 *
 * Idempotent: re-saving results does not open duplicates. Returns how many
 * critical results were found.
 */
export async function openCriticalNotifications(
  db: CriticalDbClient,
  tenantId: string,
  orderLineId: string,
): Promise<number> {
  const critical = await db.resultValue.findMany({
    where: { orderLineId, flag: 'CRITICAL' },
    select: { id: true },
  });

  for (const r of critical) {
    await db.criticalNotification.upsert({
      where: { resultValueId: r.id },
      update: {},
      create: { tenantId, resultValueId: r.id },
    });
  }

  return critical.length;
}
