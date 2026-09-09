import { auth } from '@/core/auth/auth';
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
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) throw new MissingTenantError();
  return tenantId;
}
