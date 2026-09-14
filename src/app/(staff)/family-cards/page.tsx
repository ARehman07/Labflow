import { featureOn } from '@/core/features/features.server';
import { FeatureOff } from '@/components/ui/FeatureOff';
import { can } from '@/core/rbac/guard';
import { FamilyCardsClient } from './FamilyCardsClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function FamilyCardsPage() {
  if (!(await featureOn('booking.familyCards'))) return <FeatureOff />;
  if (!(await can('patient.manage'))) {
    return (
      <AccessDenied area="familyCards" />
    );
  }
  return <FamilyCardsClient />;
}
