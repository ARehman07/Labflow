import { can } from '@/core/rbac/guard';
import { getRoleMatrixAction } from '@/modules/roles/roles.actions';
import { RolesClient } from './RolesClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  if (!(await can('user.manage'))) {
    return <AccessDenied area="roles" />;
  }
  const matrix = await getRoleMatrixAction();
  return <RolesClient initial={matrix} />;
}
