'use server';

import { requirePermission, can } from '@/core/rbac/guard';
import { billingService } from './billing.service';
import { tenantDb } from '@/core/db/context';
import { messagesService } from '@/modules/messages/messages.service';
import { tellPatientWhenReleasable } from '@/modules/lab/report-ready';
import { money } from '@/modules/messages/templates';
import { recordPaymentSchema, refundSchema, reversePaymentSchema } from './billing.schema';

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

export interface InvoiceDTO {
  id: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  doctorName: string | null;
  date: string;
  gross: number;
  discount: number;
  net: number;
  paid: number;
  balance: number;
  /** Paid beyond the bill — after tests were removed or the booking cancelled. */
  refundDue: number;
  status: string;
  method: string | null; // last payment method, or 'MIXED'
}

export interface BillingSummaryDTO {
  collected: number;
  outstanding: number;
  dueCount: number;
  total: number;
}

export async function getBillingSummaryAction(): Promise<BillingSummaryDTO> {
  const user = await requirePermission('billing.view');
  if (!user.branchId) return { collected: 0, outstanding: 0, dueCount: 0, total: 0 };
  return billingService.summary(user.branchId);
}

export async function listInvoicesAction(
  filter: 'ALL' | 'DUE' | 'PAID',
  query?: string,
): Promise<InvoiceDTO[]> {
  const user = await requirePermission('billing.view');
  if (!user.branchId) return [];
  const invoices = await billingService.listInvoices(user.branchId, filter, query);
  return invoices.map((inv) => {
    const net = Number(inv.netAmount);
    const paid = Number(inv.paidAmount);
    const methods = [...new Set(inv.payments.map((p) => p.method))];
    const method = methods.length === 0 ? null : methods.length === 1 ? methods[0] : 'MIXED';
    return {
      id: inv.id,
      slipNo: inv.visit.slipNo,
      patientName: inv.visit.patient.fullName,
      mrNo: inv.visit.patient.mrNo,
      doctorName: inv.visit.doctor?.name ?? null,
      date: fmtDate(inv.createdAt),
      gross: Number(inv.grossAmount),
      discount: Number(inv.discount),
      net,
      paid,
      balance: Math.max(0, net - paid),
      refundDue: Math.max(0, paid - net),
      status: inv.status,
      method,
    };
  });
}

export interface InvoiceDetailDTO {
  id: string;
  /** The visit, so the drawer can open its slip as a receipt. */
  visitId: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  mobile: string | null;
  doctorName: string | null;
  date: string;
  tests: { name: string }[];
  /** Comments from the counter — often why a discount was given. */
  notes: string | null;
  gross: number;
  discount: number;
  cardFee: number;
  net: number;
  paid: number;
  balance: number;
  /** Paid beyond the bill — after tests were removed or the booking cancelled. */
  refundDue: number;
  status: string;
  /** A negative amount is a payment taken back (dues marked pending); `note` says why. */
  payments: { id: string; amount: number; method: string; date: string; note: string | null }[];
  refunds: { id: string; amount: number; reason: string | null; date: string }[];
}

export async function getInvoiceDetailAction(invoiceId: string): Promise<InvoiceDetailDTO | null> {
  await requirePermission('billing.view');
  const inv = await billingService.getInvoice(invoiceId);
  if (!inv) return null;
  const net = Number(inv.netAmount);
  const paid = Number(inv.paidAmount);
  return {
    id: inv.id,
    visitId: inv.visit.id,
    slipNo: inv.visit.slipNo,
    patientName: inv.visit.patient.fullName,
    mrNo: inv.visit.patient.mrNo,
    mobile: inv.visit.patient.mobile,
    doctorName: inv.visit.doctor?.name ?? null,
    notes: inv.visit.notes ?? null,
    date: fmtDate(inv.createdAt),
    // A test taken off the booking is not on the bill, so it is not listed on it.
    tests: inv.visit.orderLines.filter((l) => l.status !== 'CANCELLED').map((l) => ({ name: l.test.name })),
    gross: Number(inv.grossAmount),
    discount: Number(inv.discount),
    cardFee: Number(inv.familyCardFee ?? 0),
    net,
    paid,
    balance: Math.max(0, net - paid),
      refundDue: Math.max(0, paid - net),
    status: inv.status,
    payments: inv.payments.map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, date: fmtDate(p.at), note: p.note })),
    refunds: inv.refunds.map((r) => ({ id: r.id, amount: Number(r.amount), reason: r.reason, date: fmtDate(r.at) })),
  };
}

export type BillingActionResult =
  | { ok: true; status: string; paid: number; txId?: string }
  | { ok: false; error: string };

export async function recordPaymentAction(input: unknown): Promise<BillingActionResult> {
  const user = await requirePermission('payment.receive');
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payment' };
  try {
    const res = await billingService.recordPayment(parsed.data, user.id);
    await tellPatient('payment', res.txId, user.id);
    // A report held for this bill may go now: its "report ready" goes with it.
    if (res.status === 'PAID') {
      const inv = await (await tenantDb()).invoice.findUnique({ where: { id: parsed.data.invoiceId }, select: { visitId: true } });
      if (inv) await tellPatientWhenReleasable(inv.visitId, user.id).catch(() => {});
    }
    return { ok: true, status: res.status, paid: res.paid, txId: res.txId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Payment failed' };
  }
}

export async function issueRefundAction(input: unknown): Promise<BillingActionResult> {
  const user = await requirePermission('refund.issue');
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid refund' };
  try {
    const res = await billingService.issueRefund(parsed.data, user.id, { overrideWindow: await can('settings.manage') });
    await tellPatient('refund', res.txId, user.id);
    return { ok: true, status: res.status, paid: res.paid, txId: res.txId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Refund failed' };
  }
}

export async function reversePaymentAction(input: unknown): Promise<BillingActionResult> {
  const user = await requirePermission('refund.issue');
  const parsed = reversePaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid entry' };
  try {
    const res = await billingService.reversePayment(parsed.data, user.id);
    return { ok: true, status: res.status, paid: res.paid, txId: res.txId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not mark as due' };
  }
}

/** The patient's SMS for money received or refunded, when the lab has it switched on. */
async function tellPatient(kind: 'payment' | 'refund', txId: string, userId: string) {
  const db = await tenantDb();
  const select = { amount: true, invoice: { select: { visitId: true, netAmount: true, paidAmount: true } } } as const;
  const row = kind === 'payment'
    ? await db.payment.findUnique({ where: { id: txId }, select })
    : await db.refund.findUnique({ where: { id: txId }, select });
  if (!row) return;
  const due = Math.max(0, Number(row.invoice.netAmount) - Number(row.invoice.paidAmount));
  await messagesService.notify(
    kind === 'payment' ? 'PAYMENT_RECEIVED' : 'REFUND_ISSUED',
    row.invoice.visitId,
    { amount: money(Number(row.amount)), due: money(due) },
    userId,
  );
}
