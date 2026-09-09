import { can } from '@/core/rbac/guard';
import { getLabPolicyAction } from '@/modules/settings/settings.actions';
import { PolicyClient } from './PolicyClient';

export const dynamic = 'force-dynamic';

export default async function PolicyPage() {
  if (!(await can('settings.manage'))) {
    return (
      <p className="rounded-lg bg-warn-soft p-4 text-warn-text">
        Only the lab owner can change lab policy.
      </p>
    );
  }
  const policy = await getLabPolicyAction();
  return <PolicyClient initial={policy} />;
}
