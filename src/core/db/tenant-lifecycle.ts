import { unscopedPrisma as prisma } from './tenant';

/**
 * Offboarding a lab.
 *
 * `DELETE FROM tenants` does not work. Tenant-scoped rows cascade, but several
 * relations WITHIN a tenant have no delete rule — `Test → Department`,
 * `OrderLine → Test`, `Visit → Patient` — so the database refuses while those
 * references stand. Cascade ordering is not guaranteed either.
 *
 * Rather than adding cascades across the schema (which would make an
 * accidental delete far more destructive elsewhere), rows are removed here in
 * explicit dependency order, inside one transaction. Nothing is half-deleted.
 *
 * This is the same routine used to reset test fixtures, so it is exercised on
 * every run rather than only on the day a lab actually leaves.
 */

/** Child-to-parent. Order matters; do not sort this list. */
const DELETION_ORDER = [
  'criticalNotification',
  'notifiableReport',
  'notifiableCondition',
  'portalSession',
  'portalOtp',
  'delivery',
  'report',
  'reportTemplate',
  'queueToken',
  'notification',
  'commission',
  'refund',
  'payment',
  'invoice',
  'ledgerEntry',
  'resultValue',
  'workflowEvent',
  'orderLine',
  'sample',
  'familyCardMember',
  'familyCard',
  'visit',
  'patient',
  'parameterFormula',
  'referenceRange',
  'testParameter',
  'testPrice',
  'test',
  'testGroup',
  'department',
  'doctor',
  'partnerLab',
  'auditLog',
  'user',
  'role',
  'branch',
] as const;

export interface TenantDeletionReport {
  tenantCode: string;
  deleted: Record<string, number>;
  total: number;
}

/**
 * Permanently remove a tenant and everything belonging to it.
 *
 * Irreversible. Export first — see `exportTenant` below for what that needs.
 */
export async function deleteTenant(tenantId: string): Promise<TenantDeletionReport> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, code: true },
  });
  if (!tenant) throw new Error('Tenant not found.');

  const deleted: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    for (const model of DELETION_ORDER) {
      const delegate = (tx as unknown as Record<string, { deleteMany?: Function }>)[model];
      if (!delegate?.deleteMany) continue; // skip anything not an actual model
      const res = await delegate.deleteMany({ where: { tenantId } });
      if (res.count > 0) deleted[model] = res.count;
    }
    await tx.tenant.delete({ where: { id: tenantId } });
  });

  return {
    tenantCode: tenant.code,
    deleted,
    total: Object.values(deleted).reduce((a, b) => a + b, 0),
  };
}

/** Row counts per model for a tenant. Use before deleting, and to verify after. */
export async function tenantRowCounts(tenantId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of DELETION_ORDER) {
    const delegate = (prisma as unknown as Record<string, { count?: Function }>)[model];
    if (!delegate?.count) continue;
    const n = await delegate.count({ where: { tenantId } });
    if (n > 0) counts[model] = n;
  }
  return counts;
}
