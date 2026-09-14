import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { CriticalClient } from './CriticalClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function CriticalPage() {
  if (!(await featureOn('lab.critical'))) return <FeatureOff />;
  if (!(await can('critical.manage'))) {
    return (
      <AccessDenied area="critical" />
    );
  }
  return <CriticalClient />;
}
