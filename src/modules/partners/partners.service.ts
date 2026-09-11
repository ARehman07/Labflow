import bcrypt from 'bcryptjs';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { statusFor } from '@/modules/billing/invoice-status';
import { temporaryPassword } from '@/core/auth/temp-password';
import { allocateCredit, creditOf } from './allocate';

/** A refusal written for the person at the screen. */
export class PartnerError extends Error {}

type AccountType = 'PREPAID' | 'CASH' | 'POSTPAID';
type Direction = 'INWARD' | 'OUTWARD';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'];

/**
 * B2B partner labs.
 *
 * INWARD partners send samples here. A CASH partner's patients pay at the
 * counter like walk-ins; a PREPAID or POSTPAID partner is billed to its
 * account: its bookings are what it owes, its payments are what it has paid,
 * and payments are applied to its bookings oldest first.
 *
 * OUTWARD partners are reference labs this lab sends tests to.
 */
export const partnersService = {
  async totals(partnerLabId: string) {
    const db = await tenantDb();
    const [invoices, ledger] = await Promise.all([
      db.invoice.findMany({
        where: { visit: { partnerLabId, status: { not: 'CANCELLED' } } },
        select: { netAmount: true, paidAmount: true },
      }),
      db.partnerLedgerEntry.findMany({ where: { partnerLabId }, select: { type: true, amount: true } }),
    ]);
    const billed = invoices.reduce((s, i) => s + Number(i.netAmount), 0);
    const credit = ledger.reduce((s, e) => s + creditOf(e.type, Number(e.amount)), 0);
    return { billed, credit, balance: Math.round((billed - credit) * 100) / 100 };
  },

  async list(includeInactive = true) {
    const db = await tenantDb();
    const rows = await db.partnerLab.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { rateGroup: { select: { name: true } }, _count: { select: { visits: true, outsourcedLines: true } } },
    });
    return Promise.all(rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      direction: r.direction as Direction,
      accountType: r.accountType as AccountType,
      phone: r.phone,
      contactPerson: r.contactPerson,
      email: r.email,
      rateGroupId: r.rateGroupId,
      rateGroupName: r.rateGroup?.name ?? null,
      isActive: r.isActive,
      bookings: r.direction === 'INWARD' ? r._count.visits : r._count.outsourcedLines,
      balance: r.direction === 'INWARD' && r.accountType !== 'CASH' ? (await partnersService.totals(r.id)).balance : 0,
    })));
  },

  async detail(partnerLabId: string) {
    const db = await tenantDb();
    const partner = await db.partnerLab.findUnique({
      where: { id: partnerLabId },
      include: { rateGroup: { select: { name: true } }, users: { select: { id: true, fullName: true, username: true, isActive: true, lastLoginAt: true } } },
    });
    if (!partner) return null;
    const [totals, visits, ledger, outsourced] = await Promise.all([
      partnersService.totals(partnerLabId),
      db.visit.findMany({
        where: { partnerLabId },
        orderBy: { bookedAt: 'desc' },
        take: 200,
        select: {
          id: true, slipNo: true, b2bNo: true, bookedAt: true, status: true,
          patient: { select: { fullName: true, mrNo: true } },
          orderLines: { select: { status: true, test: { select: { name: true } } } },
          invoice: { select: { netAmount: true, paidAmount: true } },
        },
      }),
      db.partnerLedgerEntry.findMany({
        where: { partnerLabId },
        orderBy: { at: 'desc' },
        take: 200,
      }),
      db.orderLine.findMany({
        where: { outsourcedToId: partnerLabId },
        orderBy: { outsourcedAt: 'desc' },
        take: 200,
        select: {
          id: true, status: true, outsourcedAt: true, outsourceRef: true,
          test: { select: { name: true } },
          visit: { select: { id: true, slipNo: true, patient: { select: { fullName: true } } } },
        },
      }),
    ]);
    const accountIds = [...new Set(ledger.map((l) => l.note?.match(/^\[acct:([^\]]+)\]/)?.[1]).filter(Boolean))] as string[];
    const accounts = accountIds.length
      ? new Map((await db.paymentAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]))
      : new Map<string, string>();

    // Statement: bookings are charges, ledger lines are money in or out, in date order with a running balance.
    const lines = [
      ...visits.filter((v) => v.status !== 'CANCELLED' && v.invoice).map((v) => ({
        at: v.bookedAt, kind: 'BOOKING' as const, ref: v.slipNo, text: v.patient.fullName, amount: Number(v.invoice!.netAmount),
      })),
      ...ledger.map((l) => {
        const acct = l.note?.match(/^\[acct:([^\]]+)\]/)?.[1];
        return {
          at: l.at, kind: l.type as string, ref: acct ? accounts.get(acct) ?? '' : '',
          text: (l.note ?? '').replace(/^\[acct:[^\]]+\]\s*/, ''), amount: -creditOf(l.type, Number(l.amount)),
        };
      }),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    let running = 0;
    const statement = lines.map((l) => { running += l.amount; return { ...l, at: l.at.toISOString(), balance: Math.round(running * 100) / 100 }; }).reverse();

    return {
      id: partner.id,
      name: partner.name,
      direction: partner.direction as Direction,
      accountType: partner.accountType as AccountType,
      phone: partner.phone,
      contactPerson: partner.contactPerson,
      email: partner.email,
      rateGroupId: partner.rateGroupId,
      rateGroupName: partner.rateGroup?.name ?? null,
      isActive: partner.isActive,
      totals,
      statement,
      visits: visits.map((v) => ({
        id: v.id, slipNo: v.slipNo, b2bNo: v.b2bNo, bookedAt: v.bookedAt.toISOString(), status: v.status,
        patient: v.patient.fullName, mrNo: v.patient.mrNo,
        tests: v.orderLines.filter((l) => l.status !== 'CANCELLED').map((l) => ({ name: l.test.name, status: l.status })),
        released: v.orderLines.some((l) => RELEASED.includes(l.status)),
        net: v.invoice ? Number(v.invoice.netAmount) : 0,
        paid: v.invoice ? Number(v.invoice.paidAmount) : 0,
      })),
      outsourced: outsourced.map((o) => ({
        id: o.id, status: o.status, sentAt: o.outsourcedAt?.toISOString() ?? null, ref: o.outsourceRef,
        test: o.test.name, visitId: o.visit.id, slipNo: o.visit.slipNo, patient: o.visit.patient.fullName,
      })),
      users: partner.users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null })),
    };
  },

  async save(
    id: string | null,
    input: { name: string; direction: Direction; accountType: AccountType; rateGroupId?: string; phone?: string; contactPerson?: string; email?: string },
  ) {
    const db = await tenantDb();
    const clash = await db.partnerLab.findFirst({ where: { name: input.name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (clash) throw new PartnerError(`A partner lab named "${input.name}" already exists.`);
    const data = {
      name: input.name,
      direction: input.direction,
      accountType: input.direction === 'OUTWARD' ? 'CASH' as const : input.accountType,
      rateGroupId: input.rateGroupId ?? null,
      phone: input.phone ?? null,
      contactPerson: input.contactPerson ?? null,
      email: input.email ?? null,
    };
    if (id) {
      await db.partnerLab.update({ where: { id }, data });
      await partnersService.reconcile(id);
      return id;
    }
    const row = await db.partnerLab.create({ data: { tenantId: await currentTenantId(), ...data }, select: { id: true } });
    return row.id;
  },

  async setActive(id: string, isActive: boolean) {
    await (await tenantDb()).partnerLab.update({ where: { id }, data: { isActive } });
  },

  /**
   * Money in or out of a partner's account. The account it went through is kept
   * on the line so the day's cash can be traced.
   */
  async recordTransaction(
    partnerLabId: string,
    input: { type: 'PAYMENT' | 'TOPUP' | 'REFUND' | 'ADJUSTMENT'; amount: number; accountId?: string; note?: string },
    userId: string,
  ) {
    const db = await tenantDb();
    const partner = await db.partnerLab.findUnique({ where: { id: partnerLabId }, select: { id: true, direction: true, accountType: true } });
    if (!partner || partner.direction !== 'INWARD') throw new PartnerError('Only a partner lab that sends samples has an account.');
    if (input.type !== 'ADJUSTMENT' && input.amount <= 0) throw new PartnerError('Enter an amount greater than zero.');
    const tenantId = await currentTenantId();
    const note = `${input.accountId ? `[acct:${input.accountId}] ` : ''}${input.note ?? ''}`.trim() || null;
    await db.$transaction(async (tx) => {
      const entry = await tx.partnerLedgerEntry.create({
        data: { tenantId, partnerLabId, type: input.type, amount: input.amount, note, createdById: userId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, entity: 'PartnerLab', entityId: partnerLabId, action: `LEDGER_${input.type}`, after: JSON.stringify({ entryId: entry.id, amount: input.amount, accountId: input.accountId ?? null }) },
      });
    });
    await partnersService.reconcile(partnerLabId);
    return partnersService.totals(partnerLabId);
  },

  /** Re-apply everything the partner has paid to its bookings, oldest first. */
  async reconcile(partnerLabId: string) {
    const db = await tenantDb();
    const partner = await db.partnerLab.findUnique({ where: { id: partnerLabId }, select: { accountType: true, direction: true } });
    if (!partner || partner.direction !== 'INWARD' || partner.accountType === 'CASH') return;
    const [ledger, invoices] = await Promise.all([
      db.partnerLedgerEntry.findMany({ where: { partnerLabId }, select: { type: true, amount: true } }),
      db.invoice.findMany({
        where: { visit: { partnerLabId, status: { not: 'CANCELLED' } } },
        orderBy: { visit: { bookedAt: 'asc' } },
        select: { id: true, netAmount: true, paidAmount: true, status: true },
      }),
    ]);
    const credit = ledger.reduce((s, e) => s + creditOf(e.type, Number(e.amount)), 0);
    const paid = allocateCredit(credit, invoices.map((i) => ({ id: i.id, net: Number(i.netAmount) })));
    for (const inv of invoices) {
      const net = Number(inv.netAmount);
      const newPaid = paid.get(inv.id) ?? 0;
      const status = net === 0 ? 'PAID' : statusFor(net, newPaid);
      if (Math.abs(Number(inv.paidAmount) - newPaid) > 0.001 || inv.status !== status) {
        await db.invoice.update({ where: { id: inv.id }, data: { paidAmount: newPaid, status } });
      }
    }
  },

  // ── Portal logins for partners and doctors ──
  async portalLogins() {
    const rows = await (await tenantDb()).user.findMany({
      where: { OR: [{ partnerLabId: { not: null } }, { doctorId: { not: null } }] },
      orderBy: { fullName: 'asc' },
      select: {
        id: true, fullName: true, username: true, isActive: true, lastLoginAt: true,
        partnerLab: { select: { name: true } }, doctor: { select: { name: true } },
      },
    });
    return rows.map((u) => ({
      id: u.id, fullName: u.fullName, username: u.username, isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      kind: u.partnerLab ? 'PARTNER' as const : 'DOCTOR' as const,
      entityName: u.partnerLab?.name ?? u.doctor?.name ?? '',
    }));
  },

  async createPortalLogin(input: { kind: 'PARTNER' | 'DOCTOR'; entityId: string; username: string; fullName?: string }, actorId: string) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const entity = input.kind === 'PARTNER'
      ? await db.partnerLab.findFirst({ where: { id: input.entityId, direction: 'INWARD' }, select: { id: true, name: true } })
      : await db.doctor.findFirst({ where: { id: input.entityId }, select: { id: true, name: true } });
    if (!entity) throw new PartnerError(input.kind === 'PARTNER' ? 'Choose a partner lab that sends samples.' : 'Choose a doctor.');
    const clash = await db.user.findFirst({ where: { username: input.username }, select: { id: true } });
    if (clash) throw new PartnerError(`The username "${input.username}" is already taken.`);

    const code = input.kind === 'PARTNER' ? 'b2b.portal' : 'doctor.portal';
    const roleName = input.kind === 'PARTNER' ? 'Partner portal' : 'Doctor portal';
    const permission = await db.permission.upsert({
      where: { code },
      update: {},
      create: { code, label: input.kind === 'PARTNER' ? 'Partner lab portal' : 'Doctor portal' },
    });
    const role = await db.role.upsert({
      where: { tenantId_name: { tenantId, name: roleName } },
      update: {},
      create: { tenantId, name: roleName },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
    const branch = await db.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const tempPassword = temporaryPassword();
    const user = await db.user.create({
      data: {
        tenantId,
        fullName: input.fullName?.trim() || entity.name,
        username: input.username,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        roleId: role.id,
        branchId: branch?.id ?? null,
        partnerLabId: input.kind === 'PARTNER' ? entity.id : null,
        doctorId: input.kind === 'DOCTOR' ? entity.id : null,
        mustChangePassword: true,
      },
      select: { id: true, username: true },
    });
    await db.auditLog.create({
      data: { tenantId, actorId, entity: 'User', entityId: user.id, action: 'PORTAL_LOGIN_CREATE', after: JSON.stringify({ kind: input.kind, entityId: entity.id, username: user.username }) },
    });
    return { username: user.username, tempPassword };
  },
};
