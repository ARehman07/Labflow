import { can } from '@/core/rbac/guard';
import { CriticalClient } from './CriticalClient';

export default async function CriticalPage() {
  if (!(await can('critical.manage'))) {
    return (
      <p className="rounded-lg bg-warn-soft p-4 text-warn-text">
        You do not have permission to handle critical-result callbacks.
      </p>
    );
  }
  return <CriticalClient />;
}
