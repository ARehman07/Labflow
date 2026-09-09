'use server';

import { requirePermission } from '@/core/rbac/guard';
import { financeService, type FinanceSummary, type LedgerRow } from './finance.service';
import { ledgerEntrySchema } from './finance.schema';

export type { FinanceSummary, LedgerRow };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getFinanceAction(
  dateStr?: string,
): Promise<{ summary: FinanceSummary; ledger: LedgerRow[]; date: string }> {
  const user = await requirePermission('finance.view');
  const date = dateStr || today();
  if (!user.branchId) {
    return {
      date,
      summary: {
        totalCollected: 0, byMethod: { CASH: 0, CARD: 0, ONLINE: 0 }, refunds: 0,
        otherIncome: 0, expenses: 0, netCash: 0,
        cashInDrawer: 0, cashExpenses: 0, cashOtherIncome: 0,
      },
      ledger: [],
    };
  }
  const [summary, ledger] = await Promise.all([
    financeService.dailySummary(user.branchId, date),
    financeService.listLedger(user.branchId, date),
  ]);
  return { summary, ledger, date };
}

export async function addLedgerEntryAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission('ledger.manage');
  if (!user.branchId) return { ok: false, error: 'No branch assigned.' };
  const parsed = ledgerEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid entry' };
  await financeService.addEntry(user.branchId, parsed.data);
  return { ok: true };
}
