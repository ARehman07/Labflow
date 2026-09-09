import { can } from '@/core/rbac/guard';
import { EntityManager } from '../EntityManager';
import { departmentRows, createDepartmentAction } from '@/modules/admin/admin.actions';

export default async function DepartmentsPage() {
  if (!(await can('admin.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">No access.</p>;
  }
  return (
    <EntityManager
      titleKey="admin.departments"
      addLabelKey="admin.addDepartment"
      columns={[{ key: 'name', labelKey: 'admin.name' }, { key: 'testCount', labelKey: 'admin.testCount' }]}
      fields={[{ name: 'name', labelKey: 'admin.name' }]}
      createAction={createDepartmentAction}
      reload={departmentRows}
    />
  );
}
