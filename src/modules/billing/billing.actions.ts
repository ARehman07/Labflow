'use server';

import { requirePermission } from '@/core/rbac/guard';
import { billingService } from './billing.service';
import { recordPaymentSchema, refundSchema } from './billing.schema';

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
      status: inv.status,
      method,
    };
  });
}

export interface InvoiceDetailDTO {
  id: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  mobile: string | null;
  doctorName: string | null;
  date: string;
  tests: { name: string }[];
  gross: number;
  discount: number;
  cardFee: number;
  net: number;
  paid: number;
  balance: number;
  status: string;
  payments: { amount: number; method: string; date: string }[];
  refunds: { amount: number; reason: string | null; date: string }[];
}

export async function getInvoiceDetailAction(invoiceId: string): Promise<InvoiceDetailDTO | null> {
  await requirePermission('billing.view');
  const inv = await billingService.getInvoice(invoiceId);
  if (!inv) return null;
  const net = Number(inv.netAmount);
  const paid = Number(inv.paidAmount);
  return {
    id: inv.id,
    slipNo: inv.visit.slipNo,
    patientName: inv.visit.patient.fullName,
    mrNo: inv.visit.patient.mrNo,
    mobile: inv.visit.patient.mobile,
    doctorName: inv.visit.doctor?.name ?? null,
    date: fmtDate(inv.createdAt),
    tests: inv.visit.orderLines.map((l) => ({ name: l.test.name })),
    gross: Number(inv.grossAmount),
    discount: Number(inv.discount),
    cardFee: Number(inv.familyCardFee ?? 0),
    net,
    paid,
    balance: Math.max(0, net - paid),
    status: inv.status,
    payments: inv.payments.map((p) => ({ amount: Number(p.amount), method: p.method, date: fmtDate(p.at) })),
    refunds: inv.refunds.map((r) => ({ amount: Number(r.amount), reason: r.reason, date: fmtDate(r.at) })),
  };
}

export type BillingActionResult =
  | { ok: true; status: string; paid: number }
  | { ok: false; error: string };

export async function recordPaymentAction(input: unknown): Promise<BillingActionResult> {
  const user = await requirePermission('payment.receive');
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payment' };
  try {
    const res = await billingService.recordPayment(parsed.data, user.id);
    return { ok: true, status: res.status, paid: res.paid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Payment failed' };
  }
}

export async function issueRefundAction(input: unknown): Promise<BillingActionResult> {
  const user = await requirePermission('refund.issue');
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid refund' };
  try {
    const res = await billingService.issueRefund(parsed.data, user.id);
    return { ok: true, status: res.status, paid: res.paid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Refund failed' };
  }
}
