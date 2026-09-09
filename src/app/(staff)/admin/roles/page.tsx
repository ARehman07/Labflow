import { can } from '@/core/rbac/guard';
import { getRoleMatrixAction } from '@/modules/roles/roles.actions';
import { RolesClient } from './RolesClient';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  if (!(await can('user.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You cannot manage roles.</p>;
  }
  const matrix = await getRoleMatrixAction();
  return <RolesClient initial={matrix} />;
}
