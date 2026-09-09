import { tenantDb, currentTenantId } from '@/core/db/context';
import { billingRepository } from './billing.repository';
import type { RecordPaymentInput, RefundInput } from './billing.schema';
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

    await (await tenantDb()).$transaction(async (tx) => {
      await tx.payment.create({
        data: { tenantId: await currentTenantId(), invoiceId: invoice.id, amount, method: input.method, receivedById: userId },
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

    return { paid: newPaid, status: statusFor(net, newPaid) };
  },

  /** Issue a refund against the amount already paid. */
  async issueRefund(input: RefundInput, userId: string) {
    const invoice = await (await tenantDb()).invoice.findUnique({
      where: { id: input.invoiceId },
      include: { visit: { include: { doctor: true } } },
    });
    if (!invoice) throw new Error('Invoice not found');

    const net = Number(invoice.netAmount);
    const paid = Number(invoice.paidAmount);
    if (input.amount > paid) throw new Error('Refund cannot exceed the amount paid.');
    const newPaid = paid - input.amount;

    const status = statusAfterRefund(net, paid, input.amount);

    await (await tenantDb()).$transaction(async (tx) => {
      await tx.refund.create({
        data: { tenantId: await currentTenantId(),
          invoiceId: invoice.id,
          amount: input.amount,
          reason: input.reason ?? null,
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

    return { paid: newPaid, status };
  },
};
