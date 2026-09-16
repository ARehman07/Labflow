import { randomUUID } from 'crypto';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { labPolicy } from '@/core/db/lab-policy';
import { billingRepository } from './billing.repository';
import type { RecordPaymentInput, RefundInput, ReversePaymentInput } from './billing.schema';
import { statusFor, statusAfterRefund } from './invoice-status';

type InvoiceFilter = 'ALL' | 'DUE' | 'PAID';

export const billingService = {
  listInvoices: async (branchId: string, filter: InvoiceFilter, query?: string) =>
    billingRepository.listInvoices(branchId, filter, query),

  summary: async (branchId: string) => billingRepository.summary(branchId),

  getInvoice: async (invoiceId: string) => billingRepository.getInvoice(invoiceId),

  /** Record a payment. Amount is clamped to the outstanding balance so an
   *  invoice can never be overpaid. Recomputes the invoice status. */
  async recordPayment(input: RecordPaymentInput, userId: string) {
    const invoice = await (await tenantDb()).invoice.findUnique({
      where: { id: input.invoiceId },
      include: { visit: { include: { doctor: true } } },
    });
    if (!invoice) throw new Error('Invoice not found');

    const net = Number(invoice.netAmount);
    const paid = Number(invoice.paidAmount);
    const remaining = Math.max(0, net - paid);
    if (remaining <= 0) throw new Error('This invoice is already fully paid.');

    const amount = Math.min(input.amount, remaining);
    const newPaid = paid + amount;

    const txId = randomUUID();
    const account = input.accountId
      ? await (await tenantDb()).paymentAccount.findFirst({ where: { id: input.accountId, isActive: true }, select: { id: true, method: true } })
      : null;

    await (await tenantDb()).$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          id: txId, tenantId: await currentTenantId(), invoiceId: invoice.id, amount,
          method: account?.method ?? input.method, accountId: account?.id ?? null, receivedById: userId,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: newPaid, status: statusFor(net, newPaid) },
      });
      // Accrue referring-doctor commission proportional to this payment.
      const doctor = invoice.visit.doctor;
      if (doctor && Number(doctor.commissionPct) > 0) {
        const commission = (amount * Number(doctor.commissionPct)) / 100;
        if (commission > 0) {
          await tx.commission.create({
            data: { tenantId: await currentTenantId(), doctorId: doctor.id, visitId: invoice.visit.id, amount: commission, status: 'ACCRUED' },
          });
        }
      }
      await tx.auditLog.create({
        data: { tenantId: await currentTenantId(),
          actorId: userId,
          entity: 'Invoice',
          entityId: invoice.id,
          action: 'PAYMENT',
          after: JSON.stringify({ amount, method: input.method, paidAmount: newPaid }),
        },
      });
    });

    return { paid: newPaid, status: statusFor(net, newPaid), txId };
  },

  /**
   * Mark dues pending: take back a payment that was recorded but never came
   * in — the counter pressed Paid, the patient walked out without paying.
   *
   * Written as a negative payment rather than a refund. A refund is money
   * handed back; this money never arrived, and every cash total that adds up
   * payments comes out right on its own. It needs refund authority all the
   * same: "take the cash, mark it due, keep the cash" is the refund fraud.
   */
  async reversePayment(input: ReversePaymentInput, userId: string) {
    const db = await tenantDb();
    const invoice = await db.invoice.findUnique({
      where: { id: input.invoiceId },
      include: {
        visit: { include: { doctor: true } },
        payments: { where: { amount: { gt: 0 } }, orderBy: { at: 'desc' }, take: 1, select: { method: true, accountId: true } },
      },
    });
    if (!invoice) throw new Error('Invoice not found');
    const net = Number(invoice.netAmount);
    const paid = Number(invoice.paidAmount);
    if (paid <= 0) throw new Error('Nothing has been paid on this slip.');
    if (input.amount > paid) throw new Error('Cannot mark more as due than has been paid.');
    const newPaid = paid - input.amount;

    const account = input.accountId
      ? await db.paymentAccount.findFirst({ where: { id: input.accountId }, select: { id: true, method: true } })
      : null;
    const last = invoice.payments[0];
    const txId = randomUUID();
    const tenantId = await currentTenantId();

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          id: txId, tenantId, invoiceId: invoice.id, amount: -input.amount,
          method: account?.method ?? last?.method ?? 'CASH',
          accountId: account?.id ?? last?.accountId ?? null,
          receivedById: userId,
          note: input.reason,
        },
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: newPaid, status: statusFor(net, newPaid) } });
      // Commission accrued on the payment comes back out with it.
      const doctor = invoice.visit.doctor;
      if (doctor && Number(doctor.commissionPct) > 0) {
        const reversal = (input.amount * Number(doctor.commissionPct)) / 100;
        if (reversal > 0) {
          await tx.commission.create({
            data: { tenantId, doctorId: doctor.id, visitId: invoice.visit.id, amount: -reversal, status: 'ACCRUED' },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          tenantId, actorId: userId, entity: 'Invoice', entityId: invoice.id, action: 'PAYMENT_REVERSED',
          after: JSON.stringify({ amount: input.amount, reason: input.reason, paidAmount: newPaid }),
        },
      });
    });
    return { paid: newPaid, status: statusFor(net, newPaid), txId };
  },

  /**
   * One money movement on a slip, laid out for a printed receipt: what the bill
   * was, what had been paid before it, this amount, and what is still owed after.
   */
  async getReceipt(kind: 'payment' | 'refund', id: string) {
    const db = await tenantDb();
    const row = kind === 'payment'
      ? await db.payment.findUnique({ where: { id }, include: { account: { select: { name: true } } } })
      : await db.refund.findUnique({ where: { id }, include: { account: { select: { name: true } } } });
    if (!row) return null;
    const invoice = await db.invoice.findUnique({
      where: { id: row.invoiceId },
      include: {
        payments: { select: { id: true, amount: true, at: true } },
        refunds: { select: { id: true, amount: true, at: true } },
        visit: {
          include: {
            patient: true,
            branch: { include: { tenant: { select: { name: true, tagline: true, logoDataUrl: true, licenseNo: true, email: true } } } },
          },
        },
      },
    });
    if (!invoice) return null;
    const userId = 'receivedById' in row ? row.receivedById : row.approvedById;
    const user = await db.user.findUnique({ where: { id: userId }, select: { fullName: true } });

    // Running total of money held, in the order it moved, read off just after this row.
    const events = [
      ...invoice.payments.map((p) => ({ id: p.id, at: p.at, delta: Number(p.amount) })),
      ...invoice.refunds.map((r) => ({ id: r.id, at: r.at, delta: -Number(r.amount) })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    let running = 0;
    let paidAfter = 0;
    for (const e of events) {
      running += e.delta;
      if (e.id === id) { paidAfter = running; break; }
    }
    const amount = Number(row.amount);
    const delta = kind === 'payment' ? amount : -amount;
    const net = Number(invoice.netAmount);
    const tenant = invoice.visit.branch.tenant;
    return {
      kind: (kind === 'refund' ? 'REFUND' : amount < 0 ? 'DUE' : 'PAYMENT') as 'REFUND' | 'DUE' | 'PAYMENT',
      letterhead: {
        labName: tenant.name, tagline: tenant.tagline, logoDataUrl: tenant.logoDataUrl,
        licenseNo: tenant.licenseNo, email: tenant.email, footerNote: null,
        branchName: invoice.visit.branch.name, branchAddress: invoice.visit.branch.address, branchPhone: invoice.visit.branch.phone,
      },
      visitId: invoice.visit.id,
      slipNo: invoice.visit.slipNo,
      patientName: invoice.visit.patient.fullName,
      mrNo: invoice.visit.patient.mrNo,
      mobile: invoice.visit.patient.mobile,
      at: row.at,
      net,
      amount: Math.abs(amount),
      paidBefore: paidAfter - delta,
      paidAfter,
      account: row.account?.name ?? null,
      method: 'method' in row ? row.method : null,
      note: 'reason' in row ? row.reason : row.note,
      by: user?.fullName ?? null,
    };
  },

  /** Issue a refund against the amount already paid. */
  async issueRefund(input: RefundInput, userId: string, opts: { overrideWindow?: boolean } = {}) {
    const invoice = await (await tenantDb()).invoice.findUnique({
      where: { id: input.invoiceId },
      include: { visit: { include: { doctor: true } } },
    });
    if (!invoice) throw new Error('Invoice not found');

    // The refund window: money handed back long after the visit is a decision
    // for the owner, not the counter.
    if (!opts.overrideWindow) {
      const hours = (await labPolicy()).refundWindowHours;
      if (hours > 0 && Date.now() - invoice.visit.bookedAt.getTime() > hours * 3_600_000) {
        throw new Error(`Refunds close ${hours} ${hours === 1 ? 'hour' : 'hours'} after booking. Ask the lab owner to issue this one.`);
      }
    }

    const net = Number(invoice.netAmount);
    const paid = Number(invoice.paidAmount);
    if (input.amount > paid) throw new Error('Refund cannot exceed the amount paid.');
    const newPaid = paid - input.amount;

    const status = statusAfterRefund(net, paid, input.amount);
    const txId = randomUUID();

    await (await tenantDb()).$transaction(async (tx) => {
      await tx.refund.create({
        data: { tenantId: await currentTenantId(),
          id: txId,
          invoiceId: invoice.id,
          amount: input.amount,
          reason: input.reason ?? null,
          accountId: input.accountId ?? null,
          approvedById: userId,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: newPaid, status },
      });
      // Commission accrued on the way in has to come back out, or the lab pays
      // the referring doctor a cut of money it has already handed back.
      const doctor = invoice.visit.doctor;
      if (doctor && Number(doctor.commissionPct) > 0) {
        const reversal = (input.amount * Number(doctor.commissionPct)) / 100;
        if (reversal > 0) {
          await tx.commission.create({
            data: { tenantId: await currentTenantId(),
              doctorId: doctor.id,
              visitId: invoice.visit.id,
              amount: -reversal,
              status: 'ACCRUED',
            },
          });
        }
      }
      await tx.auditLog.create({
        data: { tenantId: await currentTenantId(),
          actorId: userId,
          entity: 'Invoice',
          entityId: invoice.id,
          action: 'REFUND',
          after: JSON.stringify({ amount: input.amount, reason: input.reason ?? null, paidAmount: newPaid, status }),
        },
      });
    });

    return { txId, paid: newPaid, status };
  },
};
