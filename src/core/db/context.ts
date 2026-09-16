import { AsyncLocalStorage } from 'node:async_hooks';
import { sessionOnce } from '@/core/auth/session';

/**
 * Work done without a signed-in person — an analyzer posting results — runs
 * inside `runAsTenant`, which supplies the lab those queries belong to. Only
 * code that has already authenticated the caller another way may use it.
 */
const tenantOverride = new AsyncLocalStorage<{ tenantId: string }>();

export function runAsTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantOverride.run({ tenantId }, fn);
}
import { forTenant, MissingTenantError, type TenantClient } from './tenant';

/**
 * The tenant-scoped Prisma client for the signed-in user.
 *
 * Use this everywhere instead of importing `prisma` directly. Queries made
 * through it can only see and touch the current lab's rows.
 *
 *   const db = await tenantDb();
 *   const patients = await db.patient.findMany();   // scoped automatically
 */
export async function tenantDb(): Promise<TenantClient> {
  return forTenant(await currentTenantId());
}

/** The signed-in user's tenant id. Throws if there is no session. */
export async function currentTenantId(): Promise<string> {
  const override = tenantOverride.getStore();
  if (override) return override.tenantId;
  const session = await sessionOnce();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) throw new MissingTenantError();
  return tenantId;
}
