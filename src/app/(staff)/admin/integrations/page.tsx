import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { integrationsStatusAction } from '@/modules/delivery/delivery.actions';
import { IntegrationsClient } from './IntegrationsClient';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  if (!(await can('admin.manage')) && !(await can('settings.manage'))) return <AccessDenied area="admin" />;
  return <IntegrationsClient status={await integrationsStatusAction()} />;
}
