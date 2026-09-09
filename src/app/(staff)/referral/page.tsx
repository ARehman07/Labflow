import { can } from '@/core/rbac/guard';
import { ReferralClient } from './ReferralClient';

export const dynamic = 'force-dynamic';

export default async function ReferralPage() {
  if (!(await can('finance.view'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have access to referrals.</p>;
  }
  const canManage = await can('admin.manage');
  // Settling a payable is money out, so the button is hidden unless they can do it.
  const canSettle = await can('refund.issue');
  return <ReferralClient canManage={canManage} canSettle={canSettle} />;
}
