import { can } from '@/core/rbac/guard';
import { FamilyCardsClient } from './FamilyCardsClient';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function FamilyCardsPage() {
  if (!(await can('patient.manage'))) {
    return (
      <AccessDenied area="familyCards" />
    );
  }
  return <FamilyCardsClient />;
}
