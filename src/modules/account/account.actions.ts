'use server';

import bcrypt from 'bcryptjs';
import { currentUser } from '@/core/rbac/guard';
import { unscopedPrisma as prisma } from '@/core/db/tenant';
import { changePasswordSchema, setPasswordSchema, profileSchema } from './account.schema';

export interface MyAccount {
  fullName: string;
  username: string;
  phone: string | null;
  role: string;
  branchName: string | null;
  tenantName: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

/**
 * Reads by user id from the session, not by any client-supplied id — an account
 * page that takes an id is an account page that reads other people's accounts.
 */
export async function getMyAccountAction(): Promise<MyAccount> {
  const session = await currentUser();
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    include: { role: { select: { name: true } }, branch: { select: { name: true } }, tenant: { select: { name: true } } },
  });
  return {
    fullName: u.fullName,
    username: u.username,
    phone: u.phone,
    role: u.role.name,
    branchName: u.branch?.name ?? null,
    tenantName: u.tenant.name,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  };
}

export async function updateProfileAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await currentUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  await prisma.user.update({
    where: { id: session.id },
    data: { fullName: parsed.data.fullName, phone: parsed.data.phone ?? null },
  });
  return { ok: true };
}

export async function changePasswordAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await currentUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };

  const u = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { id: true, tenantId: true, passwordHash: true },
  });
  // Proving you know the current password is what stops an unattended, unlocked
  // machine from becoming a permanent account takeover.
  const ok = await bcrypt.compare(parsed.data.currentPassword, u.passwordHash);
  if (!ok) return { ok: false, error: 'That is not your current password.' };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), mustChangePassword: false },
    }),
    prisma.auditLog.create({
      data: { tenantId: u.tenantId, actorId: u.id, entity: 'User', entityId: u.id, action: 'PASSWORD_CHANGE' },
    }),
  ]);
  return { ok: true };
}

/**
 * First sign-in after an owner issued a password. Only reachable while the
 * account is flagged, so it cannot be used to skip the current-password check.
 */
export async function setInitialPasswordAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await currentUser();
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };

  const u = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { id: true, tenantId: true, mustChangePassword: true, passwordHash: true },
  });
  if (!u.mustChangePassword) {
    return { ok: false, error: 'Your password has already been set. Use Change password instead.' };
  }
  const same = await bcrypt.compare(parsed.data.newPassword, u.passwordHash);
  if (same) return { ok: false, error: 'Choose something other than the password you were given.' };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), mustChangePassword: false },
    }),
    prisma.auditLog.create({
      data: { tenantId: u.tenantId, actorId: u.id, entity: 'User', entityId: u.id, action: 'PASSWORD_SET' },
    }),
  ]);
  return { ok: true };
}

/** Cheap check for the layout gate; avoids loading the whole account. */
export async function needsPasswordChangeAction(): Promise<boolean> {
  const session = await currentUser();
  const u = await prisma.user.findUnique({
    where: { id: session.id },
    select: { mustChangePassword: true },
  });
  return u?.mustChangePassword ?? false;
}
