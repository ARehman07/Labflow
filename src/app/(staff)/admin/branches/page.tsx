import { can } from '@/core/rbac/guard';
import { EntityManager } from '../EntityManager';
import { branchRows, createBranchAction } from '@/modules/admin/admin.actions';

export default async function BranchesPage() {
  if (!(await can('admin.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">No access.</p>;
  }
  return (
    <EntityManager
      titleKey="admin.branches"
      addLabelKey="admin.addBranch"
      columns={[
        { key: 'name', labelKey: 'admin.name' },
        { key: 'address', labelKey: 'admin.address' },
        { key: 'phone', labelKey: 'admin.phone' },
      ]}
      fields={[
        { name: 'name', labelKey: 'admin.name' },
        { name: 'address', labelKey: 'admin.address' },
        { name: 'phone', labelKey: 'admin.phone' },
      ]}
      createAction={createBranchAction}
      reload={branchRows}
    />
  );
}
