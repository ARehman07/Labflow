import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { getLabFeaturesAction } from '@/modules/settings/features.actions';
import { FeaturesClient } from './FeaturesClient';

export const dynamic = 'force-dynamic';

export default async function FeaturesPage() {
  if (!(await can('settings.manage'))) return <AccessDenied area="admin" />;
  return <FeaturesClient initial={await getLabFeaturesAction()} />;
}
