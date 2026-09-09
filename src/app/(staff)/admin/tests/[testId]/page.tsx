import { notFound } from 'next/navigation';
import { can } from '@/core/rbac/guard';
import { getTestAction, listDepartmentsAction } from '@/modules/admin/admin.actions';
import { TestEditor } from './TestEditor';

export default async function TestEditPage({ params }: { params: { testId: string } }) {
  if (!(await can('admin.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">No access.</p>;
  }
  const isNew = params.testId === 'new';
  const [departments, test] = await Promise.all([
    listDepartmentsAction(),
    isNew ? Promise.resolve(null) : getTestAction(params.testId),
  ]);
  if (!isNew && !test) notFound();

  return (
    <TestEditor
      initial={test}
      testId={isNew ? null : params.testId}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
