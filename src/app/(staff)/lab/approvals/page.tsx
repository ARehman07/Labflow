import { can } from '@/core/rbac/guard';
import { ApprovalsClient } from './ApprovalsClient';

export default async function ApprovalsPage() {
  if (!(await can('result.approve'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have permission to approve results.</p>;
  }
  return <ApprovalsClient />;
}
