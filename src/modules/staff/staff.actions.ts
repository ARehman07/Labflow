'use server';

import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';

/**
 * Staff accounts are issued, never self-registered.
 *
 * Who can open a patient record is an authorisation decision, so it belongs to
 * whoever runs the lab — not to whoever fills in a signup form. There is also
 * no email or SMS provider wired here, so an invite link would have nowhere to
 * go. The owner creates the account, reads the temporary password to the person
 * once, and the account is held on the change-password screen until they pick
 * their own. That way an owner-chosen password is never one anyone keeps using.
 */

const ADJECTIVES = ['brisk', 'calm', 'clear', 'brave', 'swift', 'bright', 'steady', 'quiet'];
const NOUNS = ['falcon', 'cedar', 'harbor', 'meadow', 'lantern', 'compass', 'river', 'summit'];

/** Readable over the counter and still hard to guess: two words + 3 digits. */
function temporaryPassword(): string {
  const a = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const n = NOUNS[randomInt(NOUNS.length)];
  return `${a}-${n}-${randomInt(100, 1000)}`;
}

const newStaffSchema = z.object({
  fullName: z.string().min(2, 'Enter their name').max(80),
  username: z.string().min(3, 'At least 3 characters').max(40)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, _ and . only'),
  phone: z.string().max(20).optional().or(z.literal('').transform(() => undefined)),
  roleId: z.string().min(1, 'Choose a role'),
  branchId: z.string().optional().or(z.literal('').transform(() => undefined)),
});

export interface StaffRow {
  id: string;
  fullName: string;
  username: string;
  phone: string | null;
  role: string;
  branch: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  isSelf: boolean;
}

export async function listStaffAction(): Promise<StaffRow[]> {
  const me = await requirePermission('user.manage');
  const db = await tenantDb();
  const users = await db.user.findMany({
    include: { role: { select: { name: true } }, branch: { select: { name: true } } },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  });
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    phone: u.phone,
    role: u.role.name,
    branch: u.branch?.name ?? null,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    isSelf: u.id === me.id,
  }));
}

/** Returns the temporary password once. It is never retrievable afterwards. */
export async function createStaffAction(
  input: unknown,
): Promise<{ ok: true; username: string; tempPassword: string } | { ok: false; error: string }> {
  const me = await requirePermission('user.manage');
  const parsed = newStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };

  const db = await tenantDb();
  const tenantId = await currentTenantId();

  const clash = await db.user.findFirst({ where: { username: parsed.data.username }, select: { id: true } });
  if (clash) return { ok: false, error: `The username "${parsed.data.username}" is already taken.` };

  const tempPassword = temporaryPassword();
  const user = await db.user.create({
    data: {
      tenantId,
      fullName: parsed.data.fullName,
      username: parsed.data.username,
      phone: parsed.data.phone ?? null,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      roleId: parsed.data.roleId,
      branchId: parsed.data.branchId ?? null,
      mustChangePassword: true,
    },
  });
  await db.auditLog.create({
    data: { tenantId, actorId: me.id, entity: 'User', entityId: user.id, action: 'USER_CREATE',
      after: JSON.stringify({ username: user.username, roleId: parsed.data.roleId }) },
  });
  return { ok: true, username: user.username, tempPassword };
}

export async function resetStaffPasswordAction(
  userId: string,
): Promise<{ ok: true; username: string; tempPassword: string } | { ok: false; error: string }> {
  const me = await requirePermission('user.manage');
  const db = await tenantDb();
  const tenantId = await currentTenantId();

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (!user) return { ok: false, error: 'User not found.' };

  const tempPassword = temporaryPassword();
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
  });
  await db.auditLog.create({
    data: { tenantId, actorId: me.id, entity: 'User', entityId: user.id, action: 'PASSWORD_RESET' },
  });
  return { ok: true, username: user.username, tempPassword };
}

/**
 * Staff who leave are deactivated, not deleted: their name is attached to every
 * result they entered and every payment they took, and that trail has to survive.
 */
export async function setStaffActiveAction(
  userId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requirePermission('user.manage');
  if (userId === me.id) return { ok: false, error: 'You cannot deactivate your own account.' };

  const db = await tenantDb();
  const tenantId = await currentTenantId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: { select: { name: true, permissions: { select: { permission: { select: { code: true } } } } } } },
  });
  if (!user) return { ok: false, error: 'User not found.' };

  // Never leave the lab with nobody who can manage users.
  if (!isActive) {
    const others = await db.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        role: { permissions: { some: { permission: { code: 'user.manage' } } } },
      },
    });
    if (others === 0) {
      return { ok: false, error: 'This is the last active account that can manage users.' };
    }
  }

  await db.user.update({ where: { id: userId }, data: { isActive } });
  await db.auditLog.create({
    data: { tenantId, actorId: me.id, entity: 'User', entityId: userId,
      action: isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE' },
  });
  return { ok: true };
}
