import { BookingClient } from './BookingClient';
import { can } from '@/core/rbac/guard';
import { AccessDenied } from '@/components/ui/AccessDenied';

export default async function ReceptionPage() {
  const allowed = await can('visit.create');
  if (!allowed) {
    return (
      <AccessDenied area="reception" />
    );
  }
  return <BookingClient />;
}
