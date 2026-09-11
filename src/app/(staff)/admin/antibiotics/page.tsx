import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listAntibioticsAction } from '@/modules/antibiotics/antibiotics.actions';
import { AntibioticsClient } from './AntibioticsClient';

export default async function AntibioticsPage() {
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  return <AntibioticsClient initial={await listAntibioticsAction(true)} />;
}
