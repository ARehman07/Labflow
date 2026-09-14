import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { listBranchesAction } from '@/modules/admin/admin.actions';
import { listCollectionPointsAction, listRateGroupsAction } from '@/modules/pricing/pricing.actions';
import { CollectionPointsClient } from './CollectionPointsClient';

export default async function CollectionPointsPage() {
  if (!(await featureOn('booking.collectionPoints'))) return <FeatureOff />;
  if (!(await can('admin.manage'))) return <AccessDenied area="admin" />;
  const [points, branches, groups] = await Promise.all([
    listCollectionPointsAction(true), listBranchesAction(), listRateGroupsAction(),
  ]);
  return (
    <CollectionPointsClient
      initial={points}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      rateGroups={groups.map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
