import { sessionOnce } from '@/core/auth/session';
import type { PermissionCode } from './permissions';
import { permissionAllowed } from '@/core/billing/access';
import { labAccessFor, LabRestrictedError } from '@/core/billing/access.server';

/** Thrown when an action is attempted without the required permission. */
export class ForbiddenError extends Error {
  constructor(permission: PermissionCode) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = 'ForbiddenError';
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthenticatedError';
  }
}

/** Returns the current session's user permissions, or throws if unauthenticated. */
export async function currentUser() {
  const session = await sessionOnce();
  if (!session?.user) throw new UnauthenticatedError();
  return session.user;
}

/** Guard to call at the top of every server action / mutation. */
export async function requirePermission(permission: PermissionCode) {
  const user = await currentUser();
  const perms = (user.permissions ?? []) as string[];
  if (!perms.includes(permission)) throw new ForbiddenError(permission);
  // A lab whose subscription has lapsed keeps only what read-only access allows.
  if (!permissionAllowed((await labAccessFor(user.tenantId)).level, permission)) throw new LabRestrictedError();
  return user;
}

/** Non-throwing check (e.g. for conditionally rendering UI). */
export async function can(permission: PermissionCode): Promise<boolean> {
  try {
    const user = await currentUser();
    if (!(user.permissions ?? []).includes(permission)) return false;
    return permissionAllowed((await labAccessFor(user.tenantId)).level, permission);
  } catch {
    return false;
  }
}
