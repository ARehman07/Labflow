'use server';

import { requirePermission } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { getFeatures } from '@/core/features/features.server';
import { normaliseFeatures, type Features } from '@/core/features/catalog';

export async function getLabFeaturesAction(): Promise<Features> {
  await requirePermission('settings.manage');
  return getFeatures();
}

export async function saveLabFeaturesAction(input: unknown): Promise<{ ok: true; features: Features } | { ok: false; error: string }> {
  const user = await requirePermission('settings.manage');
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid settings' };
  const before = await getFeatures();
  const features = normaliseFeatures(input as Record<string, unknown>);
  const db = await tenantDb();
  const tenantId = await currentTenantId();
  await db.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { features: JSON.stringify(features) } });
    const changed = Object.fromEntries(Object.entries(features).filter(([k, v]) => before[k as keyof Features] !== v));
    await tx.auditLog.create({ data: { tenantId, actorId: user.id, entity: 'Tenant', entityId: tenantId, action: 'FEATURES_UPDATE', after: JSON.stringify(changed) } });
  });
  return { ok: true, features };
}
