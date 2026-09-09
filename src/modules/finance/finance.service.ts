import { tenantDb, currentTenantId } from '@/core/db/context';
import type { LedgerEntryInput } from './finance.schema';

function dayBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export interface FinanceSummary {
  totalCollected: number;
  byMethod: { CASH: number; CARD: number; ONLINE: number };
  refunds: number;
  otherIncome: number;
  expenses: number;
  /** Money in minus money out, whatever form it took. */
  netCash: number;
  /**
   * What should physically be in the till: cash from patients, plus cash
   * income, minus cash expenses, minus refunds. Refunds are assumed to be
   * handed back in cash — Refund carries no method of its own.
   */
  cashInDrawer: number;
  cashExpenses: number;
  cashOtherIncome: number;
}

export interface LedgerRow {
  id: string;
  type: string;
  method: string;
  category: string;
  amount: number;
  note: string | null;
  time: string;
}

export const financeService = {
  async dailySummary(branchId: string, dateStr: string): Promise<FinanceSummary> {
    const { start, end } = dayBounds(dateStr);
    const where = { at: { gte: start, lt: end } };

    const [payments, refunds, ledger] = await Promise.all([
      (await tenantDb()).payment.findMany({ where: { ...where, invoice: { visit: { branchId } } }, select: { amount: true, method: true } }),
      (await tenantDb()).refund.findMany({ where: { ...where, invoice: { visit: { branchId } } }, select: { amount: true } }),
      (await tenantDb()).ledgerEntry.findMany({ where: { ...where, branchId }, select: { type: true, amount: true, method: true } }),
    ]);

    const byMethod = { CASH: 0, CARD: 0, ONLINE: 0 };
    let totalCollected = 0;
    for (const p of payments) {
      const amt = Number(p.amount);
      totalCollected += amt;
      byMethod[p.method as keyof typeof byMethod] += amt;
    }
    const refundTotal = refunds.reduce((s, r) => s + Number(r.amount), 0);
    const sum = (rows: typeof ledger, type: string, cashOnly = false) =>
      rows
        .filter((l) => l.type === type && (!cashOnly || l.method === 'CASH'))
        .reduce((s, l) => s + Number(l.amount), 0);

    const otherIncome = sum(ledger, 'INCOME');
    const expenses = sum(ledger, 'EXPENSE');
    const cashOtherIncome = sum(ledger, 'INCOME', true);
    const cashExpenses = sum(ledger, 'EXPENSE', true);

    return {
      totalCollected,
      byMethod,
      refunds: refundTotal,
      otherIncome,
      expenses,
      netCash: totalCollected + otherIncome - refundTotal - expenses,
      cashInDrawer: byMethod.CASH + cashOtherIncome - refundTotal - cashExpenses,
      cashExpenses,
      cashOtherIncome,
    };
  },

  async listLedger(branchId: string, dateStr: string): Promise<LedgerRow[]> {
    const { start, end } = dayBounds(dateStr);
    const rows = await (await tenantDb()).ledgerEntry.findMany({
      where: { branchId, at: { gte: start, lt: end } },
      orderBy: { at: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      method: r.method,
      category: r.category,
      amount: Number(r.amount),
      note: r.note,
      time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(r.at),
    }));
  },

  async addEntry(branchId: string, input: LedgerEntryInput) {
    return (await tenantDb()).ledgerEntry.create({
      data: { tenantId: await currentTenantId(), branchId, type: input.type, method: input.method, category: input.category, amount: input.amount, note: input.note ?? null },
    });
  },
};
