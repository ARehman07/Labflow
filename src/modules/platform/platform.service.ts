import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { unscopedPrisma as prisma } from '@/core/db/tenant';
import { deleteTenant } from '@/core/db/tenant-lifecycle';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from '@/core/rbac/permissions';
import { FEATURE_KEYS, parseLocked, type FeatureKey } from '@/core/features/catalog';
import { labAccess, monthsCovered } from '@/core/billing/access';
import { forgetLabAccess } from '@/core/billing/access.server';
import { RESERVED_CODES, tempPassword } from './rules';

export class PlatformError extends Error {}

export interface NewLabInput {
  name: string;
  code: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  ownerName: string;
  ownerUsername: string;
}

const BILLING = { isActive: true, paidUntil: true, graceDays: true, accessOverride: true, overrideUntil: true } as const;

async function record(admin: string, action: string, lab: { id: string | null; code: string }, detail?: unknown) {
  await prisma.platformEvent.create({
    data: { admin, action, labId: lab.id, labCode: lab.code, detail: detail == null ? null : JSON.stringify(detail) },
  });
}

async function labCode(id: string) {
  const lab = await prisma.tenant.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!lab) throw new PlatformError('That lab no longer exists.');
  return lab;
}

/**
 * The platform team's view across labs. Everything here reads and writes
 * across tenants on purpose, so it is reachable only from the platform console.
 */
