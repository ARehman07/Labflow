import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listRateGroupsAction } from '@/modules/pricing/pricing.actions';
import { RateGroupsClient } from './RateGroupsClient';

export default async function RateGroupsPage() {
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  return <RateGroupsClient initial={await listRateGroupsAction(true)} />;
}
