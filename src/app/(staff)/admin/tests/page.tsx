import { can } from '@/core/rbac/guard';
import { TestsListClient } from './TestsListClient';

export default async function TestsPage() {
  if (!(await can('admin.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">No access.</p>;
  }
  return <TestsListClient />;
}
