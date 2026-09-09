import { can } from '@/core/rbac/guard';
import { EntityManager } from '../EntityManager';
import { doctorRows, createDoctorAction } from '@/modules/admin/admin.actions';

export default async function DoctorsPage() {
  if (!(await can('admin.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">No access.</p>;
  }
  return (
    <EntityManager
      titleKey="admin.doctors"
      addLabelKey="admin.addDoctor"
      columns={[
        { key: 'name', labelKey: 'admin.name' },
        { key: 'clinic', labelKey: 'admin.clinic' },
        { key: 'commissionPct', labelKey: 'admin.commission' },
      ]}
      fields={[
        { name: 'name', labelKey: 'admin.name' },
        { name: 'clinic', labelKey: 'admin.clinic' },
        { name: 'commissionPct', labelKey: 'admin.commission', type: 'number' },
      ]}
      createAction={createDoctorAction}
      reload={doctorRows}
    />
  );
}
