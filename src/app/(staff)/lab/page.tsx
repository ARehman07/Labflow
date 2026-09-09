import { can } from '@/core/rbac/guard';
import { WorkboardClient } from './WorkboardClient';

export default async function LabPage() {
  const allowed = (await can('result.enter')) || (await can('workflow.advance')) || (await can('result.approve'));
  if (!allowed) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">You do not have access to the lab workboard.</p>;
  }
  return <WorkboardClient />;
}
