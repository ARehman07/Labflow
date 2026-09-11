import { can } from '@/core/rbac/guard';
import { CriticalClient } from './CriticalClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function CriticalPage() {
  if (!(await can('critical.manage'))) {
    return (
      <AccessDenied area="critical" />
    );
  }
  return <CriticalClient />;
}
