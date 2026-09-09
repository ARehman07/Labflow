import { BookingClient } from './BookingClient';
import { can } from '@/core/rbac/guard';

export default async function ReceptionPage() {
  const allowed = await can('visit.create');
  if (!allowed) {
    return (
      <p className="rounded-lg bg-warn-soft p-4 text-warn-text">
        You do not have permission to create bookings.
      </p>
    );
  }
  return <BookingClient />;
}