/** A day as `YYYY-MM-DD` in the server's own time, as it was entered. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const platformService = {
  async listLabs() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, name: true, createdAt: true, planName: true, monthlyFee: true, ...BILLING,
        _count: { select: { users: true, visits: true } },
      },
    });
    const ids = tenants.map((t) => t.id);
    const logins = await prisma.user.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _max: { lastLoginAt: true } });
    const lastLogin = new Map(logins.map((l) => [l.tenantId, l._max.lastLoginAt]));
    return tenants.map((t) => ({
      id: t.id, code: t.code, name: t.name, createdAt: t.createdAt, planName: t.planName, monthlyFee: Number(t.monthlyFee),
      paidUntil: t.paidUntil, access: labAccess(t), users: t._count.users, bookings: t._count.visits,
      lastLoginAt: lastLogin.get(t.id) ?? null,
    }));
  },

  async getLab(id: string) {
    const t = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true, code: true, name: true, createdAt: true, planName: true, monthlyFee: true, maxUsers: true, lockedFeatures: true, ...BILLING,
        _count: { select: { users: true, branches: true, patients: true, visits: true } },
      },
    });
    if (!t) return null;
    const [users, lastBooking, payments, audit, events] = await Promise.all([
      prisma.user.findMany({
        where: { tenantId: id },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true, fullName: true, username: true, isActive: true, mustChangePassword: true, lastLoginAt: true,
          partnerLabId: true, doctorId: true, role: { select: { name: true } },
        },
      }),
      prisma.visit.aggregate({ where: { tenantId: id }, _max: { bookedAt: true } }),
      prisma.labPayment.findMany({ where: { tenantId: id }, orderBy: { paidAt: 'desc' }, take: 24 }),
      prisma.auditLog.findMany({
        where: { tenantId: id }, orderBy: { at: 'desc' }, take: 50,
        select: { id: true, at: true, entity: true, action: true, actor: { select: { fullName: true, username: true } } },
      }),
      prisma.platformEvent.findMany({ where: { labId: id }, orderBy: { at: 'desc' }, take: 30 }),
    ]);
    return {
      ...t,
      monthlyFee: Number(t.monthlyFee),
      access: labAccess(t),
      locked: parseLocked(t.lockedFeatures),
      counts: { users: t._count.users, branches: t._count.branches, patients: t._count.patients, bookings: t._count.visits },
      lastBookingAt: lastBooking._max.bookedAt,
      lastLoginAt: users.reduce<Date | null>((m, u) => (u.lastLoginAt && (!m || u.lastLoginAt > m) ? u.lastLoginAt : m), null),
      activeStaff: users.filter((u) => u.isActive && !u.partnerLabId && !u.doctorId).length,
      users,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      audit,
      events,
    };
  },

  /**
   * A new lab, ready to sign in to: its roles with their default permissions, a
   * first branch, a Cash account for the counter, and an Owner whose password
   * is shown to the platform admin once and must be changed at first sign-in.
   */
  async createLab(input: NewLabInput, admin: string) {
    if (RESERVED_CODES.has(input.code)) throw new PlatformError(`"${input.code}" is reserved. Choose another lab code.`);
    if (await prisma.tenant.findUnique({ where: { code: input.code }, select: { id: true } })) {
      throw new PlatformError(`The lab code "${input.code}" is already taken.`);
    }
    for (const p of ALL_PERMISSIONS) {
      await prisma.permission.upsert({ where: { code: p.code }, update: { label: p.label }, create: { code: p.code, label: p.label } });
    }
    const permissions = await prisma.permission.findMany({ select: { id: true, code: true } });
    const password = tempPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const lab = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { code: input.code, name: input.name } });
        let ownerRoleId = '';
        for (const [roleName, codes] of Object.entries(DEFAULT_ROLES)) {
          const role = await tx.role.create({ data: { tenantId: tenant.id, name: roleName } });
          if (roleName === 'Owner') ownerRoleId = role.id;
          const grant = permissions.filter((p) => (codes as string[]).includes(p.code));
          if (grant.length) await tx.rolePermission.createMany({ data: grant.map((p) => ({ roleId: role.id, permissionId: p.id })) });
        }
        const branch = await tx.branch.create({
          data: { tenantId: tenant.id, name: input.branchName, address: input.branchAddress ?? null, phone: input.branchPhone ?? null },
        });
        await tx.user.create({
          data: {
            tenantId: tenant.id, fullName: input.ownerName, username: input.ownerUsername, passwordHash,
            roleId: ownerRoleId, branchId: branch.id, mustChangePassword: true,
          },
        });
        await tx.paymentAccount.create({ data: { tenantId: tenant.id, name: 'Cash', method: 'CASH' } });
        return tenant;
      });
      await record(admin, 'CREATE', { id: lab.id, code: lab.code }, { name: input.name, owner: input.ownerUsername, branch: input.branchName });
      return { id: lab.id, code: lab.code, ownerUsername: input.ownerUsername, password };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new PlatformError(`The lab code "${input.code}" is already taken.`);
      }
      throw e;
    }
  },

  /** Suspended labs cannot sign in, and anyone already signed in is shown the suspended page. */
  async setActive(id: string, isActive: boolean, admin: string) {
    const lab = await prisma.tenant.update({ where: { id }, data: { isActive }, select: { id: true, code: true } });
    forgetLabAccess(id);
    await record(admin, isActive ? 'REACTIVATE' : 'SUSPEND', lab);
  },

  async updatePlan(id: string, plan: { planName: string | null; monthlyFee: number; graceDays: number; maxUsers: number | null; paidUntil: Date | null }, admin: string) {
    const lab = await labCode(id);
    await prisma.tenant.update({ where: { id }, data: plan });
    forgetLabAccess(id);
    await record(admin, 'PLAN', lab, { ...plan, paidUntil: plan.paidUntil?.toISOString().slice(0, 10) ?? null });
  },

  /**
   * Record a subscription payment for the days the admin picked. The lab's
   * paid-until moves to the end of that period — never back: a payment for a
   * period already covered (say, logging September after setting paid-until
   * to 30 Sept by hand) is recorded without shortening what is paid.
   */
  async recordPayment(id: string, p: { amount: number; from: Date; until: Date; method?: string; reference?: string; note?: string }, admin: string) {
    const lab = await prisma.tenant.findUnique({ where: { id }, select: { id: true, code: true, paidUntil: true } });
    if (!lab) throw new PlatformError('That lab no longer exists.');
    const months = monthsCovered(p.from, p.until);
    const paidUntil = lab.paidUntil && lab.paidUntil > p.until ? lab.paidUntil : p.until;
    await prisma.$transaction([
      prisma.labPayment.create({
        data: {
          tenantId: id, amount: p.amount, months, periodFrom: p.from, periodTo: p.until,
          method: p.method ?? null, reference: p.reference ?? null, note: p.note ?? null, recordedBy: admin,
        },
      }),
      prisma.tenant.update({ where: { id }, data: { paidUntil } }),
    ]);
    forgetLabAccess(id);
    await record(admin, 'PAYMENT', lab, {
      amount: p.amount, months, from: ymd(p.from), until: ymd(p.until), paidUntil: ymd(paidUntil),
    });
    return { from: p.from, to: paidUntil };
  },

  /** Restrict a lab now, keep it open regardless of payment, or go back to following payment. */
  async setOverride(id: string, mode: 'NONE' | 'ACTIVE' | 'READ_ONLY', until: Date | null, admin: string) {
    const lab = await labCode(id);
    await prisma.tenant.update({ where: { id }, data: { accessOverride: mode, overrideUntil: mode === 'ACTIVE' ? until : null } });
    forgetLabAccess(id);
    await record(admin, 'ACCESS', lab, { mode, until: mode === 'ACTIVE' ? until?.toISOString().slice(0, 10) ?? null : null });
  },

  /** The features the lab's plan leaves out. The owner cannot switch these on. */
  async setLockedFeatures(id: string, keys: string[], admin: string) {
    const lab = await labCode(id);
    const locked = [...new Set(keys)].filter((k): k is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(k));
    await prisma.tenant.update({ where: { id }, data: { lockedFeatures: JSON.stringify(locked) } });
    await record(admin, 'FEATURES', lab, { locked });
  },

  async setUserActive(labId: string, userId: string, isActive: boolean, admin: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: labId }, select: { id: true, username: true, tenant: { select: { code: true } } } });
    if (!user) throw new PlatformError('That user was not found in this lab.');
    await prisma.user.update({ where: { id: user.id }, data: { isActive } });
    await record(admin, isActive ? 'USER_ON' : 'USER_OFF', { id: labId, code: user.tenant.code }, { username: user.username });
  },

  /** Any user of the lab — an owner locked out, or a staff account the owner cannot reach. */
  async resetUserPassword(labId: string, userId: string, admin: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: labId },
      select: { id: true, username: true, tenant: { select: { code: true } } },
    });
    if (!user) throw new PlatformError('That user was not found in this lab.');
    const password = tempPassword();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    await record(admin, 'RESET_PASSWORD', { id: labId, code: user.tenant.code }, { username: user.username });
    return { username: user.username, password };
  },

  /**
   * Remove a lab and everything in it. Only a suspended lab, and only when the
   * admin has typed its code — this cannot be undone.
   */
  async removeLab(id: string, typedCode: string, admin: string) {
    const lab = await prisma.tenant.findUnique({ where: { id }, select: { id: true, code: true, isActive: true } });
    if (!lab) throw new PlatformError('That lab no longer exists.');
    if (lab.isActive) throw new PlatformError('Suspend the lab before removing it.');
    if (typedCode.trim().toLowerCase() !== lab.code) throw new PlatformError('Type the lab code exactly to confirm.');
    const report = await deleteTenant(id);
    forgetLabAccess(id);
    await record(admin, 'REMOVE', { id: null, code: lab.code }, { rows: report.total, labId: id });
    return report;
  },
};
