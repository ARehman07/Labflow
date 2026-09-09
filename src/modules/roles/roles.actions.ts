'use server';

import { requirePermission } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import {
  ALL_PERMISSIONS,
  KNOWN_ROLE_PERMISSIONS,
  ROLE_PRESETS,
  SYSTEM_ROLES,
  type PermissionDef,
  type RolePreset,
} from '@/core/rbac/permissions';

export interface RoleMatrixRow {
  id: string;
  name: string;
  userCount: number;
  granted: string[];
  /** Owner and Admin underpin the app; the UI must not offer to break them. */
  isSystem: boolean;
}

export interface RoleMatrix {
  permissions: PermissionDef[];
  roles: RoleMatrixRow[];
  /** Ready-made roles this lab has not created yet. */
  availablePresets: RolePreset[];
}

export async function getRoleMatrixAction(): Promise<RoleMatrix> {
  await requirePermission('user.manage');
  const db = await tenantDb();
  const roles = await db.role.findMany({
    include: {
      permissions: { include: { permission: { select: { code: true } } } },
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  });

  const existing = new Set(roles.map((r) => r.name.toLowerCase()));
  return {
    permissions: [...ALL_PERMISSIONS],
    availablePresets: ROLE_PRESETS.filter((p) => !existing.has(p.name.toLowerCase())),
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      userCount: r._count.users,
      granted: r.permissions.map((rp) => rp.permission.code),
      isSystem: (SYSTEM_ROLES as readonly string[]).includes(r.name),
    })),
  };
}

/** Create a role, either blank or seeded from a preset. */
export async function createRoleAction(
  name: string,
  codes: string[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission('user.manage');
  const db = await tenantDb();
  const tenantId = await currentTenantId();

  const clean = name.trim();
  if (clean.length < 2) return { ok: false, error: 'Give the role a name.' };
  if (clean.length > 40) return { ok: false, error: 'That name is too long.' };

  const clash = await db.role.findFirst({ where: { name: { equals: clean } }, select: { id: true } });
  if (clash) return { ok: false, error: `A role called "${clean}" already exists.` };

  const wanted = [...new Set(codes)].filter((c) => VALID.has(c));
  const perms = await db.permission.findMany({ where: { code: { in: wanted } }, select: { id: true } });

  const role = await db.role.create({ data: { tenantId, name: clean } });
  if (perms.length > 0) {
    await db.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }
  await db.auditLog.create({
    data: { tenantId, actorId: user.id, entity: 'Role', entityId: role.id,
      action: 'ROLE_CREATE', after: JSON.stringify({ role: clean, granted: wanted }) },
  });
  return { ok: true, id: role.id };
}

/**
 * Delete a role. Refused for Owner, and refused while anyone still holds it —
 * deleting a role out from under a user would leave an account that cannot be
 * evaluated at sign-in.
 */
export async function deleteRoleAction(
  roleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission('user.manage');
  const db = await tenantDb();
  const tenantId = await currentTenantId();

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, _count: { select: { users: true } } },
  });
  if (!role) return { ok: false, error: 'Role not found.' };
  if ((SYSTEM_ROLES as readonly string[]).includes(role.name)) {
    return { ok: false, error: `${role.name} cannot be deleted.` };
  }
  if (role._count.users > 0) {
    const n = role._count.users;
    return {
      ok: false,
      error: `${n} ${n === 1 ? 'user still uses' : 'users still use'} this role. Move them to another role first.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.role.delete({ where: { id: roleId } });
    await tx.auditLog.create({
      data: { tenantId, actorId: user.id, entity: 'Role', entityId: roleId,
        action: 'ROLE_DELETE', before: JSON.stringify({ role: role.name }) },
    });
  });
  return { ok: true };
}

const VALID = new Set(ALL_PERMISSIONS.map((p) => p.code));

/**
 * Replace a role's grants.
 *
 * Two things are refused outright rather than left to the UI:
 *  - Owner cannot be edited. It is the recovery path; a lab that strips it
 *    locks itself out of its own settings with no way back in.
 *  - No role may keep user.manage while losing it is what the caller intended —
 *    the caller's own ability to fix a mistake is checked before saving.
 */
export async function setRolePermissionsAction(
  roleId: string,
  codes: string[],
): Promise<{ ok: true; granted: string[] } | { ok: false; error: string }> {
  const user = await requirePermission('user.manage');
  const db = await tenantDb();
  const tenantId = await currentTenantId();

  const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) return { ok: false, error: 'Role not found.' };
  if (role.name === 'Owner') {
    return { ok: false, error: 'The Owner role cannot be changed — it is how you get back in.' };
  }

  const wanted = [...new Set(codes)].filter((c) => VALID.has(c));

  // Do not let someone remove the last way back into user management.
  if (!wanted.includes('user.manage')) {
    const otherHolders = await db.role.count({
      where: {
        id: { not: roleId },
        users: { some: {} },
        permissions: { some: { permission: { code: 'user.manage' } } },
      },
    });
    if (otherHolders === 0) {
      return { ok: false, error: 'At least one role with users must keep "Manage users & roles".' };
    }
  }

  const perms = await db.permission.findMany({ where: { code: { in: wanted } }, select: { id: true } });

  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (perms.length > 0) {
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: user.id,
        entity: 'Role',
        entityId: roleId,
        action: 'PERMISSIONS_SET',
        after: JSON.stringify({ role: role.name, granted: wanted }),
      },
    });
  });

  return { ok: true, granted: wanted };
}

/** Put a role back to the shipped defaults, for when an experiment goes wrong. */
export async function resetRoleToDefaultsAction(
  roleId: string,
): Promise<{ ok: true; granted: string[] } | { ok: false; error: string }> {
  await requirePermission('user.manage');
  const db = await tenantDb();
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true } });
  if (!role) return { ok: false, error: 'Role not found.' };
  const defaults = KNOWN_ROLE_PERMISSIONS[role.name];
  if (!defaults) return { ok: false, error: `"${role.name}" is a custom role and has no defaults.` };
  return setRolePermissionsAction(roleId, defaults);
}
