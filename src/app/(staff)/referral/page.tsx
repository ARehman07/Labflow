import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { ReferralClient } from './ReferralClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function ReferralPage() {
  if (!(await featureOn('money.referrals'))) return <FeatureOff />;
  if (!(await can('finance.view'))) {
    return <AccessDenied area="referral" />;
  }
  const canManage = await can('admin.manage');
  // Settling a payable is money out, so the button is hidden unless they can do it.
  const canSettle = await can('refund.issue');
  return <ReferralClient canManage={canManage} canSettle={canSettle} />;
}
