import { can } from '@/core/rbac/guard';
import { listStaffAction } from '@/modules/staff/staff.actions';
import { listRolesAction, listBranchesAction } from '@/modules/admin/admin.actions';
import { StaffClient } from './StaffClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  if (!(await can('user.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">No access.</p>;
  }
  const [staff, roles, branches] = await Promise.all([
    listStaffAction(),
    listRolesAction(),
    listBranchesAction(),
  ]);
  return <StaffClient initial={staff} roles={roles} branches={branches} />;
}
