import { can } from '@/core/rbac/guard';
import { WorkboardClient } from './WorkboardClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function LabPage() {
  const allowed = (await can('result.enter')) || (await can('workflow.advance')) || (await can('result.approve'));
  if (!allowed) {
    return <AccessDenied area="lab" />;
  }
  return <WorkboardClient />;
}
