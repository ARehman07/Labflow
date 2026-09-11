import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listPackagesAction } from '@/modules/pricing/pricing.actions';
import { PackagesClient } from './PackagesClient';

export default async function PackagesPage() {
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  return <PackagesClient initial={await listPackagesAction(true)} />;
}
