import { can } from '@/core/rbac/guard';
import { ApprovalsClient } from './ApprovalsClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function ApprovalsPage() {
  if (!(await can('result.approve'))) {
    return <AccessDenied area="approvals" />;
  }
  return <ApprovalsClient />;
}
