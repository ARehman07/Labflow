import { can } from '@/core/rbac/guard';
import { listInvoicesAction, getBillingSummaryAction } from '@/modules/billing/billing.actions';
import { BillingClient } from './BillingClient';

export default async function BillingPage() {
  const canView = await can('billing.view');
  if (!canView) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have access to billing.</p>;
  }
  const canRefund = await can('refund.issue');

  // Render the default view (ALL, no search) on the server so the table and the
  // KPI tiles arrive filled in. The client refetches only when the filter or
  // the search box changes.
  const [invoices, summary] = await Promise.all([
    listInvoicesAction('ALL'),
    getBillingSummaryAction(),
  ]);

  return <BillingClient canRefund={canRefund} initialInvoices={invoices} initialSummary={summary} />;
}
