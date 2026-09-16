import { perRequest } from '@/core/db/memo';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { ALL_FEATURES_ON, applyLocks, parseFeatures, parseLocked, type FeatureKey, type Features } from './catalog';

/**
 * The signed-in lab's switches, with its plan's exclusions off. Without a lab
 * in scope, everything is on.
 *
 * Read once per request: `featureOn()` is called several times on some pages,
 * and each call used to be its own query for the same row.
 */
export const getFeatures = perRequest(async (): Promise<Features> => {
  try {
    const row = await (await tenantDb()).tenant.findUnique({ where: { id: await currentTenantId() }, select: { features: true, lockedFeatures: true } });
    return applyLocks(parseFeatures(row?.features), parseLocked(row?.lockedFeatures));
  } catch {
    return ALL_FEATURES_ON;
  }
});

/** The features this lab's plan leaves out. */
export const lockedFeatures = perRequest(async (): Promise<FeatureKey[]> => {
  try {
    const row = await (await tenantDb()).tenant.findUnique({ where: { id: await currentTenantId() }, select: { lockedFeatures: true } });
    return parseLocked(row?.lockedFeatures);
  } catch {
    return [];
  }
});

export async function featureOn(key: FeatureKey): Promise<boolean> {
  return (await getFeatures())[key];
}
