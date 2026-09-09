import { can } from '@/core/rbac/guard';
import { FinanceClient } from './FinanceClient';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  if (!(await can('finance.view'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have access to finance.</p>;
  }
  const today = new Date().toISOString().slice(0, 10);
  // Viewing the day book and writing to it are different authorities, so the
  // button is hidden rather than shown and then refused.
  const canAddEntry = await can('ledger.manage');
  return <FinanceClient initialDate={today} canAddEntry={canAddEntry} />;
}
