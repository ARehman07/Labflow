import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { NotifiableClient } from './NotifiableClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function NotifiablePage() {
  if (!(await featureOn('lab.notifiable'))) return <FeatureOff />;
  if (!(await can('notifiable.manage'))) {
    return (
      <AccessDenied area="notifiable" />
    );
  }
  return <NotifiableClient />;
}
