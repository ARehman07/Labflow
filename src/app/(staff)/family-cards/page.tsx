import { can } from '@/core/rbac/guard';
import { FamilyCardsClient } from './FamilyCardsClient';

export default async function FamilyCardsPage() {
  if (!(await can('patient.manage'))) {
    return (
      <p className="rounded-lg bg-warn-soft p-4 text-warn-text">
        You do not have permission to manage family cards.
      </p>
    );
  }
  return <FamilyCardsClient />;
}
