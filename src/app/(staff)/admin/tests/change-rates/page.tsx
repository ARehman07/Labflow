import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { rateChangeService } from '@/modules/pricing/rate-change.service';
import { ChangeRatesClient } from './ChangeRatesClient';

export const dynamic = 'force-dynamic';

export default async function ChangeRatesPage() {
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  return <ChangeRatesClient options={await rateChangeService.options()} />;
}
