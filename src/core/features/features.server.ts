import { tenantDb, currentTenantId } from '@/core/db/context';
import { ALL_FEATURES_ON, parseFeatures, type FeatureKey, type Features } from './catalog';

/** The signed-in lab's switches. Without a lab in scope, everything is on. */
export async function getFeatures(): Promise<Features> {
  try {
    const row = await (await tenantDb()).tenant.findUnique({ where: { id: await currentTenantId() }, select: { features: true } });
    return parseFeatures(row?.features);
  } catch {
    return ALL_FEATURES_ON;
  }
}

export async function featureOn(key: FeatureKey): Promise<boolean> {
  return (await getFeatures())[key];
}
